import { Editor, TLShapeId } from 'tldraw';
import type { CompactShapePayload } from './BinaryCodec';

export interface CanvasSnapshotJSON {
  version: 1;
  exportedAt: string;
  shapes: CompactShapePayload[];
}

export interface ExportOptions {
  filename?: string;
  /** Pixel ratio scale for high-resolution PNG exports (default: 2) */
  scale?: number;
  background?: boolean;
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  if (typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates a standalone SVG diagram string from compact canvas shapes.
 * Works both in browser and headless/test environments.
 */
export function serializeShapesToSVG(shapes: CompactShapePayload[]): string {
  let minX = 0;
  let minY = 0;
  let maxX = 800;
  let maxY = 600;

  for (const s of shapes) {
    const w = s.w ?? 160;
    const h = s.h ?? 100;
    minX = Math.min(minX, s.x - 40);
    minY = Math.min(minY, s.y - 40);
    maxX = Math.max(maxX, s.x + w + 40);
    maxY = Math.max(maxY, s.y + h + 40);
    if (s.points) {
      for (const p of s.points) {
        minX = Math.min(minX, p.x - 20);
        minY = Math.min(minY, p.y - 20);
        maxX = Math.max(maxX, p.x + 20);
        maxY = Math.max(maxY, p.y + 20);
      }
    }
  }

  const width = Math.max(200, Math.ceil(maxX - minX));
  const height = Math.max(200, Math.ceil(maxY - minY));

  const elements = shapes.map((shape) => {
    const stroke = shape.color && shape.color !== 'black' ? shape.color : '#38bdf8';
    if (shape.kind === 'freehand' && shape.points && shape.points.length > 0) {
      const d = shape.points
        .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
        .join(' ');
      return `<path id="${escapeXml(shape.id)}" d="${d}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`;
    }

    const w = shape.w ?? 180;
    const h = shape.h ?? 120;
    const fill = shape.kind === 'sticky' ? '#fef08a' : '#18181b';
    const textColor = shape.kind === 'sticky' ? '#18181b' : '#ffffff';
    const label = escapeXml(shape.text ?? shape.kind);

    if (shape.geo === 'ellipse') {
      return `<g id="${escapeXml(shape.id)}"><ellipse cx="${shape.x + w / 2}" cy="${shape.y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fill}" stroke="${escapeXml(stroke)}" stroke-width="2" /><text x="${shape.x + w / 2}" y="${shape.y + h / 2}" fill="${textColor}" font-family="sans-serif" font-size="14" text-anchor="middle" dominant-baseline="middle">${label}</text></g>`;
    }

    return `<g id="${escapeXml(shape.id)}"><rect x="${shape.x}" y="${shape.y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${escapeXml(stroke)}" stroke-width="2" /><text x="${shape.x + w / 2}" y="${shape.y + h / 2}" fill="${textColor}" font-family="sans-serif" font-size="14" text-anchor="middle" dominant-baseline="middle">${label}</text></g>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}"><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#09090b" />${elements.join('')}</svg>`;
}

/**
 * Generates a structured JSON diagram snapshot from compact canvas shapes.
 */
export function serializeShapesToJSON(shapes: CompactShapePayload[]): string {
  const snapshot: CanvasSnapshotJSON = {
    version: 1,
    exportedAt: new Date().toISOString(),
    shapes,
  };
  return JSON.stringify(snapshot, null, 2);
}

export class CanvasManager {
  constructor(private editor: Editor) {}

  public addStellarAccount(x: number, y: number) {
    this.editor.createShapes([
      {
        id: this.editor.generateShapeId(),
        type: 'geo',
        x,
        y,
        props: {
          geo: 'ellipse',
          w: 180,
          h: 180,
          text: 'Stellar Account',
          color: 'orange',
          fill: 'semi',
        },
      },
    ]);
  }

  public addSorobanContract(x: number, y: number) {
    this.editor.createShapes([
      {
        id: this.editor.generateShapeId(),
        type: 'geo',
        x,
        y,
        props: {
          geo: 'rectangle',
          w: 240,
          h: 160,
          text: 'Soroban Contract',
          color: 'blue',
          fill: 'semi',
        },
      },
    ]);
  }

  public addAsset(x: number, y: number) {
    this.editor.createShapes([
      {
        id: this.editor.generateShapeId(),
        type: 'geo',
        x,
        y,
        props: {
          geo: 'diamond',
          w: 180,
          h: 180,
          text: 'Asset',
          color: 'green',
          fill: 'semi',
        },
      },
    ]);
  }

  public addAnchor(x: number, y: number) {
    this.editor.createShapes([
      {
        id: this.editor.generateShapeId(),
        type: 'geo',
        x,
        y,
        props: {
          geo: 'rectangle',
          w: 260,
          h: 180,
          text: 'Anchor (Fiat Bridge)',
          color: 'grey',
          fill: 'pattern',
        },
      },
    ]);
  }

  public addMultisig(x: number, y: number) {
    this.editor.createShapes([
      {
        id: this.editor.generateShapeId(),
        type: 'geo',
        x,
        y,
        props: {
          geo: 'rhombus',
          w: 200,
          h: 200,
          text: 'Multisig (M-of-N)',
          color: 'red',
          fill: 'semi',
        },
      },
    ]);
  }

  public addOracle(x: number, y: number) {
    this.editor.createShapes([
      {
        id: this.editor.generateShapeId(),
        type: 'geo',
        x,
        y,
        props: {
          geo: 'star',
          w: 200,
          h: 200,
          text: 'Oracle (Price Feed)',
          color: 'violet',
          fill: 'semi',
        },
      },
    ]);
  }

  public addStickyNote(x: number, y: number, text = 'Sticky Note') {
    this.editor.createShapes([
      {
        id: this.editor.generateShapeId(),
        type: 'note',
        x,
        y,
        props: {
          color: 'yellow',
          richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
        } as Record<string, unknown>,
      },
    ]);
  }

  public clearCanvas() {
    const shapeIds = this.getAllShapeIds();
    if (shapeIds.length > 0) {
      this.editor.deleteShapes(shapeIds);
    }
  }

  /**
   * Exports the current whiteboard snapshot as a high-resolution PNG (2x scale by default).
   */
  public async exportAsPNG(options: ExportOptions = {}): Promise<Blob | null> {
    const scale = options.scale ?? 2;
    const filename = options.filename ?? `whiteboard-${Date.now()}.png`;
    const shapeIds = this.getAllShapeIds();

    const editorAny = this.editor as unknown as {
      toImage?: (
        ids: TLShapeId[],
        opts: { format: string; scale: number; background: boolean }
      ) => Promise<{ blob: Blob }>;
      exportAs?: (ids: TLShapeId[], format?: string) => Promise<void> | void;
    };

    if (typeof editorAny.toImage === 'function' && shapeIds.length > 0) {
      const { blob } = await editorAny.toImage(shapeIds, {
        format: 'png',
        scale,
        background: options.background ?? true,
      });
      triggerBrowserDownload(blob, filename);
      return blob;
    }

    if (typeof editorAny.exportAs === 'function') {
      await editorAny.exportAs(shapeIds, 'png');
    }
    return null;
  }

  /**
   * Exports the current whiteboard snapshot as an SVG vector diagram.
   */
  public async exportAsSVG(
    options: ExportOptions = {},
    fallbackShapes: CompactShapePayload[] = []
  ): Promise<string> {
    const filename = options.filename ?? `whiteboard-${Date.now()}.svg`;
    const shapeIds = this.getAllShapeIds();

    const editorAny = this.editor as unknown as {
      getSvgString?: (
        ids: TLShapeId[],
        opts?: { background?: boolean }
      ) => Promise<{ svg: string } | undefined>;
    };

    let svgContent: string;
    if (typeof editorAny.getSvgString === 'function' && shapeIds.length > 0) {
      const result = await editorAny.getSvgString(shapeIds, {
        background: options.background ?? true,
      });
      svgContent = result?.svg ?? serializeShapesToSVG(fallbackShapes);
    } else {
      svgContent = serializeShapesToSVG(fallbackShapes);
    }

    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    triggerBrowserDownload(blob, filename);
    return svgContent;
  }

  /**
   * Exports the current whiteboard snapshot as a structured JSON diagram.
   */
  public exportAsJSON(
    options: ExportOptions = {},
    fallbackShapes: CompactShapePayload[] = []
  ): string {
    const filename = options.filename ?? `whiteboard-${Date.now()}.json`;
    const shapes = fallbackShapes.length > 0 ? fallbackShapes : this.getCompactShapesFromEditor();
    const json = serializeShapesToJSON(shapes);
    const blob = new Blob([json], { type: 'application/json' });
    triggerBrowserDownload(blob, filename);
    return json;
  }

  private getAllShapeIds(): TLShapeId[] {
    if (typeof this.editor.getCurrentPageShapeIds === 'function') {
      return Array.from(this.editor.getCurrentPageShapeIds());
    }
    return [];
  }

  private getCompactShapesFromEditor(): CompactShapePayload[] {
    if (typeof this.editor.getCurrentPageShapes !== 'function') {
      return [];
    }
    return this.editor.getCurrentPageShapes().map((shape) => {
      const props = (shape.props as Record<string, unknown>) ?? {};
      return {
        id: String(shape.id),
        kind: shape.type === 'note' ? 'sticky' : shape.type === 'draw' ? 'freehand' : 'geo',
        x: shape.x,
        y: shape.y,
        w: typeof props.w === 'number' ? props.w : undefined,
        h: typeof props.h === 'number' ? props.h : undefined,
        rotation: shape.rotation,
        color: typeof props.color === 'string' ? props.color : 'black',
        geo: typeof props.geo === 'string' ? props.geo : undefined,
        text: typeof props.text === 'string' ? props.text : undefined,
      };
    });
  }
}
