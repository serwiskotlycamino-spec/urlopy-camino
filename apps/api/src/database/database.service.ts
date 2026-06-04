import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, type QueryResultRow } from 'pg';
import { hash } from 'bcryptjs';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  async onModuleInit(): Promise<void> {
    this.pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ?? 'postgresql://urlopy_user:urlopy_pass@localhost:5432/urlopy',
    });

    await this.pool.query('SELECT 1');
    await this.initSchema();
    await this.seedUsers();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    await this.pool.query(sql, params);
  }

  async get<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const result = await this.pool.query<T>(sql, params);
    return result.rows[0];
  }

  async all<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query<T>(sql, params);
    return result.rows;
  }

  private async initSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL,
        manager_id INTEGER,
        device_token TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS leave_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        manager_id INTEGER,
        leave_type VARCHAR(30) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        reason TEXT,
        status VARCHAR(20) NOT NULL,
        manager_comment TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        decision_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        channel VARCHAR(20) NOT NULL,
        event VARCHAR(80) NOT NULL,
        message TEXT NOT NULL,
        payload JSONB,
        status VARCHAR(20) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token_hash VARCHAR(128) NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        revoked_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS leave_request_attachments (
        id SERIAL PRIMARY KEY,
        leave_request_id INTEGER NOT NULL,
        uploaded_by INTEGER NOT NULL,
        file_name VARCHAR(180) NOT NULL,
        one_drive_item_id VARCHAR(255) NOT NULL,
        one_drive_web_url TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  }

  private async seedUsers(): Promise<void> {
    const existing = await this.get<{ count: string }>('SELECT COUNT(*) as count FROM users');
    if (Number(existing?.count ?? '0') > 0) {
      return;
    }

    const adminHash = await hash('admin123', 10);
    const managerHash = await hash('szef123', 10);
    const employeeHash = await hash('pracownik123', 10);

    await this.run(
      `
      INSERT INTO users (name, email, password, role, manager_id)
      VALUES
      ($1, $2, $3, $4, NULL),
      ($5, $6, $7, $8, NULL),
      ($9, $10, $11, $12, 2)
    `,
      [
        'Admin',
        'admin@firma.local',
        adminHash,
        'ADMIN',
        'Kierownik',
        'szef@firma.local',
        managerHash,
        'MANAGER',
        'Pracownik',
        'pracownik@firma.local',
        employeeHash,
        'EMPLOYEE',
      ],
    );
  }
}
