import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import connectDB from './config/db';
import authRoutes from './routes/authRoutes';
import ticketRoutes from './routes/ticketRoutes';
import qrRoutes from './routes/qrRoutes';
import refundRoutes from './routes/refundRoutes';
import adminRoutes from './routes/adminRoutes';
import tripRoutes from './routes/tripRoutes';
import complaintRoutes from './routes/complaintRoutes';
import rewardRoutes from './routes/rewardRoutes';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Configure trusted reverse proxy (minimum safe configuration for cloud deployments)
app.set('trust proxy', 1);

// CORS Configuration: Supports single origin or comma-separated origins without wildcard
const allowedOrigins: string[] = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. mobile apps, curl, server-to-server) or matched origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy does not allow access from origin ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
};

const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

// Connect to Database
connectDB();

// Middleware
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Make io accessible to our router
app.use((req: any, res, next) => {
  req.io = io;
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/refund', refundRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/rewards', rewardRoutes);

// Health check endpoint (Public, unauthenticated, zero secrets exposed)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Basic Route
app.get('/', (req, res) => {
  res.send('TransitChange Backend API is running');
});

// 404 Handler for unmatched API routes
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint ${req.method} ${req.originalUrl} not found`,
  });
});

// Global Error-Handling Middleware (Catches unhandled errors, returns JSON, no leak in production)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Unhandled Error]', err.message || err);

  const statusCode =
    res.statusCode && res.statusCode !== 200
      ? res.statusCode
      : typeof err.status === 'number' && err.status >= 400 && err.status < 600
        ? err.status
        : 500;

  const isProduction = process.env.NODE_ENV === 'production';
  const safeMessage =
    isProduction && statusCode === 500
      ? 'Internal server error'
      : err.message || 'An unexpected error occurred';

  res.status(statusCode).json({
    success: false,
    message: safeMessage,
    ...(isProduction ? {} : { stack: err.stack }),
  });
});

// Socket.io
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
