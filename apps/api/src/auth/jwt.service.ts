import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import type { AuthUser } from './types';

const ACCESS_TOKEN_EXPIRY = '15m';

@Injectable()
export class JwtService {
  private readonly secret = process.env.JWT_SECRET ?? 'change-me-in-env';

  signAccessToken(user: AuthUser): string {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        managerId: user.managerId,
      },
      this.secret,
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );
  }

  verify(token: string): AuthUser {
    try {
      const decodedUnknown = jwt.verify(token, this.secret) as unknown;
      if (!decodedUnknown || typeof decodedUnknown !== 'object') {
        throw new Error('Invalid token payload');
      }

      const decoded = decodedUnknown as {
        sub: number | string;
        email?: string;
        role?: AuthUser['role'];
        managerId?: number | null;
      };

      if (!decoded.email || !decoded.role) {
        throw new Error('Token payload missing fields');
      }

      return {
        id: Number(decoded.sub),
        email: decoded.email,
        role: decoded.role,
        managerId: decoded.managerId ?? null,
      };
    } catch {
      throw new UnauthorizedException('Nieprawidlowy lub wygasniety token.');
    }
  }
}
