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
    await this.seedSettings();
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

      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(120) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
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

      CREATE TABLE IF NOT EXISTS work_trips (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        trip_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        destination VARCHAR(255),
        description TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        manager_comment TEXT,
        decision_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS leave_limits (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        year INTEGER NOT NULL,
        annual_days INTEGER NOT NULL DEFAULT 26,
        updated_by INTEGER,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, year)
      );

      CREATE TABLE IF NOT EXISTS leave_request_google_events (
        leave_request_id INTEGER PRIMARY KEY,
        google_event_id VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await this.pool.query(`ALTER TABLE work_trips ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'PENDING'`);
    await this.pool.query(`ALTER TABLE work_trips ADD COLUMN IF NOT EXISTS manager_comment TEXT`);
    await this.pool.query(`ALTER TABLE work_trips ADD COLUMN IF NOT EXISTS decision_at TIMESTAMP`);

    // Migracja: usun role MANAGER (zamien na EMPLOYEE).
    await this.pool.query(`UPDATE users SET role = 'EMPLOYEE' WHERE role = 'MANAGER'`);
  }

  private async seedUsers(): Promise<void> {
    const existing = await this.get<{ count: string }>('SELECT COUNT(*) as count FROM users');
    if (Number(existing?.count ?? '0') > 0) {
      return;
    }

    const adminHash = await hash('12345678', 10);
    const employeeHash = await hash('12345678', 10);

    await this.run(
      `
      INSERT INTO users (name, email, password, role, manager_id)
      VALUES
      ($1, $2, $3, $4, NULL),
      ($5, $6, $7, $8, NULL)
    `,
      [
        'Admin',
        'admin@firma.local',
        adminHash,
        'ADMIN',
        'Pracownik',
        'pracownik@firma.local',
        employeeHash,
        'EMPLOYEE',
      ],
    );
  }

  private async seedSettings(): Promise<void> {
    const defaults: Array<{ key: string; value: string | undefined }> = [
      { key: 'communication_mode', value: process.env.COMMUNICATION_MODE ?? 'MULTI' },
      { key: 'mail.smtpHost', value: process.env.SMTP_HOST },
      { key: 'mail.smtpPort', value: process.env.SMTP_PORT },
      { key: 'mail.smtpUser', value: process.env.SMTP_USER },
      { key: 'mail.smtpPass', value: process.env.SMTP_PASS },
      { key: 'mail.smtpFrom', value: process.env.SMTP_FROM },
      { key: 'mail.imapHost', value: process.env.IMAP_HOST },
      { key: 'mail.imapPort', value: process.env.IMAP_PORT },
      { key: 'mail.imapUser', value: process.env.IMAP_USER },
      { key: 'mail.imapPass', value: process.env.IMAP_PASS },
      { key: 'mail.imapSecure', value: process.env.IMAP_SECURE },
    ];

    for (const item of defaults) {
      if (!item.value) {
        continue;
      }

      await this.run(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO NOTHING`,
        [item.key, item.value],
      );
    }
  }
}
