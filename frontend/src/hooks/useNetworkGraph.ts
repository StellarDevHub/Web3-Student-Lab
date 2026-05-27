import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ForceSimulation,
  NetworkNode,
  TransactionEdge,
} from '../lib/visualization/ForceSimulation';

export interface GraphTransaction {
  id: string;
  source: string;
  target?: string;
  amount?: string;
  asset?: string;
}

interface NetworkGraph {
  nodes: NetworkNode[];
  edges: TransactionEdge[];
}

export function useNetworkGraph(width: number, height: number) {
  const [graph, setGraph] = useState<NetworkGraph>({ nodes: [], edges: [] });
  const simulationRef = useRef<ForceSimulation | null>(null);

  const onTick = useCallback(() => {
    if (simulationRef.current) {
      setGraph({
        nodes: [...simulationRef.current.getNodes()],
        edges: [...simulationRef.current.getLinks()],
      });
    }
  }, []);

  useEffect(() => {
    simulationRef.current = new ForceSimulation(width, height, onTick);
    return () => simulationRef.current?.stop();
  }, [width, height, onTick]);

  const addTransaction = useCallback((tx: GraphTransaction) => {
    if (!simulationRef.current) return;

    const sourceId = tx.source;
    const targetId = tx.target || 'SYSTEM'; // Fallback for single-account operations

    const currentNodes = [...simulationRef.current.getNodes()];
    const currentLinks = [...simulationRef.current.getLinks()];

    // Add nodes if they don't exist
    if (!currentNodes.find((n) => n.id === sourceId)) {
      currentNodes.push({
        id: sourceId,
        type: 'account',
        label: sourceId.slice(0, 4) + '...',
      });
    }
    if (!currentNodes.find((n) => n.id === targetId)) {
      currentNodes.push({
        id: targetId,
        type: 'account',
        label: targetId.slice(0, 4) + '...',
      });
    }

    // Add edge
    const edgeId = `${tx.id}-${Date.now()}`;
    currentLinks.push({
      id: edgeId,
      source: sourceId,
      target: targetId,
      amount: tx.amount || '0',
      asset: tx.asset || 'XLM',
      timestamp: Date.now(),
    });

    // Keep graph small for performance (100 nodes max as per requirement)
    const prunedNodes = currentNodes.slice(-100);
    const prunedLinks = currentLinks
      .filter(
        (l) =>
          prunedNodes.find(
            (n) => n.id === (typeof l.source === 'string' ? l.source : l.source.id)
          ) &&
          prunedNodes.find((n) => n.id === (typeof l.target === 'string' ? l.target : l.target.id))
      )
      .slice(-200);

    simulationRef.current.updateData(prunedNodes, prunedLinks);
  }, []);

  return { graph, addTransaction };
}
