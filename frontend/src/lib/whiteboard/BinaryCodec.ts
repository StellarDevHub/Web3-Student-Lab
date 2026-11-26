/**
 * Compact binary serializer/deserializer for whiteboard canvas shapes,
 * sticky notes, and freehand drawing paths.
 *
 * Replaces verbose JSON payloads over WebSockets with tight binary buffers
 * (typically >75% smaller than equivalent JSON), using:
 * - 1-byte version + 1-byte shape kind enum
 * - Float32/Int16 quantized coordinates & dimensions
 * - Delta-encoded Int16 points for freehand drawing paths
 * - Compact 1-byte color enum + UTF-8 length-prefixed text/id
 */

export type BinaryShapeKind =
  | 'geo'
  | 'sticky'
  | 'freehand'
  | 'wallet'
  | 'contract'
  | 'actor'
  | 'default';

export interface Point2D {
  x: number;
  y: number;
}

export interface CompactShapePayload {
  id: string;
  kind: BinaryShapeKind;
  x: number;
  y: number;
  w?: number;
  h?: number;
  rotation?: number;
  color?: string;
  geo?: string;
  text?: string;
  /** Freehand drawing path points (in absolute coordinates) */
  points?: Point2D[];
  /** Optional metadata (e.g. wallet address, contract network) */
  meta?: string;
}

const FORMAT_VERSION = 1;

const KIND_TO_CODE: Record<BinaryShapeKind, number> = {
  geo: 0,
  sticky: 1,
  freehand: 2,
  wallet: 3,
  contract: 4,
  actor: 5,
  default: 6,
};

const CODE_TO_KIND: Record<number, BinaryShapeKind> = {
  0: 'geo',
  1: 'sticky',
  2: 'freehand',
  3: 'wallet',
  4: 'contract',
  5: 'actor',
  6: 'default',
};

const COLOR_PALETTE = [
  'black',
  'white',
  'grey',
  'orange',
  'blue',
  'green',
  'red',
  'violet',
  'yellow',
  'light-blue',
  'light-green',
  'light-red',
  'light-violet',
];

const GEO_TYPES = ['rectangle', 'ellipse', 'diamond', 'rhombus', 'star', 'triangle', 'oval'];

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function encodeColor(color?: string): number {
  if (!color) return 0;
  const idx = COLOR_PALETTE.indexOf(color);
  return idx >= 0 ? idx : 0;
}

function decodeColor(code: number): string {
  return COLOR_PALETTE[code] ?? 'black';
}

function encodeGeo(geo?: string): number {
  if (!geo) return 0;
  const idx = GEO_TYPES.indexOf(geo);
  return idx >= 0 ? idx : 0;
}

function decodeGeo(code: number): string {
  return GEO_TYPES[code] ?? 'rectangle';
}

/**
 * Encodes a shape, sticky note, or freehand path into a compact binary Uint8Array.
 */
export function encodeShapeBinary(shape: CompactShapePayload): Uint8Array {
  const idBytes = textEncoder.encode(shape.id);
  const textBytes = shape.text ? textEncoder.encode(shape.text) : new Uint8Array(0);
  const metaBytes = shape.meta ? textEncoder.encode(shape.meta) : new Uint8Array(0);
  const points = shape.points ?? [];

  // Header:
  // [0]: version (u8)
  // [1]: kind (u8)
  // [2]: color (u8)
  // [3]: geo (u8)
  // [4..7]: x (f32)
  // [8..11]: y (f32)
  // [12..13]: w (u16, rounded)
  // [14..15]: h (u16, rounded)
  // [16..17]: rotation (i16, scaled by 1000 rad)
  // [18]: idLen (u8)
  // [19..20]: textLen (u16)
  // [21..22]: metaLen (u16)
  // [23..24]: pointCount (u16)
  const HEADER_SIZE = 25;
  // Points: first point as 2x Float32 (8 bytes) if points.length > 0,
  // subsequent points as delta Int16 (4 bytes each, scaled by 10 for 0.1px precision)
  const pointsByteLen = points.length > 0 ? 8 + (points.length - 1) * 4 : 0;

  const totalSize =
    HEADER_SIZE + idBytes.length + textBytes.length + metaBytes.length + pointsByteLen;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  let offset = 0;
  view.setUint8(offset++, FORMAT_VERSION);
  view.setUint8(offset++, KIND_TO_CODE[shape.kind] ?? 6);
  view.setUint8(offset++, encodeColor(shape.color));
  view.setUint8(offset++, encodeGeo(shape.geo));

  view.setFloat32(offset, shape.x, true);
  offset += 4;
  view.setFloat32(offset, shape.y, true);
  offset += 4;

  view.setUint16(offset, Math.max(0, Math.min(65535, Math.round(shape.w ?? 0))), true);
  offset += 2;
  view.setUint16(offset, Math.max(0, Math.min(65535, Math.round(shape.h ?? 0))), true);
  offset += 2;

  const rotScaled = Math.max(-32768, Math.min(32767, Math.round((shape.rotation ?? 0) * 1000)));
  view.setInt16(offset, rotScaled, true);
  offset += 2;

  const idLen = Math.min(255, idBytes.length);
  view.setUint8(offset++, idLen);
  view.setUint16(offset, Math.min(65535, textBytes.length), true);
  offset += 2;
  view.setUint16(offset, Math.min(65535, metaBytes.length), true);
  offset += 2;
  view.setUint16(offset, Math.min(65535, points.length), true);
  offset += 2;

  bytes.set(idBytes.subarray(0, idLen), offset);
  offset += idLen;

  if (textBytes.length > 0) {
    bytes.set(textBytes.subarray(0, Math.min(65535, textBytes.length)), offset);
    offset += Math.min(65535, textBytes.length);
  }

  if (metaBytes.length > 0) {
    bytes.set(metaBytes.subarray(0, Math.min(65535, metaBytes.length)), offset);
    offset += Math.min(65535, metaBytes.length);
  }

  if (points.length > 0) {
    let prevX = points[0].x;
    let prevY = points[0].y;
    view.setFloat32(offset, prevX, true);
    offset += 4;
    view.setFloat32(offset, prevY, true);
    offset += 4;

    for (let i = 1; i < points.length; i++) {
      const dx = Math.max(-32768, Math.min(32767, Math.round((points[i].x - prevX) * 10)));
      const dy = Math.max(-32768, Math.min(32767, Math.round((points[i].y - prevY) * 10)));
      view.setInt16(offset, dx, true);
      offset += 2;
      view.setInt16(offset, dy, true);
      offset += 2;
      prevX += dx / 10;
      prevY += dy / 10;
    }
  }

  return bytes;
}

/**
 * Decodes a compact binary Uint8Array back into a CompactShapePayload.
 */
export function decodeShapeBinary(data: Uint8Array): CompactShapePayload {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  const version = view.getUint8(offset++);
  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported binary shape format version: ${version}`);
  }

  const kind = CODE_TO_KIND[view.getUint8(offset++)] ?? 'default';
  const color = decodeColor(view.getUint8(offset++));
  const geo = decodeGeo(view.getUint8(offset++));

  const x = view.getFloat32(offset, true);
  offset += 4;
  const y = view.getFloat32(offset, true);
  offset += 4;

  const w = view.getUint16(offset, true);
  offset += 2;
  const h = view.getUint16(offset, true);
  offset += 2;

  const rotation = view.getInt16(offset, true) / 1000;
  offset += 2;

  const idLen = view.getUint8(offset++);
  const textLen = view.getUint16(offset, true);
  offset += 2;
  const metaLen = view.getUint16(offset, true);
  offset += 2;
  const pointCount = view.getUint16(offset, true);
  offset += 2;

  const id = textDecoder.decode(data.subarray(offset, offset + idLen));
  offset += idLen;

  const text =
    textLen > 0 ? textDecoder.decode(data.subarray(offset, offset + textLen)) : undefined;
  offset += textLen;

  const meta =
    metaLen > 0 ? textDecoder.decode(data.subarray(offset, offset + metaLen)) : undefined;
  offset += metaLen;

  let points: Point2D[] | undefined;
  if (pointCount > 0) {
    points = new Array<Point2D>(pointCount);
    let curX = view.getFloat32(offset, true);
    offset += 4;
    let curY = view.getFloat32(offset, true);
    offset += 4;
    points[0] = { x: Number(curX.toFixed(1)), y: Number(curY.toFixed(1)) };

    for (let i = 1; i < pointCount; i++) {
      const dx = view.getInt16(offset, true) / 10;
      offset += 2;
      const dy = view.getInt16(offset, true) / 10;
      offset += 2;
      curX += dx;
      curY += dy;
      points[i] = { x: Number(curX.toFixed(1)), y: Number(curY.toFixed(1)) };
    }
  }

  return {
    id,
    kind,
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
    w: w || undefined,
    h: h || undefined,
    rotation: rotation || undefined,
    color,
    geo: kind === 'geo' ? geo : undefined,
    text,
    meta,
    points,
  };
}
