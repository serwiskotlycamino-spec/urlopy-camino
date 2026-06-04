import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from './types';

type RequestWithUser = Request & { user?: AuthUser };

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  return request.user;
});
