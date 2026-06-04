import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/types';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('mine')
  getForUser(@CurrentUser() user: AuthUser, @Query('afterId') afterId?: string) {
    return this.notificationsService.getForUser(user.id, afterId ? Number(afterId) : undefined);
  }
}
