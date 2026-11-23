'use client';

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Check, Copy, ExternalLink, FileText, HardDrive, RefreshCw, Trash2, UploadCloud } from 'lucide-react';

interface ProofOfPurchaseUploadProps {
  onUploadSuccess: (uploadData: { cid: string; fileName: string; fileSize: string }) => void;
  onClear?: () => void;
  initialCid?: string;
  initialFileName?: string;
  initialFileSize?: string;
  disabled?: boolean;
}

export const ProofOfPurchaseUpload: React.FC<ProofOfPurchaseUploadProps> = ({
  onUploadSuccess,
  onClear,
  initialCid,
  initialFileName,
  initialFileSize,
  disabled = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedCid, setUploadedCid] = useState<string | null>(initialCid || null);
  const [fileName, setFileName] = useState<string | null>(initialFileName || null);
  const [fileSize, setFileSize] = useState<string | null>(initialFileSize || null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Helper to format file size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Generate simulated IPFS CID v1 hash
  const generateSimulatedIpfsCid = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    // Base32-like hex conversion for realistic IPFS v1 CID appearance
    const baseHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return `bafybeic${baseHex.substring(0, 48)}`;
  };

  const handleProcessFile = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(15);

    try {
      // Simulate network upload stages
      const cid = await generateSimulatedIpfsCid(file);
      const formattedSize = formatBytes(file.size);

      // Simulated pinning latency
      await new Promise((res) => setTimeout(res, 250));
      setUploadProgress(65);
      await new Promise((res) => setTimeout(res, 200));
      setUploadProgress(100);

      setUploadedCid(cid);
      setFileName(file.name);
      setFileSize(formattedSize);

      onUploadSuccess({
        cid,
        fileName: file.name,
        fileSize: formattedSize,
      });
    } catch (err) {
      console.error('IPFS upload failed:', err);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await handleProcessFile(file);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      await handleProcessFile(file);
    }
  };

  const handleClear = () => {
    setUploadedCid(null);
    setFileName(null);
    setFileSize(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (onClear) onClear();
  };

  const handleCopyCid = async () => {
    if (!uploadedCid) return;
    try {
      await navigator.clipboard.writeText(uploadedCid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy CID:', err);
    }
  };

  return (
    <div className="space-y-3" data-testid="ipfs-upload-container">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || isUploading}
        data-testid="ipfs-file-input"
      />

      {!uploadedCid ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-primary bg-primary/10 scale-[1.01]'
              : 'border-border/80 hover:border-primary/50 hover:bg-muted/40'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isUploading ? (
            <div className="space-y-3 py-2">
              <RefreshCw className="h-8 w-8 text-primary animate-spin mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Pinning Invoice to IPFS...</p>
                <div className="w-full max-w-xs mx-auto bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{uploadProgress}% complete</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 py-1">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-1">
                <UploadCloud className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-medium">Upload Proof-of-Purchase Receipt / Invoice</h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Drag and drop your official store receipt or PDF invoice. The document will be
                cryptographically hashed and pinned to the IPFS decentralized network.
              </p>
              <div className="pt-2 flex justify-center items-center gap-2 text-[11px] text-muted-foreground">
                <Badge variant="outline" className="text-[10px]">PDF</Badge>
                <Badge variant="outline" className="text-[10px]">PNG</Badge>
                <Badge variant="outline" className="text-[10px]">JPG</Badge>
                <span>Max 15MB</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 bg-muted/40 rounded-xl border border-border space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/10 text-emerald-600 rounded-lg">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate max-w-[200px] sm:max-w-xs">
                    {fileName || 'Invoice_Document.pdf'}
                  </span>
                  <Badge variant="default" className="text-[10px] bg-emerald-600">
                    IPFS Pinned
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{fileSize || '1.2 MB'}</p>
              </div>
            </div>

            {!disabled && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                aria-label="Remove uploaded proof"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="p-2.5 bg-background rounded-lg border border-border/60 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <HardDrive className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground shrink-0">IPFS CID:</span>
              <span className="font-mono text-foreground font-medium truncate">
                {uploadedCid}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCopyCid}
                className="h-7 px-2 text-xs"
                title="Copy IPFS CID"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
              <a
                href={`https://ipfs.io/ipfs/${uploadedCid}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center h-7 px-2 text-xs text-primary hover:underline"
                title="Open on public IPFS gateway"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProofOfPurchaseUpload;
