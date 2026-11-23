import * as d3 from 'd3';

export interface NetworkNode extends d3.SimulationNodeDatum {
  id: string;
  type: 'account' | 'asset' | 'offer';
  balance?: string;
  label?: string;
}

export interface TransactionEdge extends d3.SimulationLinkDatum<NetworkNode> {
  id: string;
  source: string | NetworkNode;
  target: string | NetworkNode;
  amount: string;
  asset: string;
  timestamp: number;
}

export class ForceSimulation {
  private simulation: d3.Simulation<NetworkNode, TransactionEdge>;
  private nodes: NetworkNode[] = [];
  private links: TransactionEdge[] = [];

  constructor(width: number, height: number, onTick: () => void) {
    const shortestSide = Math.max(Math.min(width, height), 320);
    const compactScale = Math.min(Math.max(shortestSide / 720, 0.58), 1);

    this.simulation = d3
      .forceSimulation<NetworkNode, TransactionEdge>(this.nodes)
      .force(
        'link',
        d3
          .forceLink<NetworkNode, TransactionEdge>(this.links)
          .id((d) => d.id)
          .distance(100 * compactScale)
      )
      .force('charge', d3.forceManyBody().strength(-200 * compactScale))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50 * compactScale))
      .on('tick', onTick);
  }

  updateData(nodes: NetworkNode[], links: TransactionEdge[]) {
    this.nodes = nodes;
    this.links = links;

    this.simulation.nodes(this.nodes);
    const linkForce = this.simulation.force('link') as d3.ForceLink<NetworkNode, TransactionEdge>;
    linkForce.links(this.links);

    this.simulation.alpha(1).restart();
  }

  stop() {
    this.simulation.stop();
  }

  getNodes() {
    return this.nodes;
  }

  getLinks() {
    return this.links;
  }
}
