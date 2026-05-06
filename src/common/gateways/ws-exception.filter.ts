import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { WEBSOCKET_MESSAGES } from '../constants/messages/websocket.messages';

@Catch(WsException, HttpException, Error)
export class WsExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: WsException | HttpException | Error, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<Socket>();

    let message: string;
    let code: string;

    if (exception instanceof WsException) {
      const error = exception.getError();
      message = typeof error === 'string' ? error : (error as { message: string }).message;
      code = 'WS_ERROR';
    } else if (exception instanceof HttpException) {
      message = exception.message;
      code = 'HTTP_ERROR';
    } else {
      message = WEBSOCKET_MESSAGES.ERROR.INTERNAL;
      code = 'INTERNAL_ERROR';
    }

    client.emit('error', { code, message });
  }
}
