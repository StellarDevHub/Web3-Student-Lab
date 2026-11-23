import prisma from '../db/index.js';

export class P2PService {
  static async addNode(workspaceId: string, nodeName: string, ipAddress?: string, port?: number) {
    const nodeId = `node-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    return prisma.p2PNode.create({
      data: {
        workspaceId,
        nodeId,
        nodeName,
        ...(ipAddress ? { ipAddress } : {}),
        ...(port ? { port } : {}),
      },
    });
  }

  static async getNodes(workspaceId: string) {
    return prisma.p2PNode.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async broadcastMessage(senderId: string, receiverId: string, payload: any) {
    return prisma.p2PMessage.create({
      data: {
        senderId,
        receiverId,
        payload,
        status: 'delivered',
      },
    });
  }

  static async getMessages(nodeId: string) {
    return prisma.p2PMessage.findMany({
      where: {
        OR: [{ senderId: nodeId }, { receiverId: nodeId }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
