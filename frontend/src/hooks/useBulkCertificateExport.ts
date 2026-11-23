import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  CertificateItem,
  WorkerMessage,
  WorkerStartPayload,
} from '@/workers/bulk-certificate.worker';

export interface ExportProgress {
  current: number;
  total: number;
  percentage: number;
  etaSeconds: number;
  currentName: string;
}

export interface ExportResult {
  zipBlob: Blob;
  totalCertificates: number;
  durationMs: number;
  fileCount: number;
}

export function useBulkCertificateExport() {
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<ExportProgress>({
    current: 0,
    total: 0,
    percentage: 0,
    etaSeconds: 0,
    currentName: '',
  });
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const cleanupWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupWorker();
    };
  }, [cleanupWorker]);

  const startExport = useCallback(
    async (certificates: CertificateItem[]) => {
      if (!certificates || certificates.length === 0) {
        setError('No certificates provided for export');
        return;
      }

      cleanupWorker();
      setIsExporting(true);
      setError(null);
      setResult(null);
      setProgress({
        current: 0,
        total: certificates.length,
        percentage: 0,
        etaSeconds: Math.ceil(certificates.length * 0.04),
        currentName: certificates[0]?.recipientName || '',
      });

      try {
        const worker = new Worker(
          new URL('../workers/bulk-certificate.worker.ts', import.meta.url),
          { type: 'module' }
        );
        workerRef.current = worker;

        worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
          const msg = e.data;
          if (msg.type === 'PROGRESS') {
            setProgress({
              current: msg.current,
              total: msg.total,
              percentage: msg.percentage,
              etaSeconds: msg.etaSeconds,
              currentName: msg.currentName,
            });
          } else if (msg.type === 'COMPLETE') {
            setResult({
              zipBlob: msg.zipBlob,
              totalCertificates: msg.totalCertificates,
              durationMs: msg.durationMs,
              fileCount: msg.fileCount,
            });
            setIsExporting(false);
            cleanupWorker();
          } else if (msg.type === 'ERROR') {
            setError(msg.error);
            setIsExporting(false);
            cleanupWorker();
          }
        };

        worker.onerror = (err) => {
          setError(err.message || 'Worker thread error');
          setIsExporting(false);
          cleanupWorker();
        };

        const payload: WorkerStartPayload = {
          certificates,
          batchSize: 5,
        };
        worker.postMessage(payload);
      } catch (err: any) {
        setError(err?.message || 'Failed to initialize export worker');
        setIsExporting(false);
      }
    },
    [cleanupWorker]
  );

  const cancelExport = useCallback(() => {
    cleanupWorker();
    setIsExporting(false);
    setProgress({
      current: 0,
      total: 0,
      percentage: 0,
      etaSeconds: 0,
      currentName: '',
    });
  }, [cleanupWorker]);

  const downloadZip = useCallback(
    (filename = 'certificates_archive.zip') => {
      if (!result?.zipBlob) return;
      const url = URL.createObjectURL(result.zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    [result]
  );

  const reset = useCallback(() => {
    cancelExport();
    setResult(null);
    setError(null);
  }, [cancelExport]);

  return {
    startExport,
    cancelExport,
    downloadZip,
    reset,
    isExporting,
    progress,
    result,
    error,
  };
}
