import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { CurrentUser } from './current-user.decorator';
import type { AuthUser } from './types';
import { DeviceTokenDto } from './dto/device-token.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

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
