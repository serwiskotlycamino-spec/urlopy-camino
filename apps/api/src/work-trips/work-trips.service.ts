import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { CreateWorkTripDto } from './dto/create-work-trip.dto';

type DbWorkTrip = {
  id: number;
  user_id: number;
  trip_date: string;
  start_time: string;
  end_time: string;
  destination: string | null;
  description: string | null;
  created_at: string;
};

@Injectable()
export class WorkTripsService {
  constructor(private readonly db: DatabaseService) {}

  async create(userId: number, dto: CreateWorkTripDto) {
    await this.db.run(
      `INSERT INTO work_trips (user_id, trip_date, start_time, end_time, destination, description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, dto.tripDate, dto.startTime, dto.endTime, dto.destination ?? null, dto.description ?? null],
    );
    return this.db.get<DbWorkTrip>(
      'SELECT * FROM work_trips WHERE user_id = $1 ORDER BY id DESC LIMIT 1',
      [userId],
    );
  }

  getMine(userId: number) {
    return this.db.all<DbWorkTrip>(
      'SELECT * FROM work_trips WHERE user_id = $1 ORDER BY trip_date DESC, start_time DESC',
      [userId],
    );
  }

  getAll() {
    return this.db.all<DbWorkTrip & { user_name: string; user_email: string }>(
      `SELECT wt.*, u.name AS user_name, u.email AS user_email
       FROM work_trips wt
       JOIN users u ON u.id = wt.user_id
       ORDER BY wt.trip_date DESC, wt.start_time DESC`,
    );
  }
}
