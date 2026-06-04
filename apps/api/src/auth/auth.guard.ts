import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from './jwt.service';
import type { AuthUser } from './types';

type RequestWithUser = Request & {
  user?: AuthUser;
  headers: Record<string, string | string[] | undefined>;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;

    if (!header || Array.isArray(header)) {
      throw new UnauthorizedException('Brak naglowka Authorization.');
    }

    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Nieprawidlowy format tokenu.');
    }

    request.user = this.jwtService.verify(token);
    return true;
  }
}
