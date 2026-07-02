import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateWorkTripDto } from './dto/create-work-trip.dto';
import type { ReviewWorkTripDto } from './dto/review-work-trip.dto';
import type { UpdateWorkTripHoursDto } from './dto/update-work-trip-hours.dto';

type DbWorkTrip = {
  id: number;
  user_id: number;
  trip_date: string;
  start_time: string;
  end_time: string;
  destination: string | null;
  description: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ADJUSTED';
  manager_comment: string | null;
  decision_at: string | null;
  created_at: string;
  updated_at: string;
};

type DbReviewer = {
  id: number;
};

@Injectable()
export class WorkTripsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: number, dto: CreateWorkTripDto) {
    await this.db.run(
      `INSERT INTO work_trips (user_id, trip_date, start_time, end_time, destination, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')`,
      [userId, dto.tripDate, dto.startTime, dto.endTime, dto.destination ?? null, dto.description ?? null],
    );

    const created = await this.db.get<DbWorkTrip>(
      'SELECT * FROM work_trips WHERE user_id = $1 ORDER BY id DESC LIMIT 1',
      [userId],
    );

    if (created) {
      await this.notifyAdminsAboutPendingTrip(created.id, userId);
    }

    return created;
  }

  getMine(userId: number) {
    return this.db.all<DbWorkTrip>(
      'SELECT * FROM work_trips WHERE user_id = $1 ORDER BY trip_date DESC, start_time DESC',
      [userId],
    );
  }

  async updateHours(tripId: number, userId: number, dto: UpdateWorkTripHoursDto) {
    if (dto.endTime <= dto.startTime) {
      throw new BadRequestException('Godzina zakonczenia musi byc pozniejsza niz godzina rozpoczecia.');
    }

    const row = await this.db.get<DbWorkTrip>('SELECT * FROM work_trips WHERE id = $1', [tripId]);
    if (!row) {
      throw new NotFoundException('Nie znaleziono wyjazdu.');
    }
    if (row.user_id !== userId) {
      throw new BadRequestException('Nie mozna edytowac cudzego wyjazdu.');
    }
    if (!['PENDING', 'REJECTED'].includes(row.status)) {
      throw new BadRequestException('Godziny mozna edytowac tylko dla zgłoszen oczekujacych lub odrzuconych.');
    }

    const nextDestination = dto.destination?.trim();
    const nextDescription = dto.description?.trim();

    await this.db.run(
      `UPDATE work_trips
       SET start_time = $1,
           end_time = $2,
           destination = $3,
           description = $4,
           status = 'PENDING',
           manager_comment = NULL,
           decision_at = NULL,
           updated_at = NOW()
       WHERE id = $5`,
      [
        dto.startTime,
        dto.endTime,
        nextDestination && nextDestination.length > 0 ? nextDestination : null,
        nextDescription && nextDescription.length > 0 ? nextDescription : null,
        tripId,
      ],
    );

    const updated = await this.db.get<DbWorkTrip>('SELECT * FROM work_trips WHERE id = $1', [tripId]);
    if (updated) {
      await this.notifyAdminsAboutPendingTrip(updated.id, userId);
    }

    return updated;
  }

  async review(tripId: number, adminId: number, dto: ReviewWorkTripDto) {
    const row = await this.db.get<DbWorkTrip>('SELECT * FROM work_trips WHERE id = $1', [tripId]);
    if (!row) {
      throw new NotFoundException('Nie znaleziono wyjazdu.');
    }

    const nextStartTime = dto.startTime ?? row.start_time.slice(0, 5);
    const nextEndTime = dto.endTime ?? row.end_time.slice(0, 5);
    if (nextEndTime <= nextStartTime) {
      throw new BadRequestException('Godzina zakonczenia musi byc pozniejsza niz godzina rozpoczecia.');
    }

    await this.db.run(
      `UPDATE work_trips
       SET start_time = $1,
           end_time = $2,
           status = $3,
           manager_comment = $4,
           decision_at = NOW(),
           updated_at = NOW()
       WHERE id = $5`,
      [nextStartTime, nextEndTime, dto.decision, dto.comment ?? null, tripId],
    );

    const eventMap: Record<'APPROVED' | 'REJECTED' | 'ADJUSTED', { event: string; message: string }> = {
      APPROVED: {
        event: 'work.trip.approved',
        message: 'Twoje godziny wyjazdowe zostaly zatwierdzone.',
      },
      REJECTED: {
        event: 'work.trip.rejected',
        message: 'Twoje godziny wyjazdowe zostaly odrzucone.',
      },
      ADJUSTED: {
        event: 'work.trip.adjusted',
        message: 'Administrator skorygowal Twoje godziny wyjazdowe.',
      },
    };

    const mapped = eventMap[dto.decision];
    await this.notifications.createInApp(row.user_id, mapped.event, mapped.message, {
      tripId,
      adminId,
      comment: dto.comment ?? null,
      startTime: nextStartTime,
      endTime: nextEndTime,
    });
    await this.notifications.createEmailFallback(row.user_id, mapped.event, mapped.message, {
      tripId,
      adminId,
      comment: dto.comment ?? null,
      startTime: nextStartTime,
      endTime: nextEndTime,
    });

    return this.db.get<DbWorkTrip>('SELECT * FROM work_trips WHERE id = $1', [tripId]);
  }

  getAll() {
    return this.db.all<DbWorkTrip & { user_name: string; user_email: string }>(
      `SELECT wt.*, u.name AS user_name, u.email AS user_email
       FROM work_trips wt
       JOIN users u ON u.id = wt.user_id
       ORDER BY wt.trip_date DESC, wt.start_time DESC`,
    );
  }

  private async notifyAdminsAboutPendingTrip(tripId: number, employeeId: number): Promise<void> {
    const reviewers = await this.db.all<DbReviewer>(`SELECT id FROM users WHERE role = 'ADMIN'`);

    for (const reviewer of reviewers) {
      await this.notifications.createInApp(
        reviewer.id,
        'work.trip.created',
        'Pojawilo sie nowe zgloszenie godzin wyjazdowych do akceptacji.',
        { tripId, employeeId },
      );
      await this.notifications.createEmailFallback(
        reviewer.id,
        'work.trip.created',
        'Nowe zgloszenie godzin wyjazdowych oczekuje na decyzje.',
        { tripId, employeeId },
      );
    }
  }
}
