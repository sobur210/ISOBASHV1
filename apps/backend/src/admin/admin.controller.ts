import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SystemHealthService } from './system-health.service';

@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly systemHealth: SystemHealthService) {}

  @Get('system-health')
  getSystemHealth() {
    return this.systemHealth.checkAll();
  }
}