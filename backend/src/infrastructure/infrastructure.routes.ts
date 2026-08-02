import { Router } from 'express';
import * as transactionController from './transaction.controller.js';
import * as p2pController from './p2p.controller.js';
import { authenticate as requireAuth } from '../auth/auth.middleware.js'; // Assuming basic auth is needed

const router = Router();

// Protect endpoints with basic auth if necessary, or just leave open for simulation
// router.use(requireAuth); // Depending on architecture, uncomment if auth is mandatory

// Transaction Visualizer Routes
router.get('/transactions', transactionController.getTransactions);
router.post('/transactions', transactionController.createTransaction);

// P2P Network Simulator Routes
router.get('/p2p/nodes', p2pController.getNodes);
router.post('/p2p/nodes', p2pController.addNode);
router.get('/p2p/messages/:nodeId', p2pController.getMessages);
router.post('/p2p/messages/broadcast', p2pController.broadcastMessage);

export default router;
