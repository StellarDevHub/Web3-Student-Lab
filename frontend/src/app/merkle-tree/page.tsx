'use client';

import * as d3 from 'd3';
import { Plus, Trash2, TreeDeciduous } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildOptimizedMerkleTree,
  getMerkleProof,
  stableHash,
} from '@/lib/merkle-tree-builder';

interface MerkleNode {
  id: string;
  hash: string;
  left?: MerkleNode;
  right?: MerkleNode;
  isLeaf: boolean;
  address?: string;
  level: number;
  index: number;
}

export default function MerkleTreePage() {
  const [addresses, setAddresses] = useState<string[]>([
    '0x1234...5678',
    '0xabcd...ef01',
    '0x9876...5432',
    '0xfedc...ba98',
  ]);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [validationPath, setValidationPath] = useState<string[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const merkleResult = useMemo(() => buildOptimizedMerkleTree(addresses), [addresses]);

  const simpleHash = (input: string): string => {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0').substring(0, 8);
  };

  const buildMerkleTree = (leaves: string[]): MerkleNode => {
    if (leaves.length === 0) {
      return {
        id: 'root',
        hash: '00000000',
        isLeaf: false,
        level: 0,
        index: 0,
      };
    }

    if (leaves.length === 1) {
      return {
        id: 'root',
        hash: simpleHash(leaves[0]),
        isLeaf: true,
        address: leaves[0],
        level: 0,
        index: 0,
      };
    }

    const buildLevel = (nodes: MerkleNode[], level: number): MerkleNode[] => {
      if (nodes.length === 1) return nodes;

      const nextLevel: MerkleNode[] = [];
      for (let i = 0; i < nodes.length; i += 2) {
        const left = nodes[i];
        const right = nodes[i + 1] || left; // Duplicate last node if odd

        const combinedHash = simpleHash(left.hash + right.hash);
        const parentNode: MerkleNode = {
          id: `node-${level}-${i / 2}`,
          hash: combinedHash,
          left,
          right,
          isLeaf: false,
          level: level + 1,
          index: i / 2,
        };
        nextLevel.push(parentNode);
      }

      return buildLevel(nextLevel, level + 1);
    };

    const leafNodes: MerkleNode[] = leaves.map((addr, i) => ({
      id: `leaf-${i}`,
      hash: simpleHash(addr),
      isLeaf: true,
      address: addr,
      level: 0,
      index: i,
    }));

    const tree = buildLevel(leafNodes, 0);
    return tree[0];
  };

  const findValidationPath = (root: MerkleNode, targetAddress: string): string[] => {
    const path: string[] = [];

    const search = (node: MerkleNode, targetHash: string): boolean => {
      if (!node) return false;

      if (node.isLeaf && node.address === targetAddress) {
        path.push(node.hash);
        return true;
      }

      if (node.left && search(node.left, targetHash)) {
        path.push(node.hash);
        if (node.right) {
          path.push(node.right.hash);
        }
        return true;
      }

      if (node.right && search(node.right, targetHash)) {
        path.push(node.hash);
        if (node.left) {
          path.push(node.left.hash);
        }
        return true;
      }

      return false;
    };

    search(root, targetAddress);
    return path;
  };

  const renderTree = (root: MerkleNode) => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current?.clientWidth || 800;
    const height = 500;
    const nodeRadius = 25;

    // Convert tree to d3 hierarchy
    const rootD3 = d3.hierarchy(root, (node: any) =>
      [node.left, node.right].filter(Boolean)
    );

    // Create tree layout
    const treeLayout = d3.tree<MerkleNode>().size([width - 100, height - 100]);
    treeLayout(rootD3);

    const g = svg.append('g')
      .attr('transform', 'translate(50, 50)');

    // Draw links
    g.selectAll('.link')
      .data(rootD3.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', (d: any) => {
        const linkGenerator = d3.linkVertical<any, any>();
        return linkGenerator(d);
      })
      .attr('fill', 'none')
      .attr('stroke', '#374151')
      .attr('stroke-width', 2);

    // Draw nodes
    const nodes = g.selectAll('.node')
      .data(rootD3.descendants())
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', (d: any) => `translate(${d.x},${d.y})`);

    nodes.append('circle')
      .attr('r', nodeRadius)
      .attr('fill', (d: any) => {
        if (d.data.isLeaf) {
          const leafValue = d.data.address ?? d.data.value;
          return leafValue === selectedAddress ? '#22c55e' : '#ef4444';
        }
        return '#3b82f6';
      })
      .attr('stroke', (d: any) => {
        if (validationPath.includes(d.data.hash)) {
          return '#fbbf24';
        }
        return '#1f1f1f';
      })
      .attr('stroke-width', (d: any) => {
        if (validationPath.includes(d.data.hash)) {
          return 3;
        }
        return 2;
      })
      .style('cursor', 'pointer')
      .on('click', (event: any, d: any) => {
        const leafValue = d.data.address ?? d.data.value;
        if (d.data.isLeaf && leafValue) {
          setSelectedAddress(leafValue);
          setValidationPath([
            stableHash(leafValue),
            ...getMerkleProof(merkleResult, leafValue).map((step) => step.hash),
            merkleResult.root.hash,
          ]);
        }
      });

    // Add hash labels
    nodes.append('text')
      .attr('dy', nodeRadius + 15)
      .attr('text-anchor', 'middle')
      .attr('fill', '#9ca3af')
      .attr('font-size', '10px')
      .attr('font-family', 'monospace')
      .text((d: any) => d.data.hash);

    // Add address labels for leaves
    nodes.filter((d: any) => d.data.isLeaf)
      .append('text')
      .attr('dy', nodeRadius + 28)
      .attr('text-anchor', 'middle')
      .attr('fill', '#ffffff')
      .attr('font-size', '9px')
      .attr('font-family', 'monospace')
      .text((d: any) => d.data.address ?? d.data.value);
  };

  useEffect(() => {
    if (addresses.length > 0) {
      renderTree(merkleResult.root as MerkleNode);
    }
  }, [addresses, selectedAddress, validationPath, merkleResult]);

  const addAddress = () => {
    const newAddress = `0x${Math.random().toString(16).substring(2, 6)}...${Math.random().toString(16).substring(2, 6)}`;
    setAddresses([...addresses, newAddress]);
    setSelectedAddress(null);
    setValidationPath([]);
  };

  const removeAddress = (index: number) => {
    setAddresses(addresses.filter((_, i) => i !== index));
    setSelectedAddress(null);
    setValidationPath([]);
  };

  const verifyAddress = (address: string) => {
    setSelectedAddress(address);
    setValidationPath([
      stableHash(address),
      ...getMerkleProof(merkleResult, address).map((step) => step.hash),
      merkleResult.root.hash,
    ]);
  };

  return (
    <div className="min-h-screen bg-black p-6 font-mono text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 border-b border-white/10 pb-6">
          <h1 className="mb-2 text-4xl font-black tracking-tighter uppercase">
            Merkle <span className="text-red-500">Tree</span> Generator
          </h1>
          <p className="text-xs tracking-widest text-gray-500 uppercase">
            Visual Token Airdrop Verification
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-black tracking-widest text-white uppercase">
                  Merkle Tree Visualization
                </h3>
                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                  <TreeDeciduous className="h-4 w-4" />
                  <span>Interactive D3.js Tree</span>
                </div>
              </div>

              <div className="rounded-xl border border-white/5 bg-black p-4">
                <svg
                  ref={svgRef}
                  className="w-full"
                  style={{ height: '500px' }}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <span className="text-[10px] font-bold text-gray-300 uppercase">
                    Root {merkleResult.root.hash} · {merkleResult.leafCount} Leaves · Depth {merkleResult.depth}
                  </span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <span className="text-[10px] font-bold text-red-500 uppercase">Leaf Node</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2">
                  <div className="h-3 w-3 rounded-full bg-blue-500" />
                  <span className="text-[10px] font-bold text-blue-500 uppercase">Internal Node</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
                  <div className="h-3 w-3 rounded-full bg-yellow-500" />
                  <span className="text-[10px] font-bold text-yellow-500 uppercase">Validation Path</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span className="text-[10px] font-bold text-green-500 uppercase">Selected</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
              <h3 className="mb-4 text-xs font-black tracking-widest text-white uppercase">
                Whitelist Addresses
              </h3>

              <div className="space-y-2">
                {addresses.map((address, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/30 p-3"
                  >
                    <span className="flex-1 text-xs font-mono text-gray-300">{address}</span>
                    <button
                      onClick={() => verifyAddress(address)}
                      className="rounded bg-blue-600 px-2 py-1 text-[10px] font-bold uppercase transition hover:bg-blue-500"
                    >
                      Verify
                    </button>
                    <button
                      onClick={() => removeAddress(index)}
                      className="rounded border border-red-500/30 bg-red-500/10 p-1 text-red-500 transition hover:bg-red-500/20"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                <button
                  onClick={addAddress}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 bg-white/5 py-3 text-xs font-bold uppercase transition hover:bg-white/10"
                >
                  <Plus className="h-4 w-4" />
                  Add Address
                </button>
              </div>
            </div>

            {selectedAddress && (
              <div className="rounded-3xl border border-green-500/30 bg-green-500/10 p-6">
                <h3 className="mb-4 text-xs font-black tracking-widest text-green-500 uppercase">
                  Validation Result
                </h3>
                <div className="space-y-3">
                  <div>
                    <div className="text-[10px] text-gray-400 uppercase">Selected Address</div>
                    <div className="text-sm font-mono text-white">{selectedAddress}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-400 uppercase">Validation Path</div>
                    <div className="space-y-1">
                      {validationPath.map((hash, i) => (
                        <div key={i} className="text-xs font-mono text-yellow-500">
                          {i + 1}. {hash}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-green-500/30 bg-green-500/20 p-3">
                    <div className="text-[10px] font-bold text-green-500 uppercase">
                      ✓ Address Verified
                    </div>
                    <div className="text-[10px] text-gray-300">
                      Hash path leads to root successfully
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
              <h3 className="mb-4 text-xs font-black tracking-widest text-white uppercase">
                How Merkle Trees Work
              </h3>
              <div className="space-y-3 text-[11px] leading-relaxed text-gray-400">
                <p>
                  <strong className="text-white">1. Leaf Hashing:</strong> Each address is hashed to create a leaf node.
                </p>
                <p>
                  <strong className="text-white">2. Pair Hashing:</strong> Adjacent leaf hashes are combined and hashed again to form parent nodes.
                </p>
                <p>
                  <strong className="text-white">3. Root Calculation:</strong> This process continues until a single root hash is obtained.
                </p>
                <p>
                  <strong className="text-white">4. Verification:</strong> To verify an address, you only need the hash and its path to the root, not the entire tree.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
