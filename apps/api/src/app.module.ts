import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database/database.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtService } from './auth/jwt.service';
import { AuthGuard } from './auth/auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { LeaveRequestsController } from './leave-requests/leave-requests.controller';
import { LeaveRequestsService } from './leave-requests/leave-requests.service';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { RealtimeController } from './realtime/realtime.controller';
import { RealtimeService } from './realtime/realtime.service';
import { AttachmentsController } from './attachments/attachments.controller';
import { AttachmentsService } from './attachments/attachments.service';
import { OneDriveService } from './onedrive/onedrive.service';
import { WorkTripsController } from './work-trips/work-trips.controller';
import { WorkTripsService } from './work-trips/work-trips.service';
import { LeaveLimitsController } from './leave-limits/leave-limits.controller';
import { LeaveLimitsService } from './leave-limits/leave-limits.service';
import { GoogleCalendarService } from './google-calendar/google-calendar.service';

@Module({
  imports: [],
  controllers: [
    AppController,
    AuthController,
    LeaveRequestsController,
    NotificationsController,
    RealtimeController,
    AttachmentsController,
    WorkTripsController,
    LeaveLimitsController,
  ],
  providers: [
    AppService,
    DatabaseService,
    AuthService,
    JwtService,
    AuthGuard,
    RolesGuard,
    LeaveRequestsService,
    NotificationsService,
    RealtimeService,
    AttachmentsService,
    OneDriveService,
    WorkTripsService,
    LeaveLimitsService,
    GoogleCalendarService,
  ],
})
export class AppModule {}
