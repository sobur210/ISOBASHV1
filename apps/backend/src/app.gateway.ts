import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: true })
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('Realtime');

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.log(JSON.stringify({ event: 'connect', socketId: client.id }));
  }

  handleDisconnect(client: Socket) {
    this.logger.log(JSON.stringify({ event: 'disconnect', socketId: client.id }));
  }

  @SubscribeMessage('ping')
  handlePing(@MessageBody() data: unknown): { event: string; data: unknown } {
    return { event: 'pong', data: data ?? 'pong' };
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(
    @MessageBody() room: string,
    @ConnectedSocket() client: Socket,
  ): { event: string; room: string } {
    client.join(room);
    return { event: 'joined-room', room };
  }

  @SubscribeMessage('task-created')
  handleTaskCreated(@MessageBody() payload: unknown): { event: string; payload: unknown } {
    this.server.emit('task-created', payload);
    return { event: 'task-created', payload };
  }

  @SubscribeMessage('notification')
  handleNotification(@MessageBody() payload: unknown): { event: string; payload: unknown } {
    this.server.emit('notification', payload);
    return { event: 'notification', payload };
  }
}