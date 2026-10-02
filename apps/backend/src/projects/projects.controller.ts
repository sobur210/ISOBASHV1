import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionUser } from '../auth/session.model';
import { FeatureGuard, RequireFeature } from '../shared/config/feature-flags';
import { CreateProjectDto, CreateTaskDto, UpdateProjectDto, UpdateTaskDto } from './dto/project.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(AuthGuard, FeatureGuard)
@RequireFeature('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.projects.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.projects.get(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() body: CreateProjectDto) {
    return this.projects.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateProjectDto,
  ) {
    return this.projects.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.projects.remove(user.id, id);
  }

  @Post(':id/tasks')
  addTask(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateTaskDto,
  ) {
    return this.projects.addTask(user.id, id, body);
  }

  @Patch('tasks/:taskId')
  updateTask(
    @CurrentUser() user: SessionUser,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() body: UpdateTaskDto,
  ) {
    return this.projects.updateTask(user.id, taskId, body);
  }

  @Delete('tasks/:taskId')
  @HttpCode(204)
  removeTask(@CurrentUser() user: SessionUser, @Param('taskId', ParseIntPipe) taskId: number) {
    return this.projects.removeTask(user.id, taskId);
  }
}
