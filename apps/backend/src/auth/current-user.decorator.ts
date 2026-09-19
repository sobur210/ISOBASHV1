import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { SessionUser } from './session.model';

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): SessionUser | undefined => {
  return (context.switchToHttp().getRequest<Request & { user?: SessionUser }>()).user;
});