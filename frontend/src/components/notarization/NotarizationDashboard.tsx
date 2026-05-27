'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck,
  Upload,
  FileCheck,
  History,
  Search,
  FileText,
  Clock,
  Database,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Hash,
  Download,
  Share2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import {
  calculateFileHash,
  notarizeFileOnChain,
  verifyFileOnChain,
  getNotarizationHistory,
  NotarizationRecord,
} from '@/lib/notarization';
import { useWallet } from '@/contexts/WalletContext';
import { formatStellarAddress } from '@/lib/soroban';

const NotarizationDashboard: React.FC = () => {
  const { publicKey, connected } = useWallet();
  const [activeTab, setActiveTab] = useState('notarize');
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState<string>('');
  const [metadata, setMetadata] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [history, setHistory] = useState<NotarizationRecord[]>([]);
  const [verificationResult, setVerificationResult] = useState<
    NotarizationRecord | null | 'not_found'
  >(null);
  const [successTx, setSuccessTx] = useState<string | null>(null);

  // Load history when wallet connects
  useEffect(() => {
    if (connected && publicKey) {
      loadHistory();
    }
  }, [connected, publicKey]);

  const loadHistory = async () => {
    if (!publicKey) return;
    const records = await getNotarizationHistory(publicKey);
    setHistory(records);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setIsProcessing(true);
      setProgress(20);
      try {
        const fileHash = await calculateFileHash(selectedFile);
        setHash(fileHash);
        setProgress(100);
      } catch (error) {
        console.error('Hashing failed', error);
      } finally {
        setTimeout(() => setIsProcessing(false), 500);
      }
    }
  };

  const handleNotarize = async () => {
    if (!connected || !publicKey || !hash) return;

    setIsProcessing(true);
    setProgress(30);
    try {
      const txHash = await notarizeFileOnChain(hash, publicKey, metadata);
      setProgress(80);
      setSuccessTx(txHash);
      await loadHistory();
      setProgress(100);
    } catch (error) {
      console.error('Notarization failed', error);
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
        setFile(null);
        setHash('');
        setMetadata('');
      }, 1000);
    }
  };

  const handleVerify = async () => {
    if (!hash) return;

    setIsProcessing(true);
    setVerificationResult(null);
    try {
      const result = await verifyFileOnChain(hash);
      setVerificationResult(result || 'not_found');
    } catch (error) {
      console.error('Verification failed', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="animate-in fade-in mx-auto min-h-screen max-w-6xl space-y-8 p-6 duration-700">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
        <div>
          <h1 className="text-foreground bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent dark:from-blue-400 dark:to-indigo-400">
            File Notarization System
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Timestamp file hashes on-chain for immutable proof of existence.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {connected ? (
            <Badge
              variant="outline"
              className="border-green-500/20 bg-green-500/10 px-4 py-2 text-sm text-green-600"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {formatStellarAddress(publicKey || '')}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-yellow-500/20 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-600"
            >
              <AlertCircle className="mr-2 h-4 w-4" />
              Wallet Not Connected
            </Badge>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/50 mb-8 grid w-full grid-cols-3 rounded-xl p-1">
          <TabsTrigger value="notarize" className="rounded-lg transition-all duration-300">
            <Upload className="mr-2 h-4 w-4" />
            Notarize
          </TabsTrigger>
          <TabsTrigger value="verify" className="rounded-lg transition-all duration-300">
            <FileCheck className="mr-2 h-4 w-4" />
            Verify
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-lg transition-all duration-300">
            <History className="mr-2 h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">
          <TabsContent value="notarize" key="notarize">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                <Card className="bg-card/50 overflow-hidden border-2 border-dashed backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-blue-500" />
                      Select File
                    </CardTitle>
                    <CardDescription>
                      Upload the file you wish to notarize. The file itself is never uploaded to the
                      blockchain, only its unique cryptographic hash.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="group relative">
                      <input
                        type="file"
                        onChange={handleFileChange}
                        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                      />
                      <div className="rounded-xl border-2 border-dashed p-12 text-center transition-all duration-300 group-hover:border-blue-500 group-hover:bg-blue-500/5">
                        <Upload className="text-muted-foreground mx-auto h-12 w-12 transition-colors group-hover:text-blue-500" />
                        <p className="mt-4 text-lg font-medium">
                          {file ? file.name : 'Drag and drop file here or click to browse'}
                        </p>
                        <p className="text-muted-foreground mt-2 text-sm">
                          Maximum file size: 50MB
                        </p>
                      </div>
                    </div>

                    {isProcessing && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Calculating Hash...</span>
                          <span>{progress}%</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                      </div>
                    )}

                    {hash && (
                      <div className="bg-muted/50 border-border/50 rounded-lg border p-4">
                        <label className="text-muted-foreground mb-2 flex items-center gap-1 text-xs font-bold tracking-wider uppercase">
                          <Hash className="h-3 w-3" />
                          SHA-256 Hash
                        </label>
                        <p className="font-mono text-xs break-all text-blue-600 dark:text-blue-400">
                          {hash}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-indigo-500" />
                      Notarization Details
                    </CardTitle>
                    <CardDescription>
                      Add optional metadata to help identify this file later.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Metadata / Description</label>
                      <Input
                        placeholder="e.g. Legal Contract V1, Research Data..."
                        value={metadata}
                        onChange={(e) => setMetadata(e.target.value)}
                        className="bg-muted/30 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>

                    <div className="space-y-3 rounded-lg border border-indigo-500/10 bg-indigo-500/5 p-4">
                      <div className="flex items-center gap-2 font-medium text-indigo-600 dark:text-indigo-400">
                        <Clock className="h-4 w-4" />
                        Immortal Timestamp
                      </div>
                      <p className="text-muted-foreground text-sm">
                        Your file will be permanently timestamped on the Stellar network. This
                        provides verifiable evidence of the file's existence at this exact moment.
                      </p>
                    </div>

                    <Button
                      className="h-12 w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-lg font-semibold shadow-lg shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-700"
                      disabled={!hash || !connected || isProcessing}
                      onClick={handleNotarize}
                    >
                      {isProcessing ? 'Processing...' : 'Notarize on Blockchain'}
                    </Button>

                    {successTx && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="rounded-lg border border-green-500/20 bg-green-500/10 p-4 text-center"
                      >
                        <p className="mb-2 flex items-center justify-center gap-2 font-medium text-green-600 dark:text-green-400">
                          <CheckCircle2 className="h-5 w-5" />
                          Notarization Successful!
                        </p>
                        <a
                          href={`https://stellar.expert/explorer/testnet/tx/${successTx}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1 text-xs text-blue-500 hover:underline"
                        >
                          View Transaction <ExternalLink className="h-3 w-3" />
                        </a>
                      </motion.div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="verify" key="verify">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="mx-auto max-w-3xl"
            >
              <Card className="border-blue-500/10 shadow-2xl">
                <CardHeader className="text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10">
                    <Search className="h-8 w-8 text-blue-600" />
                  </div>
                  <CardTitle className="text-2xl">Verify Proof of Existence</CardTitle>
                  <CardDescription>
                    Provide a file or enter its hash to verify if it has been previously notarized.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="group relative">
                      <input
                        type="file"
                        onChange={handleFileChange}
                        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                      />
                      <div className="rounded-xl border-2 border-dashed p-8 text-center transition-all duration-300 group-hover:border-blue-500 group-hover:bg-blue-500/5">
                        <p className="font-medium">
                          {file ? file.name : 'Drop file here to verify'}
                        </p>
                      </div>
                    </div>

                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                        <Hash className="text-muted-foreground h-4 w-4" />
                      </div>
                      <Input
                        placeholder="Or enter SHA-256 hash manually..."
                        className="bg-muted/30 h-12 pl-10"
                        value={hash}
                        onChange={(e) => setHash(e.target.value)}
                      />
                    </div>
                  </div>

                  <Button
                    className="h-12 w-full text-lg"
                    variant="outline"
                    disabled={!hash || isProcessing}
                    onClick={handleVerify}
                  >
                    {isProcessing ? 'Checking Registry...' : 'Verify Status'}
                  </Button>

                  {verificationResult && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mt-6"
                    >
                      {verificationResult === 'not_found' ? (
                        <div className="rounded-2xl border-2 border-dashed border-red-500/20 bg-red-500/5 p-8 text-center">
                          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
                          <h3 className="mb-2 text-xl font-bold text-red-600">No Proof Found</h3>
                          <p className="text-muted-foreground">
                            This file hash has not been notarized in our registry yet.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-2xl border border-green-500/20 shadow-lg shadow-green-500/5">
                          <div className="flex items-center justify-between bg-green-500 px-6 py-3 text-white">
                            <div className="flex items-center gap-2 font-bold">
                              <ShieldCheck className="h-5 w-5" />
                              VERIFIED PROOF
                            </div>
                            <Badge className="border-none bg-white/20 text-white">On-Chain</Badge>
                          </div>
                          <div className="bg-card space-y-4 p-6">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <span className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
                                  Timestamp
                                </span>
                                <p className="font-medium">
                                  {new Date(
                                    Number(verificationResult.proof.timestamp) * 1000
                                  ).toLocaleString()}
                                </p>
                              </div>
                              <div className="space-y-1 text-right">
                                <span className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
                                  Ledger Seq
                                </span>
                                <p className="font-medium">
                                  #{verificationResult.proof.ledger_seq}
                                </p>
                              </div>
                              <div className="space-y-1">
                                <span className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
                                  Owner
                                </span>
                                <p className="font-mono text-xs">
                                  {formatStellarAddress(verificationResult.owner)}
                                </p>
                              </div>
                              <div className="space-y-1 text-right">
                                <span className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
                                  Status
                                </span>
                                <Badge variant="outline" className="bg-green-500/10 text-green-600">
                                  Active
                                </Badge>
                              </div>
                            </div>
                            <div className="border-border/50 border-t pt-4">
                              <span className="text-muted-foreground mb-1 block text-xs font-bold tracking-wider uppercase">
                                Metadata
                              </span>
                              <p className="text-sm italic">
                                "{verificationResult.metadata || 'No metadata provided'}"
                              </p>
                            </div>
                            <div className="border-border/50 border-t pt-4">
                              <span className="text-muted-foreground mb-1 block text-xs font-bold tracking-wider uppercase">
                                File Hash
                              </span>
                              <p className="text-muted-foreground font-mono text-[10px] break-all">
                                {verificationResult.hash}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          <TabsContent value="history" key="history">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-2xl font-bold">
                  <Database className="h-6 w-6 text-indigo-500" />
                  Your Notarization Registry
                </h2>
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="h-4 w-4" />
                  Export All
                </Button>
              </div>

              {history.length === 0 ? (
                <Card className="bg-muted/20 border-dashed">
                  <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                    <FileText className="text-muted-foreground/30 mb-4 h-16 w-16" />
                    <h3 className="text-muted-foreground text-xl font-medium">No records found</h3>
                    <p className="text-muted-foreground mt-2 max-w-sm">
                      Start notarizing files to build your immutable proof registry.
                    </p>
                    <Button
                      variant="link"
                      className="mt-4"
                      onClick={() => setActiveTab('notarize')}
                    >
                      Create your first notarization
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {history.map((record, index) => (
                    <motion.div
                      key={record.hash}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card className="group h-full overflow-hidden border-indigo-500/5 transition-all duration-300 hover:border-indigo-500/20 hover:shadow-xl">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
                              <FileCheck className="h-6 w-6" />
                            </div>
                            <Badge variant="outline" className="bg-muted/30 font-mono text-[10px]">
                              #{record.proof.ledger_seq}
                            </Badge>
                          </div>
                          <CardTitle className="mt-3 truncate text-lg">
                            {record.metadata || 'Untitled Document'}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-1 text-xs">
                            <Clock className="h-3 w-3" />
                            {new Date(Number(record.proof.timestamp) * 1000).toLocaleDateString()}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-1">
                            <span className="text-muted-foreground text-[10px] font-bold tracking-widest uppercase">
                              Hash
                            </span>
                            <p className="text-muted-foreground group-hover:text-foreground font-mono text-[10px] break-all transition-colors">
                              {record.hash.substring(0, 32)}...
                            </p>
                          </div>
                          <div className="flex items-center gap-2 pt-2">
                            <Button
                              size="sm"
                              className="flex-1 gap-2 border-none bg-blue-500/10 text-blue-600 shadow-none hover:bg-blue-500/20"
                            >
                              <Download className="h-3 w-3" />
                              Certificate
                            </Button>
                            <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg">
                              <Share2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </TabsContent>
        </AnimatePresence>
      </Tabs>

      <footer className="text-muted-foreground border-border/50 border-t pt-12 text-center text-sm">
        <p className="flex items-center justify-center gap-2">
          <ShieldCheck className="h-4 w-4 text-green-500" />
          Powered by Stellar Soroban | Open Source Learning Lab
        </p>
      </footer>
    </div>
  );
};

export default NotarizationDashboard;
