import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { LeaveDecisionDto } from './dto/leave-decision.dto';
import { LeaveRequestsService } from './leave-requests.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/types';

@Controller('leave-requests')
@UseGuards(AuthGuard, RolesGuard)
export class LeaveRequestsController {
  constructor(private readonly leaveRequestsService: LeaveRequestsService) {}

  @Roles('EMPLOYEE')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateLeaveRequestDto) {
    return this.leaveRequestsService.create({ ...body, userId: user.id });
  }

  @Roles('EMPLOYEE')
  @Get('mine')
  getMine(@CurrentUser() user: AuthUser) {
    return this.leaveRequestsService.getMine(user.id);
  }

  @Roles('MANAGER', 'ADMIN')
  @Get('pending')
  getPending(@CurrentUser() user: AuthUser) {
    return this.leaveRequestsService.getPendingForManager(user.id);
  }

  @Roles('MANAGER', 'ADMIN')
  @Patch(':id/decision')
  decide(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() body: LeaveDecisionDto) {
    return this.leaveRequestsService.decide(Number(id), user.id, body.decision, body.comment);
  }
}
