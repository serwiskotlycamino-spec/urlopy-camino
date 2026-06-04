import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { CurrentUser } from './current-user.decorator';
import type { AuthUser } from './types';
import { DeviceTokenDto } from './dto/device-token.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateMailSettingsDto } from './dto/update-mail-settings.dto';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body.email, body.password);
  }

  @Post('refresh')
  refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refresh(body.refreshToken);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Get('users')
  getUsers() {
    return this.authService.getUsers();
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post('users')
  createUser(@CurrentUser() user: AuthUser, @Body() body: CreateUserDto) {
    return this.authService.createUser(user, body);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('users/:id/role')
  updateUserRole(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateUserRoleDto) {
    return this.authService.updateUserRole(user, Number(id), body);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Patch('users/:id')
  updateUserSettings(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateUserSettingsDto) {
    return this.authService.updateUserSettings(user, Number(id), body);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Get('mail-settings')
  getMailSettings() {
    return this.authService.getMailSettings();
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Put('mail-settings')
  updateMailSettings(@CurrentUser() user: AuthUser, @Body() body: UpdateMailSettingsDto) {
    return this.authService.updateMailSettings(user, body);
  }

  @UseGuards(AuthGuard)
  @Post('device-token')
  async setDeviceToken(@CurrentUser() user: AuthUser, @Body() body: DeviceTokenDto) {
    await this.authService.updateDeviceToken(user.id, body.token);
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @Post('logout')
  async logout(@CurrentUser() user: AuthUser) {
    await this.authService.logoutAllSessions(user.id);
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @Post('logout-session')
  async logoutSession(@CurrentUser() user: AuthUser, @Body() body: RefreshTokenDto) {
    await this.authService.logoutSingleSession(user.id, body.refreshToken);
    return { ok: true };
  }
}
