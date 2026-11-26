/**
 * Helpers to export profiler visuals and reports as files.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Serialise an on-screen SVG into a standalone document: adds the namespace,
 * explicit size and a background so it renders the same outside the page.
 */
export function serializeSvg(svg: SVGSVGElement, { background = '#09090b' }: { background?: string } = {}): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  const viewBox = svg.getAttribute('viewBox')?.split(/\s+/).map(Number);
  if (viewBox && viewBox.length === 4) {
    clone.setAttribute('width', String(viewBox[2]));
    clone.setAttribute('height', String(viewBox[3]));
  }

  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', background);
  clone.insertBefore(bg, clone.firstChild);

  const style = document.createElementNS(SVG_NS, 'style');
  style.textContent = 'text{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}';
  clone.insertBefore(style, clone.firstChild);

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

/** Trigger a browser download of `content`. */
export function downloadFile(fileName: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** `counter.wasm` → `counter`, sanitised for use in a file name. */
export function baseName(fileName: string | undefined, fallback = 'contract'): string {
  const stem = (fileName ?? '').replace(/\.wasm$/i, '').replace(/[^\w.-]+/g, '_');
  return stem || fallback;
}
