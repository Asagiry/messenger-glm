import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import pool from './db/pool';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import messageRoutes from './routes/messages';
import { setupWebSocket } from './ws/handler';

const app = express();
const server = createServer(app);
const PORT = parseInt(process.env.PORT || '80', 10);

const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://glm-messenger.voimaxgm.online',
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);

// Serve React static files
app.use(express.static(CLIENT_DIST));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });
setupWebSocket(wss);

// Start
async function start() {
  try {
    // Test DB connection
    await pool.query('SELECT 1');
    console.log('Database connected');

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
