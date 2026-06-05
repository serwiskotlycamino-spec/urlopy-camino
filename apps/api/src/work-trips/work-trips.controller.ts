import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CreateWorkTripDto } from './dto/create-work-trip.dto';
import { WorkTripsService } from './work-trips.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/types';

@Controller('work-trips')
@UseGuards(AuthGuard, RolesGuard)
export class WorkTripsController {
  constructor(private readonly workTripsService: WorkTripsService) {}

  @Roles('EMPLOYEE', 'ADMIN')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateWorkTripDto) {
    return this.workTripsService.create(user.id, body);
  }

  @Roles('EMPLOYEE', 'ADMIN')
  @Get('mine')
  getMine(@CurrentUser() user: AuthUser) {
    return this.workTripsService.getMine(user.id);
  }

  @Roles('ADMIN')
  @Get('all')
  getAll() {
    return this.workTripsService.getAll();
  }
}
