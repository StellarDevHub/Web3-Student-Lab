'use client';

import { useState } from 'react';

import { CertificateData, generateCertificateCanvas } from '@/lib/certificate-generator';
import {
  ArchiveFile,
  CarArchiveResult,
  downloadCarFile,
  buildCarArchive,
  exportKeyRaw,
  generateArchiveKey,
  parseCarArchive,
  pinWithFallback,
  type PinResult,
} from '@/lib/storage/ipfs';

/**
 * Decentralized IPFS metadata pinner with a local CAR-file archiver (Issue #1402).
 *
 * Packages the rendered certificate image plus its metadata into a single
 * CARv1 archive, entirely in the browser: chunked, content-addressed,
 * optionally client-side encrypted, and downloadable before anything is
 * pinned anywhere. Pinning then goes through this app's own backend (which
 * wraps Pinata) with a directly-reachable node offered as a fallback — see
 * `src/lib/storage/ipfs.ts` for why that split exists.
 */
export function IpfsArchivePanel({ data }: { data: CertificateData }) {
  const [encrypt, setEncrypt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archive, setArchive] = useState<CarArchiveResult | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [exportedKey, setExportedKey] = useState<string | null>(null);
  const [pinResult, setPinResult] = useState<PinResult | null>(null);
  const [pinning, setPinning] = useState(false);

  const canArchive = Boolean(data.recipientName && data.certificateId);

  const canvasToBytes = (canvas: HTMLCanvasElement): Promise<Uint8Array> =>
    new Promise((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        if (!blob) return reject(new Error('Canvas failed to produce a PNG blob'));
        resolve(new Uint8Array(await blob.arrayBuffer()));
      }, 'image/png');
    });

  const buildArchive = async () => {
    setBusy(true);
    setError(null);
    setVerified(null);
    setExportedKey(null);
    setPinResult(null);

    try {
      const canvas = await generateCertificateCanvas(data);
      const imageBytes = await canvasToBytes(canvas);
      const metadataBytes = new TextEncoder().encode(
        JSON.stringify(
          {
            recipientName: data.recipientName,
            courseName: data.courseName,
            certificateId: data.certificateId,
            issueDate: data.issueDate,
            transactionHash: data.transactionHash,
            instructorName: data.instructorName,
          },
          null,
          2,
        ),
      );

      const files: ArchiveFile[] = [
        { name: 'certificate.png', data: imageBytes, mimeType: 'image/png' },
        { name: 'metadata.json', data: metadataBytes, mimeType: 'application/json' },
      ];

      const encryptionKey = encrypt ? await generateArchiveKey() : undefined;
      const result = await buildCarArchive(files, { encryptionKey });
      setArchive(result);

      if (encryptionKey) {
        setExportedKey(await exportKeyRaw(encryptionKey));
      }

      // Round-trip verification, right here — the CID it shows is only
      // "authentic" if the archive it was computed from actually parses back.
      const parsed = parseCarArchive(result.bytes);
      setVerified(parsed.blocks.length === result.totalBlocks);

      downloadCarFile(result.bytes, `certificate-${data.certificateId || 'archive'}.car`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build the archive');
    } finally {
      setBusy(false);
    }
  };

  const pinArchive = async () => {
    if (!archive) return;
    setPinning(true);
    try {
      const result = await pinWithFallback(archive.bytes, undefined, fetch, {
        resourceType: 'certificate-archive',
        resourceId: data.certificateId || 'unknown',
        name: `certificate-${data.certificateId || 'archive'}.car`,
      });
      setPinResult(result);
    } catch (err) {
      setPinResult({ attempts: [], pinnedBy: null });
      setError(err instanceof Error ? err.message : 'Pinning failed');
    } finally {
      setPinning(false);
    }
  };

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-6 shadow-lg">
      <h3 className="mb-2 text-sm font-bold tracking-widest text-zinc-300 uppercase">
        IPFS archive (CAR)
      </h3>
      <p className="mb-4 text-xs text-zinc-500">
        Bundles the certificate image and metadata into a content-addressed CARv1 file, right in
        your browser, before anything touches a network.
      </p>

      <label className="mb-4 flex items-center gap-2 text-xs text-zinc-400">
        <input
          type="checkbox"
          checked={encrypt}
          onChange={(e) => setEncrypt(e.target.checked)}
          className="accent-red-600"
        />
        Encrypt chunks with AES-256-GCM before hashing
      </label>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!canArchive || busy}
          onClick={() => void buildArchive()}
          className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-bold tracking-widest text-white uppercase transition hover:border-red-500/50 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Building…' : 'Build & download .car'}
        </button>

        {archive && (
          <button
            type="button"
            disabled={pinning}
            onClick={() => void pinArchive()}
            className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-bold tracking-widest text-white uppercase transition hover:border-red-500/50 hover:bg-red-500/10 disabled:opacity-40"
          >
            {pinning ? 'Pinning…' : 'Pin archive'}
          </button>
        )}
      </div>

      {!canArchive && (
        <p className="mt-3 text-[11px] text-amber-400">
          Fill in the recipient name and certificate id before archiving.
        </p>
      )}

      {error && <p className="mt-3 text-[11px] text-red-400">{error}</p>}

      {archive && (
        <div className="mt-4 space-y-2 rounded-2xl border border-zinc-800 bg-black/40 p-4 text-[11px] text-zinc-400">
          <p>
            Root CID:{' '}
            <span className="break-all font-mono text-emerald-400">{archive.rootCid}</span>
          </p>
          <p>
            {archive.totalBlocks} blocks · {archive.totalBytesStored} bytes stored
            {archive.dedupedBytes > 0 && ` · ${archive.dedupedBytes} bytes deduplicated`}
          </p>
          <p>
            Round-trip verification:{' '}
            <span className={verified ? 'text-emerald-400' : 'text-red-400'}>
              {verified ? 'archive parses back cleanly' : 'FAILED'}
            </span>
          </p>
          {archive.encrypted && (
            <p className="text-amber-400">
              Encrypted. Save this key now — it is never stored anywhere:{' '}
              <span className="break-all font-mono">{exportedKey}</span>
            </p>
          )}
        </div>
      )}

      {pinResult && (
        <div className="mt-4 space-y-1 rounded-2xl border border-zinc-800 bg-black/40 p-4 text-[11px] text-zinc-400">
          <p>
            {pinResult.pinnedBy ? (
              <>
                Pinned by <span className="text-emerald-400">{pinResult.pinnedBy}</span>
              </>
            ) : (
              <span className="text-red-400">All pinning gateways failed</span>
            )}
          </p>
          <ul className="space-y-1">
            {pinResult.attempts.map((attempt) => (
              <li key={attempt.gateway}>
                {attempt.gateway}: {attempt.ok ? 'ok' : attempt.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
