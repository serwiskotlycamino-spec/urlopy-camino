import { Controller, MessageEvent, Query, Sse, UnauthorizedException } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { RealtimeService } from './realtime.service';
import { JwtService } from '../auth/jwt.service';

@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly jwtService: JwtService,
  ) {}

  @Sse('stream')
  stream(@Query('token') token?: string): Observable<MessageEvent> {
    if (!token) {
      throw new UnauthorizedException('Brak tokena realtime.');
    }

    const user = this.jwtService.verify(token);
    const id = Number(user.id);
    return this.realtime.forUser(id).pipe(
      map((event) => ({
        type: event.type,
        data: event.payload,
      })),
    );
  }
}
