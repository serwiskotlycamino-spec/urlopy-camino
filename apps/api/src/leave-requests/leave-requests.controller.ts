import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { LeaveDecisionDto } from './dto/leave-decision.dto';
import { UpdateLeaveRequestDto } from './dto/update-leave-request.dto';
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

  @Roles('EMPLOYEE', 'ADMIN')
  @Get('mine')
  getMine(@CurrentUser() user: AuthUser) {
    return this.leaveRequestsService.getMine(user.id);
  }

  @Roles('EMPLOYEE')
  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.leaveRequestsService.cancel(Number(id), user.id);
  }

  @Roles('EMPLOYEE')
  @Patch(':id')
  updateMine(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() body: UpdateLeaveRequestDto) {
    return this.leaveRequestsService.updateMine(Number(id), user.id, body);
  }

  @Roles('ADMIN')
  @Get('pending')
  getPending(@CurrentUser() user: AuthUser) {
    return this.leaveRequestsService.getPendingForAdmin(user.id);
  }

  @Roles('ADMIN')
  @Get('all')
  getAll(@CurrentUser() user: AuthUser) {
    return this.leaveRequestsService.getAllForAdmin(user.id);
  }

  @Roles('ADMIN')
  @Patch(':id/decision')
  decide(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() body: LeaveDecisionDto) {
    return this.leaveRequestsService.decide(Number(id), user.id, body.decision, body.comment);
  }

  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @Delete(':id/admin')
  deleteForAdmin(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.leaveRequestsService.deleteForAdmin(user.id, Number(id));
  }
}
