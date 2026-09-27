import { SetMetadata } from '@nestjs/common';
import { SessionUser } from './session.model';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: SessionUser['role'][]) => SetMetadata(ROLES_KEY, roles);