import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import type { UpdateLeaveRequestDto } from './dto/update-leave-request.dto';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';

type DbUser = {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'EMPLOYEE';
  manager_id: number | null;
};

type DbLeaveRequest = {
  id: number;
  user_id: number;
  manager_id: number | null;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  manager_comment: string | null;
  created_at: string;
  updated_at: string;
  decision_at: string | null;
};

type UsedOnDemandRow = {
  used_days: string;
};

function parseIsoDateToUtc(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

function daysInclusive(start: string, end: string): number {
  const ms = parseIsoDateToUtc(end).getTime() - parseIsoDateToUtc(start).getTime();
  if (ms < 0) {
    return 0;
  }
  return Math.floor(ms / 86400000) + 1;
}

@Injectable()
export class LeaveRequestsService {
  private readonly logger = new Logger(LeaveRequestsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
    private readonly googleCalendar: GoogleCalendarService,
  ) {}

  async create(input: {
    userId: number;
    leaveType: string;
    startDate: string;
    endDate: string;
    reason?: string;
  }) {
    if (new Date(input.endDate).getTime() < new Date(input.startDate).getTime()) {
      throw new BadRequestException('Data zakonczenia nie moze byc wczesniejsza niz data rozpoczecia.');
    }

    const user = await this.db.get<DbUser>('SELECT id, role, manager_id FROM users WHERE id = $1', [
      input.userId,
    ]);

    if (!user || user.role !== 'EMPLOYEE') {
      throw new BadRequestException('Wniosek moze utworzyc tylko pracownik.');
    }

    await this.validateOnDemandLimit(input.userId, input.leaveType, input.startDate, input.endDate);

    await this.db.run(
      `INSERT INTO leave_requests
      (user_id, manager_id, leave_type, start_date, end_date, reason, status, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', NOW())`,
      [
        input.userId,
        user.manager_id,
        input.leaveType,
        input.startDate,
        input.endDate,
        input.reason ?? null,
      ],
    );

    const created = await this.db.get<{ id: number }>(
      'SELECT id FROM leave_requests WHERE user_id = $1 ORDER BY id DESC LIMIT 1',
      [input.userId],
    );

    const reviewers = await this.db.all<Pick<DbUser, 'id'>>(
      `SELECT id FROM users WHERE role = 'ADMIN'`,
    );

    for (const reviewer of reviewers) {
      await this.notifications.createInApp(
        reviewer.id,
        'leave.request.created',
        'Pojawil sie nowy wniosek urlopowy do akceptacji.',
        { requestId: created?.id, employeeId: input.userId },
      );
      await this.notifications.createEmailFallback(
        reviewer.id,
        'leave.request.created',
        'Nowy wniosek urlopowy oczekuje na decyzje.',
        { requestId: created?.id, employeeId: input.userId },
      );
    }

    return this.getById(created?.id ?? 0);
  }

  async getMine(userId: number) {
    return this.db.all<DbLeaveRequest>(
      `SELECT * FROM leave_requests WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
  }

  async getPendingForAdmin(reviewerId: number) {
    const user = await this.db.get<DbUser>('SELECT id, role FROM users WHERE id = $1', [reviewerId]);

    if (!user) {
      throw new NotFoundException('Nie znaleziono uzytkownika.');
    }

    if (user.role !== 'ADMIN') {
      throw new BadRequestException('Liste wnioskow moze pobierac tylko administrator.');
    }

    return this.db.all<DbLeaveRequest & { user_name: string }>(
      `SELECT lr.*, u.name as user_name 
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       WHERE lr.status = 'PENDING'
       ORDER BY lr.created_at DESC`,
    );
  }

  async getAllForAdmin(reviewerId: number) {
    const user = await this.db.get<DbUser>('SELECT id, role FROM users WHERE id = $1', [reviewerId]);

    if (!user) {
      throw new NotFoundException('Nie znaleziono uzytkownika.');
    }

    if (user.role !== 'ADMIN') {
      throw new BadRequestException('Liste wnioskow moze pobierac tylko administrator.');
    }

    return this.db.all<DbLeaveRequest & { user_name: string }>(
      `SELECT lr.*, u.name as user_name 
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       ORDER BY lr.created_at DESC`,
    );
  }

  async createForAdmin(adminId: number, userId: number, dto: CreateLeaveRequestDto) {
    const admin = await this.db.get<DbUser>('SELECT id, role FROM users WHERE id = $1', [adminId]);
    if (!admin || admin.role !== 'ADMIN') {
      throw new BadRequestException('Tworzyc wniosek moze tylko administrator.');
    }

    const user = await this.db.get<DbUser>('SELECT id FROM users WHERE id = $1', [userId]);
    if (!user) {
      throw new NotFoundException('Nie znaleziono użytkownika.');
    }

    if (new Date(dto.endDate).getTime() < new Date(dto.startDate).getTime()) {
      throw new BadRequestException('Data zakonczenia nie moze byc wczesniejsza niz data rozpoczecia.');
    }

    await this.validateOnDemandLimit(userId, dto.leaveType, dto.startDate, dto.endDate);

    await this.db.run(
      `INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, reason, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', NOW(), NOW())`,
      [userId, dto.leaveType, dto.startDate, dto.endDate, dto.reason ?? null],
    );

    const created = await this.db.get<{ id: number }>(
      'SELECT id FROM leave_requests WHERE user_id = $1 ORDER BY id DESC LIMIT 1',
      [userId],
    );

    const requestId = created?.id;
    if (!requestId) {
      throw new NotFoundException('Nie znaleziono nowo utworzonego wniosku.');
    }

    return this.getById(Number(requestId));
  }

  async updateForAdmin(requestId: number, adminId: number, dto: UpdateLeaveRequestDto) {
    const admin = await this.db.get<DbUser>('SELECT id, role FROM users WHERE id = $1', [adminId]);
    if (!admin || admin.role !== 'ADMIN') {
      throw new BadRequestException('Edytowac wniosek moze tylko administrator.');
    }

    const request = await this.getRawById(requestId);
    if (!request) {
      throw new NotFoundException('Nie znaleziono wniosku.');
    }

    if (new Date(dto.endDate).getTime() < new Date(dto.startDate).getTime()) {
      throw new BadRequestException('Data zakonczenia nie moze byc wczesniejsza niz data rozpoczecia.');
    }

    await this.validateOnDemandLimit(request.user_id, dto.leaveType, dto.startDate, dto.endDate, requestId);

    await this.db.run(
      `UPDATE leave_requests
       SET leave_type = $1,
           start_date = $2,
           end_date = $3,
           reason = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [dto.leaveType, dto.startDate, dto.endDate, dto.reason ?? null, requestId],
    );

    const updatedRequest = await this.getById(requestId);
    if (updatedRequest.status === 'APPROVED') {
      await this.syncGoogleCalendarForApprovedRequest(requestId);
    }

    return updatedRequest;
  }

  async deleteForAdmin(adminId: number, requestId: number) {
    const admin = await this.db.get<DbUser>('SELECT id, role FROM users WHERE id = $1', [adminId]);
    if (!admin || admin.role !== 'ADMIN') {
      throw new BadRequestException('Wniosek moze usunac tylko administrator.');
    }

    const request = await this.getRawById(requestId);
    if (!request) {
      throw new NotFoundException('Nie znaleziono wniosku.');
    }

    await this.db.run(
      `UPDATE leave_requests
       SET status = 'CANCELLED',
           manager_comment = COALESCE(manager_comment, 'Anulowano przez administratora'),
           decision_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [requestId],
    );

    await this.removeGoogleCalendarEvent(requestId);

    await this.notifications.createInApp(
      request.user_id,
      'leave.request.cancelled',
      'Twoj wniosek urlopowy zostal anulowany przez administratora.',
      { requestId, adminId },
    );

    await this.notifications.createEmailFallback(
      request.user_id,
      'leave.request.cancelled',
      'Twoj wniosek urlopowy zostal anulowany przez administratora.',
      { requestId, adminId },
    );

    return this.getById(requestId);
  }

  async decide(requestId: number, adminId: number, decision: 'APPROVED' | 'REJECTED' | 'PENDING' | 'CANCELLED', comment?: string) {
    const admin = await this.db.get<DbUser>('SELECT id, role FROM users WHERE id = $1', [adminId]);
    if (!admin || admin.role !== 'ADMIN') {
      throw new BadRequestException('Decyzje moze podjac tylko administrator.');
    }

    const request = await this.getRawById(requestId);
    if (!request) {
      throw new NotFoundException('Nie znaleziono wniosku.');
    }

    await this.db.run(
      `UPDATE leave_requests
       SET status = $1, manager_comment = $2, decision_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [decision, comment ?? null, requestId],
    );

    if (decision === 'APPROVED') {
      await this.syncGoogleCalendarForApprovedRequest(requestId);
    } else {
      await this.removeGoogleCalendarEvent(requestId);
    }

    if (decision === 'PENDING') {
      return this.getById(requestId);
    }

    const eventMap: Record<'APPROVED' | 'REJECTED' | 'CANCELLED', { event: string; message: string }> = {
      APPROVED: {
        event: 'leave.request.approved',
        message: 'Twoj wniosek urlopowy zostal zatwierdzony.',
      },
      REJECTED: {
        event: 'leave.request.rejected',
        message: 'Twoj wniosek urlopowy zostal odrzucony.',
      },
      CANCELLED: {
        event: 'leave.request.cancelled',
        message: 'Twoj wniosek urlopowy zostal anulowany przez administratora.',
      },
    };

    const mapped = eventMap[decision as 'APPROVED' | 'REJECTED' | 'CANCELLED'];

    await this.notifications.createInApp(request.user_id, mapped.event, mapped.message, {
      requestId,
      adminId,
      comment: comment ?? null,
    });

    await this.notifications.createEmailFallback(request.user_id, mapped.event, mapped.message, {
      requestId,
      adminId,
      comment: comment ?? null,
    });

    return this.getById(requestId);
  }

  async cancel(requestId: number, userId: number) {
    const request = await this.getRawById(requestId);
    if (!request) {
      throw new NotFoundException('Nie znaleziono wniosku.');
    }
    if (request.user_id !== userId) {
      throw new BadRequestException('Nie mozna anulowac cudzego wniosku.');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Tylko oczekujace wnioski moga byc anulowane.');
    }
    await this.db.run(
      `UPDATE leave_requests SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
      [requestId],
    );

    await this.removeGoogleCalendarEvent(requestId);
    return this.getById(requestId);
  }

  async updateMine(requestId: number, userId: number, dto: UpdateLeaveRequestDto) {
    const request = await this.getRawById(requestId);
    if (!request) {
      throw new NotFoundException('Nie znaleziono wniosku.');
    }
    if (request.user_id !== userId) {
      throw new BadRequestException('Nie mozna edytowac cudzego wniosku.');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Edytowac mozna tylko wniosek w statusie PENDING.');
    }
    if (dto.expectedUpdatedAt && request.updated_at !== dto.expectedUpdatedAt) {
      throw new BadRequestException('Wniosek zostal zmieniony w miedzyczasie. Odswiez liste i sprobuj ponownie.');
    }
    if (new Date(dto.endDate).getTime() < new Date(dto.startDate).getTime()) {
      throw new BadRequestException('Data zakonczenia nie moze byc wczesniejsza niz data rozpoczecia.');
    }

    await this.validateOnDemandLimit(userId, dto.leaveType, dto.startDate, dto.endDate, requestId);

    await this.db.run(
      `UPDATE leave_requests
       SET leave_type = $1,
           start_date = $2,
           end_date = $3,
           reason = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [dto.leaveType, dto.startDate, dto.endDate, dto.reason ?? null, requestId],
    );

    const updatedRequest = await this.getById(requestId);
    if (updatedRequest.status === 'APPROVED') {
      await this.syncGoogleCalendarForApprovedRequest(requestId);
    }

    return updatedRequest;
  }

  async getById(id: number) {
    const row = await this.getRawById(id);
    if (!row) {
      throw new NotFoundException('Nie znaleziono wniosku.');
    }
    return row;
  }

  private async getRawById(id: number) {
    return this.db.get<DbLeaveRequest>('SELECT * FROM leave_requests WHERE id = $1', [id]);
  }

  private async syncGoogleCalendarForApprovedRequest(requestId: number): Promise<void> {
    try {
      if (!this.googleCalendar.isEnabled()) {
        return;
      }

      const request = await this.db.get<DbLeaveRequest>(
        'SELECT * FROM leave_requests WHERE id = $1 AND status = $2',
        [requestId, 'APPROVED'],
      );
      if (!request) {
        return;
      }

      const user = await this.db.get<Pick<DbUser, 'name' | 'email'>>(
        'SELECT name, email FROM users WHERE id = $1',
        [request.user_id],
      );

      await this.googleCalendar.upsertApprovedLeave({
        leaveRequestId: request.id,
        userName: user?.name ?? `Uzytkownik #${request.user_id}`,
        userEmail: user?.email ?? '-',
        leaveType: request.leave_type,
        startDate: request.start_date,
        endDate: request.end_date,
        reason: request.reason,
        managerComment: request.manager_comment,
      });
    } catch (error) {
      // Nie blokujemy decyzji biznesowej, gdy integracja Google chwilowo nie dziala.
      this.logger.warn(
        `Google Calendar sync failed for approved leave #${requestId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async removeGoogleCalendarEvent(requestId: number): Promise<void> {
    try {
      if (!this.googleCalendar.isEnabled()) {
        return;
      }

      await this.googleCalendar.deleteLeaveEvent(requestId);
    } catch (error) {
      // Nie blokujemy zmiany statusu, gdy usuniecie eventu Google sie nie powiedzie.
      this.logger.warn(
        `Google Calendar delete failed for leave #${requestId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async validateOnDemandLimit(
    userId: number,
    leaveType: string,
    startDate: string,
    endDate: string,
    excludeRequestId?: number,
  ): Promise<void> {
    if (leaveType !== 'ON_DEMAND') {
      return;
    }

    const start = parseIsoDateToUtc(startDate);
    const end = parseIsoDateToUtc(endDate);
    if (start.getUTCFullYear() !== end.getUTCFullYear()) {
      throw new BadRequestException('Urlop na zadanie musi miescic sie w jednym roku kalendarzowym.');
    }

    const requestedDays = daysInclusive(startDate, endDate);
    if (requestedDays <= 0) {
      throw new BadRequestException('Nieprawidlowy zakres dat dla urlopu na zadanie.');
    }

    const year = start.getUTCFullYear();
    const used = await this.db.get<UsedOnDemandRow>(
      `SELECT COALESCE(SUM(end_date::date - start_date::date + 1), 0)::text AS used_days
       FROM leave_requests
       WHERE user_id = $1
         AND leave_type = 'ON_DEMAND'
         AND status IN ('PENDING', 'APPROVED')
         AND EXTRACT(YEAR FROM start_date) = $2
         AND ($3::int IS NULL OR id <> $3)`,
      [userId, year, excludeRequestId ?? null],
    );

    const usedDays = Number(used?.used_days ?? '0');
    if (usedDays + requestedDays > 4) {
      throw new BadRequestException('Limit urlopu na zadanie to 4 dni na rok kalendarzowy.');
    }
  }
}
