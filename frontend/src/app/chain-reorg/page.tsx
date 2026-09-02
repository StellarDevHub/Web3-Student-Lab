'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, RotateCcw, Zap } from 'lucide-react';

interface Block {
  id: number;
  height: number;
  chain: 'A' | 'B';
  timestamp: number;
  hash: string;
}

export default function ChainReorgPage() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentHeight, setCurrentHeight] = useState(0);
  const [forkHeight, setForkHeight] = useState<number | null>(null);
  const [winner, setWinner] = useState<'A' | 'B' | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const generateBlock = (height: number, chain: 'A' | 'B'): Block => ({
    id: Date.now() + Math.random(),
    height,
    chain,
    timestamp: Date.now(),
    hash: Math.random().toString(16).substring(2, 10),
  });

  const startSimulation = () => {
    setBlocks([]);
    setCurrentHeight(0);
    setForkHeight(null);
    setWinner(null);
    setIsAnimating(true);

    // Genesis block
    const genesis = generateBlock(0, 'A');
    setBlocks([genesis]);
    setCurrentHeight(1);

    // Start fork at height 3
    setTimeout(() => {
      setForkHeight(3);
    }, 1000);
  };

  useEffect(() => {
    if (!isAnimating) return;

    const interval = setInterval(() => {
      if (currentHeight >= 10) {
        setIsAnimating(false);
        // Determine winner based on chain length
        const chainALength = blocks.filter((b) => b.chain === 'A').length;
        const chainBLength = blocks.filter((b) => b.chain === 'B').length;
        setWinner(chainALength >= chainBLength ? 'A' : 'B');
        return;
      }

      setCurrentHeight((prev) => prev + 1);

      // Add blocks to both chains after fork
      if (forkHeight && currentHeight >= forkHeight) {
        setBlocks((prev) => [
          ...prev,
          generateBlock(currentHeight, 'A'),
          generateBlock(currentHeight, 'B'),
        ]);
      } else {
        setBlocks((prev) => [...prev, generateBlock(currentHeight, 'A')]);
      }
    }, 800);

    return () => clearInterval(interval);
  }, [isAnimating, currentHeight, forkHeight, blocks]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = 500 * 2;
    ctx.scale(2, 2);

    const draw = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, 500);

      const blockWidth = 60;
      const blockHeight = 40;
      const startX = 100;
      const startY = 400;
      const verticalSpacing = 45;

      // Draw chain paths
      const chainABlocks = blocks.filter((b) => b.chain === 'A');
      const chainBBlocks = blocks.filter((b) => b.chain === 'B');

      // Draw Chain A
      ctx.strokeStyle = winner === 'A' ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      chainABlocks.forEach((block, index) => {
        const x = startX + index * (blockWidth + 20);
        const y = startY - block.height * verticalSpacing;
        if (index === 0) {
          ctx.moveTo(x + blockWidth / 2, y + blockHeight / 2);
        } else {
          ctx.lineTo(x + blockWidth / 2, y + blockHeight / 2);
        }
      });
      ctx.stroke();

      // Draw Chain B (if forked)
      if (forkHeight) {
        ctx.strokeStyle = winner === 'B' ? '#22c55e' : '#3b82f6';
        ctx.beginPath();
        chainBBlocks.forEach((block, index) => {
          const x = startX + 250 + index * (blockWidth + 20);
          const y = startY - block.height * verticalSpacing;
          if (index === 0) {
            ctx.moveTo(x + blockWidth / 2, y + blockHeight / 2);
          } else {
            ctx.lineTo(x + blockWidth / 2, y + blockHeight / 2);
          }
        });
        ctx.stroke();

        // Draw fork connection
        const forkBlock = blocks.find((b) => b.height === forkHeight - 1);
        if (forkBlock) {
          const forkX = startX + (forkHeight - 1) * (blockWidth + 20) + blockWidth / 2;
          const forkY = startY - (forkHeight - 1) * verticalSpacing + blockHeight / 2;
          const chainBStartX = startX + 250 + blockWidth / 2;
          const chainBStartY = startY - forkHeight * verticalSpacing + blockHeight / 2;

          ctx.strokeStyle = '#fbbf24';
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(forkX, forkY);
          ctx.lineTo(chainBStartX, chainBStartY);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Draw blocks
      blocks.forEach((block) => {
        const xOffset = block.chain === 'A' ? 0 : 250;
        const x = startX + block.height * (blockWidth + 20) + xOffset;
        const y = startY - block.height * verticalSpacing;

        // Block background
        ctx.fillStyle = block.chain === 'A' ? '#1f1f1f' : '#1e3a5f';
        if (winner && block.chain === winner) {
          ctx.fillStyle = '#14532d';
        }
        ctx.beginPath();
        ctx.roundRect(x, y, blockWidth, blockHeight, 8);
        ctx.fill();

        // Block border
        ctx.strokeStyle = block.chain === 'A' ? '#ef4444' : '#3b82f6';
        if (winner && block.chain === winner) {
          ctx.strokeStyle = '#22c55e';
        }
        ctx.lineWidth = 2;
        ctx.stroke();

        // Block number
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`#${block.height}`, x + blockWidth / 2, y + blockHeight / 2 + 4);

        // Chain label
        ctx.fillStyle = block.chain === 'A' ? '#ef4444' : '#3b82f6';
        if (winner && block.chain === winner) {
          ctx.fillStyle = '#22c55e';
        }
        ctx.font = '10px monospace';
        ctx.fillText(block.chain, x + blockWidth / 2, y - 8);
      });

      // Draw reorg animation if winner determined
      if (winner && forkHeight) {
        const losingChain = winner === 'A' ? 'B' : 'A';
        const losingBlocks = blocks.filter((b) => b.chain === losingChain && b.height >= forkHeight);
        
        losingBlocks.forEach((block) => {
          const xOffset = losingChain === 'A' ? 0 : 250;
          const x = startX + block.height * (blockWidth + 20) + xOffset;
          const y = startY - block.height * verticalSpacing;

          ctx.globalAlpha = 0.3;
          ctx.fillStyle = '#6b7280';
          ctx.beginPath();
          ctx.roundRect(x, y, blockWidth, blockHeight, 8);
          ctx.fill();
          ctx.globalAlpha = 1;
        });
      }
    };

    draw();
  }, [blocks, forkHeight, winner]);

  const chainALength = blocks.filter((b) => b.chain === 'A').length;
  const chainBLength = blocks.filter((b) => b.chain === 'B').length;

  return (
    <div className="min-h-screen bg-black p-6 font-mono text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 border-b border-white/10 pb-6">
          <h1 className="mb-2 text-4xl font-black tracking-tighter uppercase">
            Chain <span className="text-red-500">Reorganization</span> Visualizer
          </h1>
          <p className="text-xs tracking-widest text-gray-500 uppercase">
            Blockchain Fork Resolution Simulator
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-black tracking-widest text-white uppercase">
                  Blockchain Visualization
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={startSimulation}
                    disabled={isAnimating}
                    className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-black uppercase transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-zinc-800"
                  >
                    <Play className="h-4 w-4" />
                    {isAnimating ? 'Running...' : 'Start Simulation'}
                  </button>
                  <button
                    onClick={() => {
                      setBlocks([]);
                      setCurrentHeight(0);
                      setForkHeight(null);
                      setWinner(null);
                      setIsAnimating(false);
                    }}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase transition hover:bg-white/10"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </button>
                </div>
              </div>

              <canvas
                ref={canvasRef}
                className="w-full rounded-xl border border-white/5 bg-black"
                style={{ height: '500px' }}
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
              <h3 className="mb-4 text-xs font-black tracking-widest text-white uppercase">
                Chain Statistics
              </h3>
              
              <div className="space-y-4">
                <div className="rounded-xl border border-white/5 bg-black/30 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-red-500 uppercase">Chain A</span>
                    <span className="text-lg font-black text-white">{chainALength}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-red-500 transition-all"
                      style={{ width: `${(chainALength / 10) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-white/5 bg-black/30 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-500 uppercase">Chain B</span>
                    <span className="text-lg font-black text-white">{chainBLength}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all"
                      style={{ width: `${(chainBLength / 10) * 100}%` }}
                    />
                  </div>
                </div>

                {winner && (
                  <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4">
                    <div className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-green-500" />
                      <div>
                        <div className="text-xs font-bold text-green-500 uppercase">Winner</div>
                        <div className="text-lg font-black text-white">Chain {winner}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
              <h3 className="mb-4 text-xs font-black tracking-widest text-white uppercase">
                How It Works
              </h3>
              <div className="space-y-3 text-[11px] leading-relaxed text-gray-400">
                <p>
                  <strong className="text-white">1. Genesis Block:</strong> All chains start from the same genesis block.
                </p>
                <p>
                  <strong className="text-white">2. Fork Event:</strong> At height 3, the chain splits into two competing paths.
                </p>
                <p>
                  <strong className="text-white">3. Longest Chain Rule:</strong> Nodes automatically switch to the chain with the most accumulated work (longest chain).
                </p>
                <p>
                  <strong className="text-white">4. Reorganization:</strong> The shorter chain is orphaned, and nodes reorganize to follow the winner.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
