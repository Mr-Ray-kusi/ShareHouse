import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import routes from './routes/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { telemetryMiddleware } from './services/telemetry.js';
import { ensureSuperAdmin } from './scripts/seedSuperAdmin.js';
import { Invite } from './models/index.js';
import { verifyAccessToken } from './utils/tokens.js';

const app = express();
const server = http.createServer(app);

function corsOrigin(origin, callback) {
  if (!origin) return callback(null, true);
  const normalized = String(origin).replace(/\/+$/, '');
  if (env.frontendOrigins.includes(normalized)) return callback(null, origin);
  return callback(new Error('Not allowed by CORS'));
}

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    credentials: true,
  },
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    socket.user = verifyAccessToken(token);
    next();
  } catch (_err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const tenantId = socket.user?.tenantId;
  if (tenantId) socket.join(`tenant:${tenantId}`);
  if (socket.user?.role === 'super_admin') socket.join('super');
});

app.set('io', io);
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);
app.use(telemetryMiddleware);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: { message: 'Too many sign-in attempts. Try again shortly.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/join', authLimiter);

app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

async function start() {
  await connectDb();
  try {
    await Invite.syncIndexes();
  } catch (err) {
    console.warn('Could not sync invite indexes:', err.message);
  }
  await ensureSuperAdmin();
  server.listen(env.port, () => {
    console.log(`ShareHouse API on port ${env.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
