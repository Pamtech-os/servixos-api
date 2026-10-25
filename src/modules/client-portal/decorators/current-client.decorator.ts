import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ClientRequestUser } from '../interfaces/client-request.interface';

export const CurrentClient = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientRequestUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ clientUser?: ClientRequestUser }>();

    return request.clientUser as ClientRequestUser;
  },
);
