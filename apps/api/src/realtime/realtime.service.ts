import { Injectable } from '@nestjs/common';
import { Observable, Subject, filter } from 'rxjs';

type RealtimeEvent = {
  userId: number;
  type: string;
  payload: Record<string, unknown>;
};

@Injectable()
export class RealtimeService {
  private readonly stream = new Subject<RealtimeEvent>();

  publish(event: RealtimeEvent): void {
    this.stream.next(event);
  }

  forUser(userId: number): Observable<RealtimeEvent> {
    return this.stream.pipe(filter((event) => event.userId === userId));
  }
}
