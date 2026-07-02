import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CreateWorkTripDto } from './dto/create-work-trip.dto';
import { ReviewWorkTripDto } from './dto/review-work-trip.dto';
import { UpdateWorkTripHoursDto } from './dto/update-work-trip-hours.dto';
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

  @Roles('EMPLOYEE', 'ADMIN')
  @Patch(':id/hours')
  updateHours(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() body: UpdateWorkTripHoursDto) {
    return this.workTripsService.updateHours(Number(id), user.id, body);
  }

  @Roles('ADMIN')
  @Patch(':id/review')
  review(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() body: ReviewWorkTripDto) {
    return this.workTripsService.review(Number(id), user.id, body);
  }

  @Roles('ADMIN')
  @Get('all')
  getAll() {
    return this.workTripsService.getAll();
  }
}
