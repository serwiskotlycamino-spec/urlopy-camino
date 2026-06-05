import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { JwtService } from './jwt.service';
import type { AuthUser } from './types';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserRoleDto } from './dto/update-user-role.dto';
import type { UpdateMailSettingsDto } from './dto/update-mail-settings.dto';
import type { UpdateUserSettingsDto } from './dto/update-user-settings.dto';

type DbUser = {
  id: number;
  name: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'EMPLOYEE';
  manager_id: number | null;
};

type RefreshRow = {
  id: number;
  user_id: number;
  expires_at: string;
  revoked_at: string | null;
};

type UserSummary = {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'EMPLOYEE';
  manager_id: number | null;
};

type AppSettingRow = {
  key: string;
  value: string;
};

type MailSettings = {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapSecure: boolean;
  communicationMode: 'MULTI' | 'EMAIL_ONLY';
  smtpPassConfigured: boolean;
  imapPassConfigured: boolean;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
  ) {}

  getLoginList() {
    return this.db.all<{ id: number; name: string; email: string; role: string }>(
      'SELECT id, name, email, role FROM users ORDER BY name',
    );
  }

  async login(email: string, password: string) {
    const user = await this.db.get<DbUser>('SELECT * FROM users WHERE email = $1', [email]);

    if (!user) {
      throw new UnauthorizedException('Nieprawidlowy email lub haslo.');
    }

    const passwordOk = await this.verifyAndUpgradePassword(user, password);
    if (!passwordOk) {
      throw new UnauthorizedException('Nieprawidlowy email lub haslo.');
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      managerId: user.manager_id,
    };

    const tokens = await this.issueTokens(authUser);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        managerId: user.manager_id,
      },
    };
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const row = await this.db.get<RefreshRow>(
      `SELECT id, user_id, expires_at, revoked_at
       FROM refresh_tokens
       WHERE token_hash = $1`,
      [tokenHash],
    );

    if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token jest niewazny.');
    }

    const user = await this.db.get<DbUser>(
      'SELECT id, email, role, manager_id, name, password FROM users WHERE id = $1',
      [row.user_id],
    );

    if (!user) {
      throw new UnauthorizedException('Uzytkownik dla tokenu nie istnieje.');
    }

    await this.db.run('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [row.id]);

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      managerId: user.manager_id,
    };

    const tokens = await this.issueTokens(authUser);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async getUsers() {
    const rows = await this.db.all<UserSummary>('SELECT id, name, email, role, manager_id FROM users ORDER BY id ASC');
    return rows.map((row) => this.mapUserSummary(row));
  }

  async createUser(actor: AuthUser, input: CreateUserDto) {
    this.ensureCanAssignRole(actor.role, input.role);

    const existing = await this.db.get<{ id: number }>('SELECT id FROM users WHERE email = $1', [input.email]);
    if (existing) {
      throw new BadRequestException('Uzytkownik z takim adresem email juz istnieje.');
    }

    const managerId = await this.resolveManagerId(actor, input.role, input.managerId);
    const passwordHash = await hash(input.password, 10);

    const created = await this.db.get<UserSummary>(
      `INSERT INTO users (name, email, password, role, manager_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, manager_id`,
      [input.name, input.email.toLowerCase(), passwordHash, input.role, managerId],
    );

    if (!created) {
      throw new BadRequestException('Nie udalo sie utworzyc uzytkownika.');
    }

    return this.mapUserSummary(created);
  }

  async updateUserRole(actor: AuthUser, userId: number, input: UpdateUserRoleDto) {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Tylko administrator moze zmieniac uprawnienia.');
    }

    const target = await this.db.get<UserSummary>('SELECT id, name, email, role, manager_id FROM users WHERE id = $1', [
      userId,
    ]);

    if (!target) {
      throw new BadRequestException('Nie znaleziono wskazanego uzytkownika.');
    }

    const managerId = await this.resolveManagerId(actor, input.role, input.managerId);

    const updated = await this.db.get<UserSummary>(
      `UPDATE users
       SET role = $1, manager_id = $2
       WHERE id = $3
       RETURNING id, name, email, role, manager_id`,
      [input.role, managerId, userId],
    );

    if (!updated) {
      throw new BadRequestException('Nie udalo sie zaktualizowac uprawnien.');
    }

    return this.mapUserSummary(updated);
  }

  async updateUserSettings(actor: AuthUser, userId: number, input: UpdateUserSettingsDto) {
    const target = await this.db.get<UserSummary>('SELECT id, name, email, role, manager_id FROM users WHERE id = $1', [
      userId,
    ]);

    if (!target) {
      throw new BadRequestException('Nie znaleziono wskazanego uzytkownika.');
    }

    if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Brak uprawnien do edycji uzytkownika.');
    }

    const nextName = input.name?.trim() || target.name;
    const nextEmail = input.email?.trim().toLowerCase() || target.email;

    if (nextEmail !== target.email) {
      const existing = await this.db.get<{ id: number }>('SELECT id FROM users WHERE email = $1', [nextEmail]);
      if (existing && existing.id !== target.id) {
        throw new BadRequestException('Uzytkownik z takim adresem email juz istnieje.');
      }
    }

    let nextManagerId = target.manager_id;
    if (target.role === 'EMPLOYEE' && input.managerId !== undefined) {
      nextManagerId = input.managerId ?? null;
    }
    if (target.role === 'ADMIN') {
      nextManagerId = null;
    }

    await this.db.run(
      `UPDATE users
       SET name = $1, email = $2, manager_id = $3
       WHERE id = $4`,
      [nextName, nextEmail, nextManagerId, userId],
    );

    if (input.password && input.password.trim().length > 0) {
      const passwordHash = await hash(input.password, 10);
      await this.db.run('UPDATE users SET password = $1 WHERE id = $2', [passwordHash, userId]);
    }

    const updated = await this.db.get<UserSummary>('SELECT id, name, email, role, manager_id FROM users WHERE id = $1', [
      userId,
    ]);

    if (!updated) {
      throw new BadRequestException('Nie udalo sie zaktualizowac ustawien uzytkownika.');
    }

    return this.mapUserSummary(updated);
  }

  async getMailSettings(): Promise<MailSettings> {
    const settings = await this.getSettingsMap();
    const smtpPass = settings['mail.smtpPass'] ?? process.env.SMTP_PASS ?? '';
    const imapPass = settings['mail.imapPass'] ?? process.env.IMAP_PASS ?? '';

    return {
      smtpHost: settings['mail.smtpHost'] ?? process.env.SMTP_HOST ?? '',
      smtpPort: Number(settings['mail.smtpPort'] ?? process.env.SMTP_PORT ?? '0'),
      smtpUser: settings['mail.smtpUser'] ?? process.env.SMTP_USER ?? '',
      smtpFrom: settings['mail.smtpFrom'] ?? process.env.SMTP_FROM ?? '',
      imapHost: settings['mail.imapHost'] ?? process.env.IMAP_HOST ?? '',
      imapPort: Number(settings['mail.imapPort'] ?? process.env.IMAP_PORT ?? '0'),
      imapUser: settings['mail.imapUser'] ?? process.env.IMAP_USER ?? '',
      imapSecure: this.resolveImapSecure(settings['mail.imapSecure'] ?? process.env.IMAP_SECURE),
      communicationMode: this.resolveCommunicationMode(
        settings.communication_mode ?? process.env.COMMUNICATION_MODE,
      ),
      smtpPassConfigured: Boolean(smtpPass),
      imapPassConfigured: Boolean(imapPass),
    };
  }

  async updateMailSettings(actor: AuthUser, input: UpdateMailSettingsDto) {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Brak uprawnien do konfiguracji poczty.');
    }

    const updates: Array<{ key: string; value: string }> = [];
    if (input.smtpHost !== undefined) {
      updates.push({ key: 'mail.smtpHost', value: input.smtpHost.trim() });
    }
    if (input.smtpPort !== undefined) {
      updates.push({ key: 'mail.smtpPort', value: String(input.smtpPort) });
    }
    if (input.smtpUser !== undefined) {
      updates.push({ key: 'mail.smtpUser', value: input.smtpUser.trim() });
    }
    if (input.smtpFrom !== undefined) {
      updates.push({ key: 'mail.smtpFrom', value: input.smtpFrom.trim() });
    }
    if (input.imapHost !== undefined) {
      updates.push({ key: 'mail.imapHost', value: input.imapHost.trim() });
    }
    if (input.imapPort !== undefined) {
      updates.push({ key: 'mail.imapPort', value: String(input.imapPort) });
    }
    if (input.imapUser !== undefined) {
      updates.push({ key: 'mail.imapUser', value: input.imapUser.trim() });
    }
    if (input.imapPass !== undefined && input.imapPass.trim().length > 0) {
      updates.push({ key: 'mail.imapPass', value: input.imapPass });
    }
    if (input.imapSecure !== undefined) {
      updates.push({ key: 'mail.imapSecure', value: input.imapSecure ? '1' : '0' });
    }
    if (input.smtpPass !== undefined && input.smtpPass.trim().length > 0) {
      updates.push({ key: 'mail.smtpPass', value: input.smtpPass });
    }
    if (input.communicationMode !== undefined) {
      updates.push({ key: 'communication_mode', value: input.communicationMode });
    }

    await Promise.all(updates.map((item) => this.upsertSetting(item.key, item.value)));

    return this.getMailSettings();
  }

  async updateDeviceToken(userId: number, token: string): Promise<void> {
    await this.db.run('UPDATE users SET device_token = $1 WHERE id = $2', [token, userId]);
  }

  async logoutAllSessions(userId: number): Promise<void> {
    await this.db.run(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
  }

  async logoutSingleSession(userId: number, refreshToken: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(refreshToken);

    await this.db.run(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE user_id = $1 AND token_hash = $2 AND revoked_at IS NULL`,
      [userId, tokenHash],
    );
  }

  private async verifyAndUpgradePassword(user: DbUser, candidate: string): Promise<boolean> {
    if (user.password.startsWith('$2')) {
      return compare(candidate, user.password);
    }

    if (candidate !== user.password) {
      return false;
    }

    const upgraded = await hash(candidate, 10);
    await this.db.run('UPDATE users SET password = $1 WHERE id = $2', [upgraded, user.id]);
    return true;
  }

  private async issueTokens(user: AuthUser) {
    const accessToken = this.jwt.signAccessToken(user);
    const refreshToken = randomBytes(48).toString('hex');
    const tokenHash = this.hashRefreshToken(refreshToken);

    await this.db.run(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + interval '30 days')`,
      [user.id, tokenHash],
    );

    return { accessToken, refreshToken };
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private ensureCanAssignRole(actorRole: AuthUser['role'], _targetRole: UserSummary['role']): void {
    if (actorRole === 'ADMIN') {
      return;
    }
    throw new ForbiddenException('Brak uprawnien do nadania tej roli.');
  }

  private async resolveManagerId(
    _actor: AuthUser,
    role: UserSummary['role'],
    managerId?: number,
  ): Promise<number | null> {
    if (role !== 'EMPLOYEE') {
      return null;
    }
    return managerId ?? null;
  }

  private mapUserSummary(row: UserSummary) {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      managerId: row.manager_id,
    };
  }

  private async upsertSetting(key: string, value: string): Promise<void> {
    await this.db.run(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, value],
    );
  }

  private async getSettingsMap(): Promise<Record<string, string>> {
    const rows = await this.db.all<AppSettingRow>(
      `SELECT key, value
       FROM app_settings
       WHERE key LIKE 'mail.%' OR key = 'communication_mode'`,
    );

    return rows.reduce<Record<string, string>>((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  }

  private resolveCommunicationMode(raw: string | undefined): 'MULTI' | 'EMAIL_ONLY' {
    return raw?.toUpperCase() === 'EMAIL_ONLY' ? 'EMAIL_ONLY' : 'MULTI';
  }

  private resolveImapSecure(raw: string | undefined): boolean {
    if (!raw) {
      return true;
    }

    const normalized = raw.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
}
