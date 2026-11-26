'use client';

import { PendingTx, TX_TYPES, TxType } from '@/lib/mempool';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type PriorityLevel = 'CRITICAL' | 'HIGH' | 'STANDARD' | 'UNDERPRICED';

export interface DecodedXdrEnvelope {
  xdrBase64: string;
  envelopeType: 'ENVELOPE_TYPE_TX' | 'ENVELOPE_TYPE_TX_FEE_BUMP';
  sourceAccount: string;
  feeStroops: number;
  feePerOpStroops: number;
  feeBidGwei: number;
  seqNum: string;
  operationCount: number;
  operations: Array<{
    type: TxType;
    destination: string;
    amount: string;
    gasUnits: number;
  }>;
  memo: string;
  signatures: string[];
}

export interface InspectedParticle {
  index: number;
  txId: string;
  txType: TxType;
  feeBid: number;
  feePerOp: number;
  gasUnits: number;
  priority: PriorityLevel;
  fromPool: boolean;
  envelope: DecodedXdrEnvelope;
}

export interface MempoolCanvasProps {
  /** Real user-broadcasted transactions from the mempool simulator. */
  pool: PendingTx[];
  /** Current network base fee (gwei). */
  baseFee: number;
  /** Number of mined blocks (triggers block-settlement visual pulse). */
  minedBlockCount?: number;
  /** Initial simulated particle count (defaults to 5,000 for 60fps stress test). */
  initialParticleCount?: number;
  /** Force 2D canvas fallback (useful for testing or low-power mode). */
  forceFallback2D?: boolean;
  /** Optional callback when a particle is clicked and inspected. */
  onSelectParticle?: (particle: InspectedParticle | null) => void;
}

interface ParticleStore {
  count: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  feeBid: Float32Array;
  gasUnits: Float32Array;
  opCount: Uint8Array;
  typeIdx: Uint8Array;
  fromPool: Uint8Array;
  seed: Uint32Array;
}

const CANVAS_HEIGHT = 420;
const BLOCK_ZONE_RATIO = 0.84;
const PARTICLE_PRESETS = [5_000, 7_500, 10_000] as const;

const STELLAR_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Classify fee bid into a priority tier relative to the current base fee. */
export function classifyPriority(feeBid: number, baseFee: number): PriorityLevel {
  if (feeBid < baseFee) return 'UNDERPRICED';
  if (feeBid >= 120) return 'CRITICAL';
  if (feeBid >= 60) return 'HIGH';
  return 'STANDARD';
}

/** Map priority tier to RGB floats (0..1) and hex string for WebGL & 2D parity. */
export function priorityColor(priority: PriorityLevel): {
  r: number;
  g: number;
  b: number;
  hex: string;
} {
  switch (priority) {
    case 'CRITICAL':
      return { r: 0.937, g: 0.267, b: 0.267, hex: '#ef4444' };
    case 'HIGH':
      return { r: 0.961, g: 0.62, b: 0.043, hex: '#f59e0b' };
    case 'STANDARD':
      return { r: 0.063, g: 0.725, b: 0.506, hex: '#10b981' };
    case 'UNDERPRICED':
    default:
      return { r: 0.392, g: 0.455, b: 0.545, hex: '#64748b' };
  }
}

/** Detect whether the current browser/hardware supports WebGL. */
export function detectWebGLSupport(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  try {
    const testCanvas = document.createElement('canvas');
    const gl =
      testCanvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) ||
      testCanvas.getContext('webgl', { failIfMajorPerformanceCaveat: false });
    return Boolean(gl);
  } catch {
    return false;
  }
}

function deterministicStellarKey(seed: number, prefix: 'G' | 'C' = 'G'): string {
  let state = (seed ^ 0x9e3779b9) >>> 0;
  let key = prefix;
  for (let i = 0; i < 55; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    key += STELLAR_ALPHABET[state % STELLAR_ALPHABET.length];
  }
  return key;
}

/** Build a deterministic decoded XDR envelope for any particle on click. */
export function buildDecodedXdrEnvelope(
  seed: number,
  txType: TxType,
  feeBid: number,
  gasUnits: number,
  opCount: number,
  priority: PriorityLevel,
): DecodedXdrEnvelope {
  const sourceAccount = deterministicStellarKey(seed, 'G');
  const destination = deterministicStellarKey(seed + 7919, txType === 'CONTRACT' ? 'C' : 'G');
  const feePerOpStroops = Math.max(100, Math.round(feeBid * 100));
  const feeStroops = feePerOpStroops * opCount;
  const seqNum = String(4_200_000_000_000 + ((seed >>> 0) % 9_000_000));
  const envelopeType =
    priority === 'CRITICAL' ? 'ENVELOPE_TYPE_TX_FEE_BUMP' : 'ENVELOPE_TYPE_TX';

  const operations = Array.from({ length: opCount }, (_, idx) => ({
    type: txType,
    destination: idx === 0 ? destination : deterministicStellarKey(seed + idx * 997, 'G'),
    amount: `${(((seed + idx * 131) % 5000) / 10 + 1).toFixed(2)} XLM`,
    gasUnits: Math.max(21_000, Math.round(gasUnits / opCount)),
  }));

  const rawPayload = JSON.stringify({
    v: 2,
    t: envelopeType === 'ENVELOPE_TYPE_TX_FEE_BUMP' ? 5 : 2,
    src: sourceAccount.slice(0, 12),
    fee: feeStroops,
    seq: seqNum,
    ops: opCount,
    op: txType,
  });

  const xdrBase64 =
    typeof btoa === 'function'
      ? btoa(rawPayload)
      : Buffer.from(rawPayload, 'utf8').toString('base64');

  const sigHex = (
    (seed >>> 0).toString(16).padStart(8, '0') +
    ((seed * 2654435761) >>> 0).toString(16).padStart(8, '0')
  ).slice(0, 16);

  return {
    xdrBase64,
    envelopeType,
    sourceAccount,
    feeStroops,
    feePerOpStroops,
    feeBidGwei: feeBid,
    seqNum,
    operationCount: opCount,
    operations,
    memo: `MEMPOOL_${txType}_${(seed % 9999).toString().padStart(4, '0')}`,
    signatures: [`ed25519:${sigHex}...`],
  };
}

function createParticleStore(
  count: number,
  width: number,
  height: number,
  pool: PendingTx[],
  gasSpike: boolean,
): ParticleStore {
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const vx = new Float32Array(count);
  const vy = new Float32Array(count);
  const feeBid = new Float32Array(count);
  const gasUnits = new Float32Array(count);
  const opCount = new Uint8Array(count);
  const typeIdx = new Uint8Array(count);
  const fromPool = new Uint8Array(count);
  const seed = new Uint32Array(count);

  const usableWidth = Math.max(320, width);
  const usableHeight = Math.max(200, height);

  for (let i = 0; i < count; i++) {
    const poolTx = i < pool.length ? pool[i] : undefined;
    const s = ((i + 1) * 2654435761) >>> 0;
    seed[i] = s;

    if (poolTx) {
      fromPool[i] = 1;
      feeBid[i] = poolTx.feeBid;
      gasUnits[i] = poolTx.gasUnits;
      opCount[i] = Math.min(4, Math.max(1, Math.round(poolTx.gasUnits / 60_000)));
      typeIdx[i] = Math.max(0, TX_TYPES.indexOf(poolTx.type));
    } else {
      fromPool[i] = 0;
      const r = Math.random();
      let bid: number;
      if (gasSpike) {
        bid = r > 0.35 ? 85 + Math.random() * 115 : 15 + Math.random() * 70;
      } else {
        bid =
          r > 0.88
            ? 115 + Math.random() * 85
            : r > 0.55
              ? 50 + Math.random() * 65
              : 2 + Math.random() * 48;
      }
      feeBid[i] = Math.round(bid);
      const tIdx = i % TX_TYPES.length;
      typeIdx[i] = tIdx;
      opCount[i] = (i % 4) + 1;
      gasUnits[i] = 21_000 + ((i * 7919) % 230_000);
    }

    x[i] = Math.random() * usableWidth * BLOCK_ZONE_RATIO;
    const normalizedFee = Math.min(1, feeBid[i] / 200);
    const bandY = (1 - normalizedFee) * (usableHeight - 40) + 20;
    y[i] = Math.max(10, Math.min(usableHeight - 10, bandY + (Math.random() - 0.5) * 44));
    vx[i] = 0.6 + normalizedFee * 2.4 + Math.random() * 0.6;
    vy[i] = (Math.random() - 0.5) * 0.35;
  }

  return { count, x, y, vx, vy, feeBid, gasUnits, opCount, typeIdx, fromPool, seed };
}

export function MempoolCanvas({
  pool,
  baseFee,
  minedBlockCount = 0,
  initialParticleCount = 5_000,
  forceFallback2D = false,
  onSelectParticle,
}: MempoolCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [particleCount, setParticleCount] = useState<number>(initialParticleCount);
  const [gasSpike, setGasSpike] = useState<boolean>(false);
  const [rendererMode, setRendererMode] = useState<'webgl' | '2d'>('webgl');
  const [fps, setFps] = useState<number>(60);
  const [selected, setSelected] = useState<InspectedParticle | null>(null);
  const [copiedXdr, setCopiedXdr] = useState<boolean>(false);

  const storeRef = useRef<ParticleStore | null>(null);
  const baseFeeRef = useRef<number>(baseFee);
  const gasSpikeRef = useRef<boolean>(gasSpike);
  const poolRef = useRef<PendingTx[]>(pool);
  const blockPulseRef = useRef<number>(0);

  baseFeeRef.current = baseFee;
  gasSpikeRef.current = gasSpike;
  poolRef.current = pool;

  useEffect(() => {
    if (minedBlockCount > 0) {
      blockPulseRef.current = 1;
    }
  }, [minedBlockCount]);

  useEffect(() => {
    const store = storeRef.current;
    if (!store) return;
    const limit = Math.min(pool.length, store.count);
    for (let i = 0; i < limit; i++) {
      const tx = pool[i];
      store.fromPool[i] = 1;
      store.feeBid[i] = tx.feeBid;
      store.gasUnits[i] = tx.gasUnits;
      store.typeIdx[i] = Math.max(0, TX_TYPES.indexOf(tx.type));
      store.opCount[i] = Math.min(4, Math.max(1, Math.round(tx.gasUnits / 60_000)));
    }
  }, [pool]);

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const store = storeRef.current;
      if (!canvas || !store) return;

      const rect = canvas.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;

      let bestIdx = -1;
      let bestDistSq = 28 * 28;

      for (let i = 0; i < store.count; i++) {
        const dx = store.x[i] - clickX;
        const dy = store.y[i] - clickY;
        const dSq = dx * dx + dy * dy;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }

      if (bestIdx === -1) {
        setSelected(null);
        onSelectParticle?.(null);
        return;
      }

      const txType = TX_TYPES[store.typeIdx[bestIdx]] ?? 'TRANSFER';
      const feeBid = store.feeBid[bestIdx];
      const gasUnits = store.gasUnits[bestIdx];
      const opCount = store.opCount[bestIdx] || 1;
      const priority = classifyPriority(feeBid, baseFeeRef.current);
      const isPoolTx = store.fromPool[bestIdx] === 1 && poolRef.current[bestIdx];
      const txId = isPoolTx
        ? poolRef.current[bestIdx].id
        : `0x${store.seed[bestIdx].toString(16).padStart(8, '0')}`;

      const envelope = buildDecodedXdrEnvelope(
        store.seed[bestIdx],
        txType,
        feeBid,
        gasUnits,
        opCount,
        priority,
      );

      const inspected: InspectedParticle = {
        index: bestIdx,
        txId,
        txType,
        feeBid,
        feePerOp: Math.round((feeBid / opCount) * 10) / 10,
        gasUnits,
        priority,
        fromPool: Boolean(isPoolTx),
        envelope,
      };

      setSelected(inspected);
      setCopiedXdr(false);
      onSelectParticle?.(inspected);
    },
    [onSelectParticle],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = Math.max(320, container.clientWidth || 800);
    const height = CANVAS_HEIGHT;

    const store = createParticleStore(
      particleCount,
      width,
      height,
      poolRef.current,
      gasSpikeRef.current,
    );
    storeRef.current = store;

    const canUseWebGL = !forceFallback2D && detectWebGLSupport();

    let rafId = 0;
    let frameCount = 0;
    let lastFpsTime = performance.now();

    const stepSimulation = (w: number, h: number) => {
      const spikeBoost = gasSpikeRef.current ? 1.85 : 1.0;
      const blockBoundary = w * BLOCK_ZONE_RATIO;

      if (blockPulseRef.current > 0) {
        blockPulseRef.current = Math.max(0, blockPulseRef.current - 0.03);
      }

      for (let i = 0; i < store.count; i++) {
        store.x[i] += store.vx[i] * spikeBoost;
        store.y[i] += store.vy[i];

        if (store.y[i] < 10) {
          store.y[i] = 10;
          store.vy[i] = Math.abs(store.vy[i]);
        } else if (store.y[i] > h - 10) {
          store.y[i] = h - 10;
          store.vy[i] = -Math.abs(store.vy[i]);
        }

        if (store.x[i] >= blockBoundary) {
          store.x[i] = Math.random() * 14;
          if (store.fromPool[i] === 0) {
            const newBid = gasSpikeRef.current
              ? Math.round(70 + Math.random() * 130)
              : Math.round(
                  Math.random() > 0.85
                    ? 110 + Math.random() * 90
                    : 4 + Math.random() * 85,
                );
            store.feeBid[i] = newBid;
            const norm = Math.min(1, newBid / 200);
            store.y[i] = Math.max(
              10,
              Math.min(h - 10, (1 - norm) * (h - 40) + 20 + (Math.random() - 0.5) * 36),
            );
            store.vx[i] = 0.6 + norm * 2.4 + Math.random() * 0.6;
          }
        }
      }
    };

    const tickFps = () => {
      frameCount += 1;
      const now = performance.now();
      if (now - lastFpsTime >= 500) {
        const measured = Math.round((frameCount * 1000) / (now - lastFpsTime));
        setFps(Math.min(120, measured));
        frameCount = 0;
        lastFpsTime = now;
      }
    };

    if (canUseWebGL) {
      const gl =
        (canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' }) as WebGLRenderingContext | null) ||
        (canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' }) as WebGLRenderingContext | null);

      if (gl) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);

        const vsSource = `
          attribute vec2 a_pos;
          attribute vec3 a_color;
          attribute float a_size;
          uniform vec2 u_res;
          varying vec3 v_color;
          void main() {
            vec2 clip = (a_pos / u_res) * 2.0 - 1.0;
            gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
            gl_PointSize = a_size;
            v_color = a_color;
          }
        `;
        const fsSource = `
          precision mediump float;
          varying vec3 v_color;
          void main() {
            gl_FragColor = vec4(v_color, 0.92);
          }
        `;

        const compile = (type: number, src: string) => {
          const s = gl.createShader(type);
          if (!s) return null;
          gl.shaderSource(s, src);
          gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            gl.deleteShader(s);
            return null;
          }
          return s;
        };

        const vs = compile(gl.VERTEX_SHADER, vsSource);
        const fs = compile(gl.FRAGMENT_SHADER, fsSource);
        const program = vs && fs ? gl.createProgram() : null;

        if (vs && fs && program) {
          gl.attachShader(program, vs);
          gl.attachShader(program, fs);
          gl.linkProgram(program);

          if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
            gl.useProgram(program);
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clearColor(0.02, 0.02, 0.027, 1);

            const posLoc = gl.getAttribLocation(program, 'a_pos');
            const colLoc = gl.getAttribLocation(program, 'a_color');
            const sizeLoc = gl.getAttribLocation(program, 'a_size');
            const resLoc = gl.getUniformLocation(program, 'u_res');

            const posBuf = gl.createBuffer();
            const colBuf = gl.createBuffer();
            const sizeBuf = gl.createBuffer();

            const positions = new Float32Array(store.count * 2);
            const colors = new Float32Array(store.count * 3);
            const sizes = new Float32Array(store.count);

            setRendererMode('webgl');

            const renderWebGL = () => {
              stepSimulation(width, height);
              const bf = baseFeeRef.current;

              for (let i = 0; i < store.count; i++) {
                const i2 = i * 2;
                const i3 = i * 3;
                positions[i2] = store.x[i];
                positions[i2 + 1] = store.y[i];
                sizes[i] = (store.fromPool[i] === 1 ? 5.0 : 3.2) * dpr;

                const c = priorityColor(classifyPriority(store.feeBid[i], bf));
                colors[i3] = c.r;
                colors[i3 + 1] = c.g;
                colors[i3 + 2] = c.b;
              }

              gl.clear(gl.COLOR_BUFFER_BIT);
              gl.uniform2f(resLoc, width, height);

              gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
              gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
              gl.enableVertexAttribArray(posLoc);
              gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

              gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
              gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
              gl.enableVertexAttribArray(colLoc);
              gl.vertexAttribPointer(colLoc, 3, gl.FLOAT, false, 0, 0);

              gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf);
              gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.DYNAMIC_DRAW);
              gl.enableVertexAttribArray(sizeLoc);
              gl.vertexAttribPointer(sizeLoc, 1, gl.FLOAT, false, 0, 0);

              gl.drawArrays(gl.POINTS, 0, store.count);
              tickFps();
              rafId = requestAnimationFrame(renderWebGL);
            };

            rafId = requestAnimationFrame(renderWebGL);

            return () => {
              cancelAnimationFrame(rafId);
              gl.deleteBuffer(posBuf);
              gl.deleteBuffer(colBuf);
              gl.deleteBuffer(sizeBuf);
              gl.deleteProgram(program);
              gl.deleteShader(vs);
              gl.deleteShader(fs);
            };
          }
          gl.deleteProgram(program);
        }
        if (vs) gl.deleteShader(vs);
        if (fs) gl.deleteShader(fs);
      }
    }

    // 2D Canvas Fallback Renderer
    setRendererMode('2d');
    const ctx = canvas.getContext('2d');
    canvas.width = width;
    canvas.height = height;

    const render2D = () => {
      stepSimulation(width, height);
      if (ctx) {
        ctx.fillStyle = '#050507';
        ctx.fillRect(0, 0, width, height);

        const blockX = width * BLOCK_ZONE_RATIO + 14;
        const blockW = Math.max(48, width - blockX - 12);
        const slotCount = 4;
        const slotGap = 10;
        const slotH = (height - slotGap * (slotCount + 1)) / slotCount;
        for (let b = 0; b < slotCount; b++) {
          const sy = slotGap + b * (slotH + slotGap);
          ctx.fillStyle =
            b === 0
              ? `rgba(16, 185, 129, ${0.22 + blockPulseRef.current * 0.45})`
              : 'rgba(39, 39, 42, 0.45)';
          ctx.fillRect(blockX, sy, blockW, slotH);
        }

        const bf = baseFeeRef.current;
        const buckets: Record<PriorityLevel, number[]> = {
          UNDERPRICED: [],
          STANDARD: [],
          HIGH: [],
          CRITICAL: [],
        };

        for (let i = 0; i < store.count; i++) {
          buckets[classifyPriority(store.feeBid[i], bf)].push(i);
        }

        (['UNDERPRICED', 'STANDARD', 'HIGH', 'CRITICAL'] as PriorityLevel[]).forEach((tier) => {
          const list = buckets[tier];
          if (list.length === 0) return;
          ctx.fillStyle = priorityColor(tier).hex;
          for (let k = 0; k < list.length; k++) {
            const idx = list[k];
            const size = store.fromPool[idx] === 1 ? 4 : 2.5;
            ctx.fillRect(store.x[idx], store.y[idx], size, size);
          }
        });
      }

      tickFps();
      rafId = requestAnimationFrame(render2D);
    };

    rafId = requestAnimationFrame(render2D);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [particleCount, forceFallback2D]);

  const priorityBadgeClass = useMemo<Record<PriorityLevel, string>>(
    () => ({
      CRITICAL: 'bg-red-500/15 text-red-400 border-red-500/40',
      HIGH: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
      STANDARD: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
      UNDERPRICED: 'bg-slate-500/15 text-slate-400 border-slate-500/40',
    }),
    [],
  );

  const handleCopyXdr = useCallback(() => {
    if (!selected) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(selected.envelope.xdrBase64).catch(() => {});
    }
    setCopiedXdr(true);
    setTimeout(() => setCopiedXdr(false), 1800);
  }, [selected]);

  return (
    <section
      className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl"
      aria-label="High-frequency WebGL mempool auction visualizer"
    >
      {/* Toolbar & Telemetry */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-bold tracking-widest text-white uppercase">
            High-Frequency Mempool Stream
          </h2>
          <span
            data-testid="renderer-mode-badge"
            className={`rounded border px-2 py-0.5 text-[10px] font-black tracking-widest uppercase ${
              rendererMode === 'webgl'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-400'
            }`}
          >
            {rendererMode === 'webgl' ? 'WebGL' : '2D Fallback'}
          </span>
          <span
            data-testid="fps-counter"
            className="rounded border border-white/10 bg-black px-2 py-0.5 text-[10px] font-bold text-gray-300 tabular-nums"
          >
            {fps} FPS
          </span>
          <span
            data-testid="particle-count-badge"
            className="rounded border border-white/10 bg-black px-2 py-0.5 text-[10px] font-bold text-gray-300 tabular-nums"
          >
            {particleCount.toLocaleString()} TX
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded border border-white/10 bg-black p-0.5">
            {PARTICLE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setParticleCount(preset)}
                aria-pressed={particleCount === preset}
                className={`rounded px-2 py-1 text-[10px] font-bold tabular-nums transition-colors ${
                  particleCount === preset
                    ? 'bg-white text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {(preset / 1000).toFixed(preset % 1000 === 0 ? 0 : 1)}k
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setGasSpike((prev) => !prev)}
            aria-pressed={gasSpike}
            className={`rounded border px-3 py-1.5 text-[10px] font-black tracking-widest uppercase transition-colors ${
              gasSpike
                ? 'border-red-500 bg-red-600 text-white'
                : 'border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20'
            }`}
          >
            {gasSpike ? '⚡ Gas Spike Active' : '⚡ Simulate Gas Spike'}
          </button>
        </div>
      </div>

      {/* Color Legend */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-400">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500" /> Critical (≥120 gwei)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> High (60–119)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Standard (≥{baseFee})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-slate-500" /> Underpriced (&lt;{baseFee})
          </span>
        </div>
        <span className="text-[10px] text-gray-500">
          Click any particle to inspect decoded XDR envelope
        </span>
      </div>

      {/* WebGL / 2D Canvas Viewport */}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-[#050507]"
        style={{ height: CANVAS_HEIGHT }}
      >
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          data-testid="mempool-canvas"
          aria-label="Interactive mempool transaction particle stream"
          className="block h-full w-full cursor-crosshair"
        />

        {/* Right-side Block Slot Label Overlay */}
        <div className="pointer-events-none absolute top-2 right-3 text-[9px] font-black tracking-widest text-emerald-400/80 uppercase">
          Block Slots
        </div>
      </div>

      {/* Decoded XDR Envelope Inspector */}
      {selected && (
        <div
          data-testid="xdr-inspector-panel"
          className="mt-4 rounded-xl border border-white/15 bg-black p-4"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-black text-white">{selected.txId}</span>
              <span
                className={`rounded border px-2 py-0.5 text-[10px] font-black tracking-widest uppercase ${priorityBadgeClass[selected.priority]}`}
              >
                {selected.priority} PRIORITY
              </span>
              <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] font-bold text-gray-300">
                {selected.txType}
              </span>
              {selected.fromPool && (
                <span className="rounded bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-400">
                  USER TX
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyXdr}
                className="rounded border border-white/10 bg-zinc-900 px-2.5 py-1 text-[10px] font-bold text-gray-300 uppercase hover:bg-zinc-800"
              >
                {copiedXdr ? 'Copied XDR' : 'Copy XDR'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  onSelectParticle?.(null);
                }}
                aria-label="Close XDR inspector"
                className="rounded border border-white/10 bg-zinc-900 px-2 py-1 text-[10px] font-bold text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div className="rounded-lg border border-white/5 bg-zinc-950 p-2.5">
              <p className="text-[9px] tracking-widest text-gray-500 uppercase">Fee Bid</p>
              <p className="font-black text-white tabular-nums">{selected.feeBid} gwei</p>
            </div>
            <div className="rounded-lg border border-white/5 bg-zinc-950 p-2.5">
              <p className="text-[9px] tracking-widest text-gray-500 uppercase">Fee / Op</p>
              <p className="font-black text-emerald-400 tabular-nums">
                {selected.envelope.feePerOpStroops.toLocaleString()} stroops
              </p>
            </div>
            <div className="rounded-lg border border-white/5 bg-zinc-950 p-2.5">
              <p className="text-[9px] tracking-widest text-gray-500 uppercase">Operations</p>
              <p className="font-black text-white tabular-nums">
                {selected.envelope.operationCount} op(s)
              </p>
            </div>
            <div className="rounded-lg border border-white/5 bg-zinc-950 p-2.5">
              <p className="text-[9px] tracking-widest text-gray-500 uppercase">Gas Units</p>
              <p className="font-black text-white tabular-nums">
                {selected.gasUnits.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-white/5 bg-zinc-950 p-3">
              <p className="mb-1.5 text-[10px] font-bold tracking-widest text-gray-400 uppercase">
                Decoded XDR Envelope ({selected.envelope.envelopeType})
              </p>
              <pre className="max-h-40 overflow-auto text-[11px] leading-relaxed text-emerald-300">
                {JSON.stringify(
                  {
                    sourceAccount: selected.envelope.sourceAccount,
                    fee: `${selected.envelope.feeStroops} stroops`,
                    seqNum: selected.envelope.seqNum,
                    memo: selected.envelope.memo,
                    operations: selected.envelope.operations,
                    signatures: selected.envelope.signatures,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>

            <div className="rounded-lg border border-white/5 bg-zinc-950 p-3">
              <p className="mb-1.5 text-[10px] font-bold tracking-widest text-gray-400 uppercase">
                Raw Base64 XDR
              </p>
              <code className="block break-all text-[11px] leading-relaxed text-gray-300">
                {selected.envelope.xdrBase64}
              </code>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
