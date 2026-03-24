'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.app = void 0;
const express_1 = __importDefault(require('express'));
const cors_1 = __importDefault(require('cors'));
const dotenv_1 = __importDefault(require('dotenv'));
const auth_routes_1 = __importDefault(require('./routes/auth/auth.routes'));
const learning_routes_1 = __importDefault(
  require('./routes/learning/learning.routes')
);
dotenv_1.default.config();
exports.app = (0, express_1.default)();
const port = process.env.PORT || 8080;
exports.app.use((0, cors_1.default)());
exports.app.use(express_1.default.json());
exports.app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Web3 Student Lab Backend is running' });
});
// API Routes
exports.app.use('/api/auth', auth_routes_1.default);
exports.app.use('/api/learning', learning_routes_1.default);
if (process.env.NODE_ENV !== 'test') {
  exports.app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { requestLogger } from './middleware/requestLogger.js';
import routes from './routes/index.js';
import prisma from './db/index.js';
dotenv.config();
const app = express();
const port = process.env.PORT || 8080;
app.use(cors());
app.use(express.json());
app.use(requestLogger);
// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Web3 Student Lab Backend is running' });
});
// API routes
app.use('/api', routes);
// Graceful shutdown
const server = app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await prisma.$disconnect();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  await prisma.$disconnect();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
//# sourceMappingURL=index.js.map
