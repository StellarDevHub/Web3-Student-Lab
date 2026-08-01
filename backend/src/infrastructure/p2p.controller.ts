import { Request, Response } from 'express';
import { P2PService } from './p2p.service.js';

export const getNodes = async (req: Request, res: Response) => {
  try {
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : 'default';
    const nodes = await P2PService.getNodes(workspaceId);
    res.json({ success: true, data: nodes });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const addNode = async (req: Request, res: Response) => {
  try {
    const { workspaceId, nodeName, ipAddress, port } = req.body;
    if (!nodeName) {
      return res.status(400).json({ success: false, error: 'nodeName is required' });
    }
    const node = await P2PService.addNode(workspaceId || 'default', nodeName, ipAddress, port);
    res.status(201).json({ success: true, data: node });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const broadcastMessage = async (req: Request, res: Response) => {
  try {
    const { senderId, receiverId, payload } = req.body;
    if (!senderId || !receiverId || !payload) {
      return res.status(400).json({ success: false, error: 'senderId, receiverId, and payload are required' });
    }
    const message = await P2PService.broadcastMessage(senderId, receiverId, payload);
    res.status(201).json({ success: true, data: message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getMessages = async (req: Request, res: Response) => {
  try {
    const nodeId = typeof req.params.nodeId === 'string' ? req.params.nodeId : undefined;
    if (!nodeId) {
      return res.status(400).json({ success: false, error: 'nodeId is required' });
    }
    const messages = await P2PService.getMessages(nodeId);
    res.json({ success: true, data: messages });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
