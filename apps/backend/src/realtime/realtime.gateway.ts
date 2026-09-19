import { Injectable, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RealtimeService } from './realtime.service';

@WebSocketGateway({ cors: true })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('Realtime');

  constructor(private readonly realtime: RealtimeService) {}

  @WebSocketServer()
  server!: Server;

  afterInit(server: Server) {
    this.realtime.attach(server);
  }

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