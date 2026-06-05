import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { SetLeaveLimitDto } from './dto/set-leave-limit.dto';
import { LeaveLimitsService } from './leave-limits.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/types';

@Controller('leave-limits')
@UseGuards(AuthGuard, RolesGuard)
export class LeaveLimitsController {
  constructor(private readonly leaveLimitsService: LeaveLimitsService) {}

  @Roles('EMPLOYEE', 'ADMIN')
  @Get('mine')
  getMine(@CurrentUser() user: AuthUser, @Query('year') year?: string) {
    return this.leaveLimitsService.getForUser(user.id, year ? Number(year) : undefined);
  }

  @Roles('ADMIN')
  @Get()
  getAll(@Query('year') year?: string) {
    return this.leaveLimitsService.getAllWithUsage(year ? Number(year) : undefined);
  }

  @Roles('ADMIN')
  @Put(':userId')
  setLimit(
    @Param('userId') userId: string,
    @CurrentUser() updater: AuthUser,
    @Body() body: SetLeaveLimitDto,
  ) {
    return this.leaveLimitsService.set(Number(userId), updater.id, body.annualDays, body.year);
  }
}
