import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { SystemHealthService } from './system-health.service';

@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly systemHealth: SystemHealthService) {}

  @Get('system-health')
  getSystemHealth() {
    return this.systemHealth.checkAll();
  }
}