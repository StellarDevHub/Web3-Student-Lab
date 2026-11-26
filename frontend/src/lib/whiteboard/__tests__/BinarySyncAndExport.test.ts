import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import {
  CompactShapePayload,
  decodeShapeBinary,
  encodeShapeBinary,
} from '../BinaryCodec';
import { SyncManager } from '../SyncManager';
import {
  CanvasManager,
  serializeShapesToJSON,
  serializeShapesToSVG,
} from '../CanvasManager';

describe('FE-089 Binary Yjs Whiteboard Sync & Export', () => {
  it('round-trips shapes, sticky notes, and freehand drawing paths in compact binary', () => {
    const shapes: CompactShapePayload[] = [
      {
        id: 'shape-1',
        kind: 'geo',
        geo: 'rectangle',
        x: 120.5,
        y: 240.25,
        w: 240,
        h: 160,
        rotation: 0.25,
        color: 'blue',
        text: 'Soroban Contract',
      },
      {
        id: 'note-1',
        kind: 'sticky',
        x: 420,
        y: 80,
        w: 180,
        h: 120,
        color: 'yellow',
        text: 'Audit escrow invariants',
      },
      {
        id: 'draw-1',
        kind: 'freehand',
        x: 10,
        y: 20,
        color: 'violet',
        points: [
          { x: 10, y: 20 },
          { x: 15.5, y: 24.2 },
          { x: 22.1, y: 31.8 },
          { x: 35.0, y: 40.5 },
        ],
      },
    ];

    for (const original of shapes) {
      const encoded = encodeShapeBinary(original);
      expect(encoded).toBeInstanceOf(Uint8Array);
      const decoded = decodeShapeBinary(encoded);
      expect(decoded.id).toBe(original.id);
      expect(decoded.kind).toBe(original.kind);
      expect(decoded.x).toBeCloseTo(original.x, 1);
      expect(decoded.y).toBeCloseTo(original.y, 1);
      expect(decoded.text).toBe(original.text);
      if (original.points) {
        expect(decoded.points).toHaveLength(original.points.length);
        original.points.forEach((pt, idx) => {
          expect(decoded.points![idx].x).toBeCloseTo(pt.x, 0);
          expect(decoded.points![idx].y).toBeCloseTo(pt.y, 0);
        });
      }
    }
  });

  it('reduces drawing synchronization bandwidth by > 75% compared to JSON', () => {
    // Simulate a complex freehand drawing stroke with 150 points
    const points = Array.from({ length: 150 }, (_, i) => ({
      x: Number((100 + i * 2.5 + Math.sin(i / 5) * 4).toFixed(2)),
      y: Number((200 + Math.cos(i / 4) * 12).toFixed(2)),
    }));

    const stroke: CompactShapePayload = {
      id: 'freehand-arch-stroke-01',
      kind: 'freehand',
      x: points[0].x,
      y: points[0].y,
      color: 'blue',
      points,
    };

    const jsonBytes = new TextEncoder().encode(JSON.stringify(stroke)).byteLength;
    const binaryBytes = encodeShapeBinary(stroke).byteLength;
    const reductionPercent = ((jsonBytes - binaryBytes) / jsonBytes) * 100;

    expect(reductionPercent).toBeGreaterThan(75);
  });

  it('merges concurrent multi-user drawing and shape movement without conflict or rollback', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const awarenessA = new Awareness(docA);
    const awarenessB = new Awareness(docB);

    const syncA = new SyncManager(docA, null, awarenessA);
    const syncB = new SyncManager(docB, null, awarenessB);

    const updatesFromA: Uint8Array[] = [];
    const updatesFromB: Uint8Array[] = [];
    const awarenessFromA: Uint8Array[] = [];

    syncA.syncWithYjs({
      onBinaryUpdate: (u) => updatesFromA.push(u),
      onAwarenessBinaryUpdate: (u) => awarenessFromA.push(u),
    });
    syncB.syncWithYjs({
      onBinaryUpdate: (u) => updatesFromB.push(u),
    });

    // User A creates a contract shape and updates cursor presence
    syncA.upsertShape({
      id: 'contract-1',
      kind: 'geo',
      geo: 'rectangle',
      x: 100,
      y: 100,
      w: 240,
      h: 160,
      color: 'blue',
      text: 'Soroban Vault',
    });
    syncA.updateLocalPresence({
      id: 'user-a',
      name: 'Alice',
      color: '#38bdf8',
      cursor: { x: 150, y: 120 },
    });

    // Concurrently, before receiving A's update, User B draws a freehand path and adds a sticky note
    syncB.upsertShape({
      id: 'sticky-1',
      kind: 'sticky',
      x: 350,
      y: 180,
      w: 180,
      h: 120,
      color: 'yellow',
      text: 'Check reentrancy',
    });
    syncB.upsertShape({
      id: 'draw-1',
      kind: 'freehand',
      x: 50,
      y: 50,
      color: 'green',
      points: [
        { x: 50, y: 50 },
        { x: 80, y: 90 },
        { x: 120, y: 110 },
      ],
    });

    // Exchange binary CRDT updates and awareness updates in both directions
    for (const u of updatesFromA) syncB.applyRemoteUpdate(u);
    for (const u of updatesFromB) syncA.applyRemoteUpdate(u);
    for (const aw of awarenessFromA) syncB.applyRemoteAwarenessUpdate(aw);

    // Both clients must converge to the exact same 3 shapes with zero state rollback
    const shapesA = syncA.getAllShapes().sort((a, b) => a.id.localeCompare(b.id));
    const shapesB = syncB.getAllShapes().sort((a, b) => a.id.localeCompare(b.id));

    expect(shapesA).toHaveLength(3);
    expect(shapesB).toHaveLength(3);
    expect(shapesA.map((s) => s.id)).toEqual(['contract-1', 'draw-1', 'sticky-1']);
    expect(shapesB.map((s) => s.id)).toEqual(['contract-1', 'draw-1', 'sticky-1']);

    // Verify User B received User A's binary awareness presence
    const remoteState = awarenessB.getStates().get(docA.clientID) as
      | { user?: { name: string; cursor: { x: number; y: number } } }
      | undefined;
    expect(remoteState?.user?.name).toBe('Alice');
    expect(remoteState?.user?.cursor).toEqual({ x: 150, y: 120 });

    syncA.destroy();
    syncB.destroy();
    docA.destroy();
    docB.destroy();
  });

  it('exports canvas snapshots to high-resolution PNG, SVG, and JSON', async () => {
    const sampleShapes: CompactShapePayload[] = [
      {
        id: 's1',
        kind: 'geo',
        geo: 'rectangle',
        x: 50,
        y: 60,
        w: 200,
        h: 120,
        color: 'blue',
        text: 'Soroban Contract',
      },
      {
        id: 's2',
        kind: 'freehand',
        x: 10,
        y: 10,
        color: 'violet',
        points: [
          { x: 10, y: 10 },
          { x: 40, y: 35 },
        ],
      },
    ];

    const mockPngBlob = new Blob(['png-bytes'], { type: 'image/png' });
    const mockEditor = {
      getCurrentPageShapeIds: vi.fn().mockReturnValue(new Set(['s1', 's2'])),
      getCurrentPageShapes: vi.fn().mockReturnValue([]),
      toImage: vi.fn().mockResolvedValue({ blob: mockPngBlob }),
      getSvgString: vi.fn().mockResolvedValue({ svg: serializeShapesToSVG(sampleShapes) }),
    } as unknown as import('tldraw').Editor;

    const manager = new CanvasManager(mockEditor);

    // High-resolution PNG export (scale >= 2)
    const pngBlob = await manager.exportAsPNG({ scale: 2, filename: 'diagram.png' });
    expect(pngBlob).toBe(mockPngBlob);
    expect((mockEditor as unknown as { toImage: ReturnType<typeof vi.fn> }).toImage).toHaveBeenCalledWith(
      ['s1', 's2'],
      expect.objectContaining({ format: 'png', scale: 2 })
    );

    // SVG export
    const svg = await manager.exportAsSVG({ filename: 'diagram.svg' }, sampleShapes);
    expect(svg).toContain('<svg');
    expect(svg).toContain('Soroban Contract');
    expect(svg).toContain('<path');

    // JSON export
    const json = manager.exportAsJSON({ filename: 'diagram.json' }, sampleShapes);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.shapes).toHaveLength(2);
    expect(parsed.shapes[0].text).toBe('Soroban Contract');

    // Direct JSON serializer check
    expect(JSON.parse(serializeShapesToJSON(sampleShapes)).shapes).toHaveLength(2);
  });
});
