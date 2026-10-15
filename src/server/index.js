import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import 'dotenv/config';
import { getFalkorClient, dbConfig, closeConnection } from './graph/connection.js';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json());

// Basic health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const client = await getFalkorClient();
    res.json({
      status: 'ok',
      service: 'aegisgraph',
      timestamp: new Date().toISOString(),
      falkordb: {
        host: dbConfig.host,
        port: dbConfig.port,
        graph: dbConfig.graphName,
        connected: Boolean(client),
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      service: 'aegisgraph',
      error: error.message,
    });
  }
});

io.on('connection', (socket) => {
  socket.emit('system:connected', {
    message: 'Connected to AegisGraph real-time engine',
    timestamp: new Date().toISOString(),
  });
});

async function startServer() {
  try {
    console.log('📡 Initializing FalkorDB client...');
    await getFalkorClient();
    console.log(`✅ FalkorDB connected at ${dbConfig.host}:${dbConfig.port}`);

    server.listen(PORT, () => {
      console.log(`🚀 AegisGraph server listening on http://localhost:${PORT}`);
      console.log(`⚡ Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('❌ Failed to start AegisGraph server:', err);
    process.exit(1);
  }
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down AegisGraph server...');
  await closeConnection();
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  await closeConnection();
  server.close(() => {
    process.exit(0);
  });
});

// Run directly if this is the main module
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  startServer();
}

export { app, server, io, startServer, closeConnection };
