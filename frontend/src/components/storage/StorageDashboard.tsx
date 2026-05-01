'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { formatBytes, formatDistanceToNow } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import {
  AlertTriangle,
  CheckCircle,
  Cloud,
  Download,
  FileText,
  HardDrive,
  RefreshCw, Share2,
  Shield, Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface StoredFile {
  id: string;
  owner: string;
  name: string;
  total_size: number;
  shard_count: number;
  redundancy: number;
  created_at: number;
  updated_at: number;
}

interface FileShard {
  file_id: string;
  shard_index: number;
  provider: string;
  size: number;
  stored_at: number;
}

interface StorageProvider {
  address: string;
  total_stored: number;
  available_space: number;
  shard_count: number;
  reputation: number;
  last_heartbeat: number;
}

interface ProviderEarnings {
  total_earned: number;
  total_penalties: number;
  proof_count: number;
}

interface StorageProof {
  provider: string;
  file_id: string;
  verified: boolean;
  submitted_at: number;
}

export default function StorageDashboard() {
  const { user } = useAuthStore();
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [providers, setProviders] = useState<StorageProvider[]>([]);
  const [earnings, setEarnings] = useState<ProviderEarnings | null>(null);
  const [selectedFile, setSelectedFile] = useState<StoredFile | null>(null);
  const [fileShards, setFileShards] = useState<FileShard[]>([]);
  const [fileProofs, setFileProofs] = useState<StorageProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [redundancy, setRedundancy] = useState(3);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [filesRes, providersRes, earningsRes] = await Promise.all([
        api.get('/storage/files'),
        api.get('/storage/providers'),
        api.get(`/storage/earnings/${user?.address}`),
      ]);
      setFiles(filesRes.data || []);
      setProviders(providersRes.data || []);
      setEarnings(earningsRes.data || null);
    } catch (e) {
      console.error('Failed to fetch storage data', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchFileDetails = async (fileId: string) => {
    const [shardsRes, proofsRes] = await Promise.all([
      api.get(`/storage/files/${fileId}/shards`),
      api.get(`/storage/files/${fileId}/proofs`),
    ]);
    setFileShards(shardsRes.data || []);
    setFileProofs(proofsRes.data || []);
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadName) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const bytes = new Uint8Array(arrayBuffer);
        const encryptionKey = crypto.getRandomValues(new Uint8Array(32));

        await api.post('/storage/upload', {
          name: uploadName,
          encrypted_data: Array.from(bytes),
          encryption_key: Array.from(encryptionKey),
          redundancy,
        });
        setShowUpload(false);
        setUploadFile(null);
        setUploadName('');
        fetchData();
      };
      reader.readAsArrayBuffer(uploadFile);
    } catch (e) {
      console.error('Upload failed', e);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fileId: string) => {
    await api.delete(`/storage/files/${fileId}`);
    setSelectedFile(null);
    fetchData();
  };

  const handleVerify = async (fileId: string) => {
    const res = await api.get(`/storage/files/${fileId}/verify`);
    alert(res.data.valid ? 'File integrity verified!' : 'File verification failed!');
  };

  const handleRegisterProvider = async () => {
    const space = prompt('Available storage space (bytes):');
    if (space) {
      await api.post('/storage/providers/register', { available_space: parseInt(space) });
      fetchData();
    }
  };

  const handleHeartbeat = async () => {
    await api.post('/storage/providers/heartbeat');
    fetchData();
  };

  const totalStored = files.reduce((sum, f) => sum + f.total_size, 0);
  const totalProviders = providers.length;
  const activeProviders = providers.filter(p => p.last_heartbeat > Date.now() / 1000 - 86400).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Decentralized Storage</h1>
          <p className="text-muted-foreground">Secure, sharded, and redundant file storage</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRegisterProvider}>
            <HardDrive className="mr-2 h-4 w-4" />
            Register Provider
          </Button>
          <Button onClick={() => setShowUpload(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Upload File
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <FileText className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{files.length}</p>
              <p className="text-xs text-muted-foreground">Files Stored</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Cloud className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{formatBytes(totalStored)}</p>
              <p className="text-xs text-muted-foreground">Total Stored</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <HardDrive className="h-8 w-8 text-purple-500" />
            <div>
              <p className="text-2xl font-bold">{activeProviders}/{totalProviders}</p>
              <p className="text-xs text-muted-foreground">Active Providers</p>
            </div>
          </CardContent>
        </Card>
        {earnings && (
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Shield className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{(earnings.total_earned / 1e7).toFixed(1)} XLM</p>
                <p className="text-xs text-muted-foreground">Earnings</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Tabs defaultValue="files">
        <TabsList>
          <TabsTrigger value="files"><FileText className="mr-2 h-4 w-4" />Files</TabsTrigger>
          <TabsTrigger value="providers"><HardDrive className="mr-2 h-4 w-4" />Providers</TabsTrigger>
        </TabsList>

        <TabsContent value="files" className="space-y-4 mt-4">
          {files.length === 0 ? (
            <Card><CardContent className="p-12 text-center text-muted-foreground">
              <Cloud className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No files stored. Upload your first file!</p>
            </CardContent></Card>
          ) : (
            files.map((file) => (
              <Card key={file.id} className="hover:shadow-md cursor-pointer" onClick={() => { setSelectedFile(file); fetchFileDetails(file.id); }}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-8 w-8 text-blue-500" />
                    <div>
                      <p className="font-semibold">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(file.total_size)} · {file.shard_count} shards · {file.redundancy}x redundancy
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{file.redundancy}x</Badge>
                    <span className="text-xs text-muted-foreground">{formatDistanceToNow(file.created_at)}</span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="providers" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleHeartbeat}>
              <RefreshCw className="mr-1 h-3 w-3" /> Send Heartbeat
            </Button>
          </div>
          {providers.length === 0 ? (
            <Card><CardContent className="p-12 text-center text-muted-foreground">
              <HardDrive className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No providers yet. Register as one!</p>
            </CardContent></Card>
          ) : (
            providers.map((provider) => (
              <Card key={provider.address}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-sm">{provider.address.slice(0, 12)}...{provider.address.slice(-6)}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span>Stored: {formatBytes(provider.total_stored)}</span>
                        <span>Available: {formatBytes(provider.available_space)}</span>
                        <span>Shards: {provider.shard_count}</span>
                        <span>Rep: {provider.reputation}%</span>
                      </div>
                    </div>
                    <Badge variant={provider.last_heartbeat > Date.now() / 1000 - 86400 ? 'default' : 'destructive'}>
                      {provider.last_heartbeat > Date.now() / 1000 - 86400 ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                  <Progress value={provider.available_space > 0 ? ((provider.total_stored / (provider.total_stored + provider.available_space)) * 100) : 100} className="mt-2 h-1" />
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload File</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="File name" value={uploadName} onChange={(e) => setUploadName(e.target.value)} />
            <Input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
            <div>
              <label className="text-sm font-medium">Redundancy (copies): {redundancy}</label>
              <input type="range" min={1} max={5} value={redundancy} onChange={(e) => setRedundancy(parseInt(e.target.value))} className="w-full" />
            </div>
            <Button onClick={handleUpload} disabled={uploading || !uploadFile || !uploadName} className="w-full">
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* File Detail Dialog */}
      <Dialog open={!!selectedFile} onOpenChange={() => setSelectedFile(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{selectedFile?.name}</DialogTitle></DialogHeader>
          {selectedFile && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Size:</span> {formatBytes(selectedFile.total_size)}</div>
                <div><span className="text-muted-foreground">Shards:</span> {selectedFile.shard_count}</div>
                <div><span className="text-muted-foreground">Redundancy:</span> {selectedFile.redundancy}x</div>
                <div><span className="text-muted-foreground">Created:</span> {formatDistanceToNow(selectedFile.created_at)}</div>
              </div>
              {fileShards.length > 0 && (
                <div>
                  <p className="font-medium text-sm mb-2">Shards ({fileShards.length})</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {fileShards.map((shard, i) => (
                      <div key={i} className="flex justify-between text-xs p-2 bg-muted rounded">
                        <span>Shard #{shard.shard_index}</span>
                        <span>{formatBytes(shard.size)}</span>
                        <span className="font-mono">{shard.provider.slice(0, 8)}...</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {fileProofs.length > 0 && (
                <div>
                  <p className="font-medium text-sm mb-2">Proofs ({fileProofs.length})</p>
                  {fileProofs.map((proof, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {proof.verified ? <CheckCircle className="h-3 w-3 text-green-500" /> : <AlertTriangle className="h-3 w-3 text-red-500" />}
                      <span className="font-mono">{proof.provider.slice(0, 8)}...</span>
                      <span className="text-muted-foreground">{formatDistanceToNow(proof.submitted_at)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleVerify(selectedFile.id)}>
                  <Shield className="mr-1 h-3 w-3" /> Verify Integrity
                </Button>
                <Button variant="outline" size="sm"><Download className="mr-1 h-3 w-3" /> Download</Button>
                <Button variant="outline" size="sm"><Share2 className="mr-1 h-3 w-3" /> Share</Button>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(selectedFile.id)}>
                  <Trash2 className="mr-1 h-3 w-3" /> Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
