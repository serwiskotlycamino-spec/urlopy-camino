import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

type LimitRow = {
  id: number;
  user_id: number;
  year: number;
  annual_days: number;
  updated_by: number | null;
  updated_at: string;
};

type UsedDaysRow = { used_days: string };

@Injectable()
export class LeaveLimitsService {
  constructor(private readonly db: DatabaseService) {}

  async getForUser(userId: number, year?: number) {
    const y = year ?? new Date().getFullYear();
    const row = await this.db.get<LimitRow>(
      'SELECT * FROM leave_limits WHERE user_id = $1 AND year = $2',
      [userId, y],
    );
    const used = await this.db.get<UsedDaysRow>(
      `SELECT COALESCE(SUM(end_date::date - start_date::date + 1), 0)::text AS used_days
       FROM leave_requests
       WHERE user_id = $1 AND status = 'APPROVED' AND EXTRACT(YEAR FROM start_date) = $2`,
      [userId, y],
    );
    const annualDays = row?.annual_days ?? 26;
    const usedDays = Number(used?.used_days ?? 0);
    return { userId, year: y, annualDays, usedDays, remainingDays: Math.max(0, annualDays - usedDays) };
  }

  async getAllWithUsage(year?: number) {
    const y = year ?? new Date().getFullYear();
    const users = await this.db.all<{ id: number; name: string; email: string }>(
      `SELECT id, name, email FROM users WHERE role = 'EMPLOYEE' ORDER BY name`,
    );
    return Promise.all(
      users.map(async (u) => {
        const limit = await this.getForUser(u.id, y);
        return { ...limit, name: u.name, email: u.email };
      }),
    );
  }

  async set(userId: number, updatedBy: number, annualDays: number, year?: number) {
    const y = year ?? new Date().getFullYear();
    await this.db.run(
      `INSERT INTO leave_limits (user_id, year, annual_days, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, year) DO UPDATE
         SET annual_days = EXCLUDED.annual_days,
             updated_by  = EXCLUDED.updated_by,
             updated_at  = NOW()`,
      [userId, y, annualDays, updatedBy],
    );
    return this.getForUser(userId, y);
  }
}
