import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { createChildLogger } from './logger';

const log = createChildLogger('socket');

let io: Server | null = null;

export function initSocketIO(httpServer: HttpServer, corsOrigin: string): Server {
  io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Socket.IO Authentication Middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      log.warn({ socketId: socket.id }, 'Connection attempt without token');
      return next(new Error('Authentication error'));
    }

    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        log.error('JWT_SECRET not configured');
        return next(new Error('Internal server error'));
      }
      const decoded = jwt.verify(token, secret);
      // Store user payload on socket if needed later
      (socket as any).user = decoded;
      next();
    } catch (err) {
      log.warn({ socketId: socket.id, err }, 'Invalid token for socket connection');
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: Socket) => {
    log.info({ socketId: socket.id, user: (socket as any).user?.userId }, 'Client connected');

    socket.on('disconnect', (reason) => {
      log.info({ socketId: socket.id, reason }, 'Client disconnected');
    });

    // Join a room for authenticated user streams
    socket.on('join:user', (userId: string) => {
      socket.join(`user:${userId}`);
      log.debug({ socketId: socket.id, userId }, 'User joined room');
    });
  });

  log.info('Socket.IO initialized');
  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.IO not initialized — call initSocketIO() first');
  }
  return io;
}

// ── Event emitters ─────────────────────────────

export interface RunStartedPayload {
  runId: string;
  source: string;
}

export interface MatchCreatedPayload {
  matchId: string;
  status: string;
  runId: string;
}

export interface DLQItemPayload {
  itemId: string;
  reason: string;
}

export interface ChaosEventPayload {
  type: 'dropped' | 'duplicated' | 'delayed' | 'error';
  count: number;
}

export function emitRunStarted(payload: RunStartedPayload) {
  if (!io) return;
  io.emit('run:started', payload);
  log.debug({ event: 'run:started', ...payload }, 'Emitted run:started');
}

export function emitMatchCreated(payload: MatchCreatedPayload) {
  if (!io) return;
  io.emit('match:created', payload);
}

export function emitDLQItemAdded(payload: DLQItemPayload) {
  if (!io) return;
  io.emit('dlq:item-added', payload);
  log.debug({ event: 'dlq:item-added', ...payload }, 'Emitted dlq:item-added');
}

export function emitChaosEvent(payload: ChaosEventPayload) {
  if (!io) return;
  io.emit('chaos:event', payload);
}

export function emitProgress(runId: string, processed: number, total: number) {
  if (!io) return;
  io.emit('run:progress', { runId, processed, total });
}
