import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { JwtService } from './jwt.service';
import type { AuthUser } from './types';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';

type DbUser = {
  id: number;
  name: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
  manager_id: number | null;
};

type RefreshRow = {
  id: number;
  user_id: number;
  expires_at: string;
  revoked_at: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
  ) {}

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
    return this.db.all<Omit<DbUser, 'password'>>(
      'SELECT id, name, email, role, manager_id FROM users ORDER BY id ASC',
    );
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
}
