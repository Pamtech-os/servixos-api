import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication } from '@nestjs/common';
import { Server as SocketIOServer, ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(app: INestApplication) {
    super(app);
  }

  connectToRedis(params: {
    host: string;
    port: number;
    password?: string;
    tls?: boolean;
  }): void {
    const options = {
      host: params.host,
      port: params.port,
      password: params.password,
      tls: params.tls ? {} : undefined,
      maxRetriesPerRequest: 3,
    };

    const pubClient = new Redis(options);
    const subClient = pubClient.duplicate();

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(
    port: number,
    options?: ServerOptions,
  ): ReturnType<IoAdapter['createIOServer']> {
    const server = super.createIOServer(port, options) as SocketIOServer;
    server.adapter(this.adapterConstructor);
    return server;
  }
}
