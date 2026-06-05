import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';

type DbUser = {
  id: number;
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
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  manager_comment: string | null;
  created_at: string;
  updated_at: string;
  decision_at: string | null;
};

@Injectable()
export class LeaveRequestsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
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
      throw new BadRequestException('Liste oczekujacych moze pobierac tylko administrator.');
    }

    return this.db.all<DbLeaveRequest>(
      `SELECT * FROM leave_requests WHERE status = 'PENDING' ORDER BY created_at DESC`,
    );
  }

  async decide(requestId: number, adminId: number, decision: 'APPROVED' | 'REJECTED', comment?: string) {
    const admin = await this.db.get<DbUser>('SELECT id, role FROM users WHERE id = $1', [adminId]);
    if (!admin || admin.role !== 'ADMIN') {
      throw new BadRequestException('Decyzje moze podjac tylko administrator.');
    }

    const request = await this.getRawById(requestId);
    if (!request) {
      throw new NotFoundException('Nie znaleziono wniosku.');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException('Wniosek zostal juz rozpatrzony.');
    }

    await this.db.run(
      `UPDATE leave_requests
       SET status = $1, manager_comment = $2, decision_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [decision, comment ?? null, requestId],
    );

    const eventName = decision === 'APPROVED' ? 'leave.request.approved' : 'leave.request.rejected';
    const message = decision === 'APPROVED' ? 'Twoj wniosek urlopowy zostal zatwierdzony.' : 'Twoj wniosek urlopowy zostal odrzucony.';

    await this.notifications.createInApp(request.user_id, eventName, message, {
      requestId,
      adminId,
      comment: comment ?? null,
    });

    await this.notifications.createEmailFallback(request.user_id, eventName, message, {
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
    return this.getById(requestId);
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
}
