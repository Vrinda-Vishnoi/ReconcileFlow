import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { getEnv } from './config/env';
import { logger } from './lib/logger';
import { initSocketIO } from './lib/socket';
import { startWorker, closeWorker } from './queue/worker';
import { closeQueue } from './queue/queue';
import { prisma } from './lib/prisma';
import { generalLimiter } from './middleware/rateLimit';
import { requestLogger } from './middleware/requestLogger';

// Routes
import healthRoutes from './routes/health.routes';
import authRoutes from './routes/auth.routes';
import orderRoutes from './routes/order.routes';
import runRoutes from './routes/run.routes';
import matchRoutes from './routes/match.routes';
import dlqRoutes from './routes/dlq.routes';
import auditRoutes from './routes/audit.routes';
import chaosRoutes from './routes/chaos.routes';
import webhookRoutes from './routes/webhook.routes';
import docsRoutes from './routes/docs.routes';

// Validate environment variables first
const env = getEnv();

const app = express();
const server = http.createServer(app);

// ── Webhooks need raw body parsing ──
// Mounted before global json body parser
app.use('/webhooks', webhookRoutes);

// ── Global Middleware ──
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());
app.use(requestLogger);
app.use(generalLimiter);

// ── Mount Routes ──
app.use('/api', healthRoutes); // Includes /api/health
app.use('/metrics', healthRoutes); // Prometheus metrics at /metrics
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/runs', runRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/dlq', dlqRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/chaos', chaosRoutes);
app.use('/api/docs', docsRoutes);

// ── Socket.IO ──
initSocketIO(server, env.CORS_ORIGIN);

// ── Start Worker ──
// In a real distributed deployment, the worker might run in a separate process/container.
// For simplicity in this monolithic structure (and free tier deployment), it runs in the same process.
startWorker();

// ── Server Startup ──
const PORT = env.PORT || 3000;

server.listen(PORT, () => {
  logger.info(
    { port: PORT, env: env.NODE_ENV },
    '🚀 ReconcileFlow API server started'
  );
});

// ── Graceful Shutdown ──
async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down gracefully');
  
  try {
    await closeWorker();
    await closeQueue();
    await prisma.$disconnect();
    
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    
    // Force exit if taking too long
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  } catch (error) {
    logger.error({ err: error }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught Exception');
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Rejection');
});
