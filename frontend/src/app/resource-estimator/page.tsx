'use client';

import { useState, useEffect, useRef } from 'react';
import { Cpu, HardDrive, Zap, Activity, TrendingUp } from 'lucide-react';

interface ResourceMetrics {
  cpuInstructions: number;
  cpuLimit: number;
  storageBytes: number;
  storageLimit: number;
  memoryBytes: number;
  memoryLimit: number;
}

export default function ResourceEstimatorPage() {
  const [code, setCode] = useState(`// Soroban Contract Example
pub struct Contract {
    count: u64,
}

impl Contract {
    pub fn new() -> Self {
        Contract { count: 0 }
    }

    pub fn increment(&mut self) {
        self.count += 1;
    }

    pub fn get_count(&self) -> u64 {
        self.count
    }
}`);
  const [metrics, setMetrics] = useState<ResourceMetrics>({
    cpuInstructions: 45000,
    cpuLimit: 100000000,
    storageBytes: 2500,
    storageLimit: 100000,
    memoryBytes: 8000,
    memoryLimit: 65536,
  });
  const [isCompiling, setIsCompiling] = useState(false);

  const cpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const storageCanvasRef = useRef<HTMLCanvasElement>(null);
  const memoryCanvasRef = useRef<HTMLCanvasElement>(null);

  const drawGauge = (
    canvas: HTMLCanvasElement | null,
    value: number,
    limit: number,
    color: string
  ) => {
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.offsetWidth * 2;
    const height = 200 * 2;
    canvas.width = width;
    canvas.height = height;
    ctx.scale(2, 2);

    const centerX = canvas.offsetWidth / 2;
    const centerY = 140;
    const radius = 80;
    const percentage = Math.min(value / limit, 1);

    // Clear canvas
    ctx.clearRect(0, 0, canvas.offsetWidth, 200);

    // Draw background arc
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI * 0.8, Math.PI * 2.2);
    ctx.strokeStyle = '#1f1f1f';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Draw value arc
    const startAngle = Math.PI * 0.8;
    const endAngle = startAngle + (Math.PI * 1.4 * percentage);
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Draw percentage text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${(percentage * 100).toFixed(1)}%`, centerX, centerY + 10);

    // Draw value text
    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px monospace';
    ctx.fillText(
      `${value.toLocaleString()} / ${limit.toLocaleString()}`,
      centerX,
      centerY + 30
    );
  };

  useEffect(() => {
    drawGauge(cpuCanvasRef.current, metrics.cpuInstructions, metrics.cpuLimit, '#ef4444');
    drawGauge(storageCanvasRef.current, metrics.storageBytes, metrics.storageLimit, '#3b82f6');
    drawGauge(memoryCanvasRef.current, metrics.memoryBytes, metrics.memoryLimit, '#22c55e');
  }, [metrics]);

  const simulateCompile = () => {
    setIsCompiling(true);
    
    // Simulate resource calculation based on code complexity
    setTimeout(() => {
      const lineCount = code.split('\n').length;
      const functionCount = (code.match(/fn\s+\w+/g) || []).length;
      const structCount = (code.match(/struct\s+\w+/g) || []).length;
      
      const newMetrics: ResourceMetrics = {
        cpuInstructions: Math.min(30000 + (lineCount * 1500) + (functionCount * 5000), metrics.cpuLimit),
        cpuLimit: metrics.cpuLimit,
        storageBytes: Math.min(1000 + (structCount * 500) + (lineCount * 50), metrics.storageLimit),
        storageLimit: metrics.storageLimit,
        memoryBytes: Math.min(4000 + (functionCount * 1000) + (lineCount * 100), metrics.memoryLimit),
        memoryLimit: metrics.memoryLimit,
      };
      
      setMetrics(newMetrics);
      setIsCompiling(false);
    }, 800);
  };

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (code) {
        simulateCompile();
      }
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [code]);

  const getEfficiencyScore = () => {
    const cpuScore = (metrics.cpuInstructions / metrics.cpuLimit) * 100;
    const storageScore = (metrics.storageBytes / metrics.storageLimit) * 100;
    const memoryScore = (metrics.memoryBytes / metrics.memoryLimit) * 100;
    const avgScore = (cpuScore + storageScore + memoryScore) / 3;
    return Math.max(0, 100 - avgScore).toFixed(1);
  };

  return (
    <div className="min-h-screen bg-black p-6 font-mono text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 border-b border-white/10 pb-6">
          <h1 className="mb-2 text-4xl font-black tracking-tighter uppercase">
            Resource <span className="text-red-500">Estimator</span>
          </h1>
          <p className="text-xs tracking-widest text-gray-500 uppercase">
            Real-Time Gas & Consumption Analysis
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Code Editor */}
          <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xs font-black tracking-widest text-white uppercase">
                Contract Code
              </h3>
              {isCompiling && (
                <div className="flex items-center gap-2 text-[10px] text-yellow-500">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
                  Analyzing...
                </div>
              )}
            </div>

            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full h-96 resize-none rounded-xl border border-white/10 bg-black p-4 text-sm text-gray-300 font-mono focus:border-red-500 focus:outline-none"
              placeholder="Paste your Soroban contract code here..."
              spellCheck={false}
            />

            <div className="mt-4 flex items-center justify-between">
              <div className="text-[10px] text-gray-500">
                {code.split('\n').length} lines • {(code.match(/fn\s+\w+/g) || []).length} functions
              </div>
              <button
                onClick={simulateCompile}
                disabled={isCompiling}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-black uppercase transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-zinc-800"
              >
                <Activity className="h-4 w-4" />
                {isCompiling ? 'Analyzing...' : 'Analyze'}
              </button>
            </div>
          </div>

          {/* Resource Gauges */}
          <div className="space-y-6">
            {/* CPU Instructions */}
            <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-red-500" />
                  <h3 className="text-xs font-black tracking-widest text-white uppercase">
                    CPU Instructions
                  </h3>
                </div>
                <div className="text-[10px] text-gray-500">
                  Soroban VM
                </div>
              </div>

              <canvas
                ref={cpuCanvasRef}
                className="w-full rounded-xl border border-white/5 bg-black"
                style={{ height: '200px' }}
              />

              <div className="mt-4 rounded-xl border border-white/5 bg-black/30 p-4">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-gray-400">Estimated Cost</span>
                  <span className="font-bold text-white">
                    {(metrics.cpuInstructions / 10000).toFixed(2)} stroops
                  </span>
                </div>
              </div>
            </div>

            {/* Storage */}
            <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5 text-blue-500" />
                  <h3 className="text-xs font-black tracking-widest text-white uppercase">
                    Storage Usage
                  </h3>
                </div>
                <div className="text-[10px] text-gray-500">
                  Ledger Entries
                </div>
              </div>

              <canvas
                ref={storageCanvasRef}
                className="w-full rounded-xl border border-white/5 bg-black"
                style={{ height: '200px' }}
              />

              <div className="mt-4 rounded-xl border border-white/5 bg-black/30 p-4">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-gray-400">Estimated Cost</span>
                  <span className="font-bold text-white">
                    {(metrics.storageBytes / 1000).toFixed(2)} XLM
                  </span>
                </div>
              </div>
            </div>

            {/* Memory */}
            <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-green-500" />
                  <h3 className="text-xs font-black tracking-widest text-white uppercase">
                    Memory Usage
                  </h3>
                </div>
                <div className="text-[10px] text-gray-500">
                  Runtime
                </div>
              </div>

              <canvas
                ref={memoryCanvasRef}
                className="w-full rounded-xl border border-white/5 bg-black"
                style={{ height: '200px' }}
              />

              <div className="mt-4 rounded-xl border border-white/5 bg-black/30 p-4">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-gray-400">Peak Allocation</span>
                  <span className="font-bold text-white">
                    {(metrics.memoryBytes / 1024).toFixed(2)} KB
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Efficiency Summary */}
        <div className="mt-8 rounded-3xl border border-white/10 bg-zinc-950 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-6 w-6 text-yellow-500" />
              <div>
                <h3 className="text-xs font-black tracking-widest text-white uppercase">
                  Efficiency Score
                </h3>
                <p className="text-[10px] text-gray-500">
                  Based on resource utilization
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-black text-white">
                {getEfficiencyScore()}%
              </div>
              <div className="text-[10px] text-gray-500 uppercase">
                {parseFloat(getEfficiencyScore()) > 80 ? 'Excellent' : parseFloat(getEfficiencyScore()) > 50 ? 'Good' : 'Needs Optimization'}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-white/5 bg-black/30 p-4">
              <div className="text-[10px] text-gray-400 uppercase">CPU Efficiency</div>
              <div className="mt-1 text-lg font-bold text-white">
                {((1 - metrics.cpuInstructions / metrics.cpuLimit) * 100).toFixed(1)}%
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-black/30 p-4">
              <div className="text-[10px] text-gray-400 uppercase">Storage Efficiency</div>
              <div className="mt-1 text-lg font-bold text-white">
                {((1 - metrics.storageBytes / metrics.storageLimit) * 100).toFixed(1)}%
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-black/30 p-4">
              <div className="text-[10px] text-gray-400 uppercase">Memory Efficiency</div>
              <div className="mt-1 text-lg font-bold text-white">
                {((1 - metrics.memoryBytes / metrics.memoryLimit) * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        {/* Optimization Tips */}
        <div className="mt-8 rounded-3xl border border-white/10 bg-zinc-950 p-6">
          <h3 className="mb-4 text-xs font-black tracking-widest text-white uppercase">
            Optimization Tips
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/5 bg-black/30 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-red-500/10 p-2">
                  <Cpu className="h-4 w-4 text-red-500" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Reduce CPU Cycles</div>
                  <p className="mt-1 text-[10px] text-gray-400">
                    Minimize loops and complex calculations in hot paths
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-black/30 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-blue-500/10 p-2">
                  <HardDrive className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Optimize Storage</div>
                  <p className="mt-1 text-[10px] text-gray-400">
                    Use compact data types and avoid unnecessary persistence
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-black/30 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-green-500/10 p-2">
                  <Zap className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Memory Management</div>
                  <p className="mt-1 text-[10px] text-gray-400">
                    Release temporary data early and reuse allocations
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-black/30 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-yellow-500/10 p-2">
                  <Activity className="h-4 w-4 text-yellow-500" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Batch Operations</div>
                  <p className="mt-1 text-[10px] text-gray-400">
                    Group multiple operations to reduce overhead
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
