"use client";

import React, { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  Share2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { calculateFileHash, notarizeFileOnChain, verifyFileOnChain, getNotarizationHistory, NotarizationRecord } from "@/lib/notarization";
import { useWallet } from "@/contexts/WalletContext";
import { formatStellarAddress } from "@/lib/soroban";

const NotarizationDashboard: React.FC = () => {
  const { publicKey, connected } = useWallet();
  const [activeTab, setActiveTab] = useState("notarize");
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState<string>("");
  const [metadata, setMetadata] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [history, setHistory] = useState<NotarizationRecord[]>([]);
  const [verificationResult, setVerificationResult] = useState<NotarizationRecord | null | "not_found">(null);
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
        console.error("Hashing failed", error);
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
      console.error("Notarization failed", error);
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
        setFile(null);
        setHash("");
        setMetadata("");
      }, 1000);
    }
  };

  const handleVerify = async () => {
    if (!hash) return;
    
    setIsProcessing(true);
    setVerificationResult(null);
    try {
      const result = await verifyFileOnChain(hash);
      setVerificationResult(result || "not_found");
    } catch (error) {
      console.error("Verification failed", error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 min-h-screen animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
            File Notarization System
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Timestamp file hashes on-chain for immutable proof of existence.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {connected ? (
            <Badge variant="outline" className="px-4 py-2 text-sm bg-green-500/10 text-green-600 border-green-500/20">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {formatStellarAddress(publicKey || "")}
            </Badge>
          ) : (
            <Badge variant="outline" className="px-4 py-2 text-sm bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
              <AlertCircle className="w-4 h-4 mr-2" />
              Wallet Not Connected
            </Badge>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8 p-1 bg-muted/50 rounded-xl">
          <TabsTrigger value="notarize" className="rounded-lg transition-all duration-300">
            <Upload className="w-4 h-4 mr-2" />
            Notarize
          </TabsTrigger>
          <TabsTrigger value="verify" className="rounded-lg transition-all duration-300">
            <FileCheck className="w-4 h-4 mr-2" />
            Verify
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-lg transition-all duration-300">
            <History className="w-4 h-4 mr-2" />
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="border-2 border-dashed bg-card/50 backdrop-blur-sm overflow-hidden">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-blue-500" />
                      Select File
                    </CardTitle>
                    <CardDescription>
                      Upload the file you wish to notarize. The file itself is never uploaded to the blockchain, only its unique cryptographic hash.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="relative group">
                      <input
                        type="file"
                        onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div className="border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 group-hover:border-blue-500 group-hover:bg-blue-500/5">
                        <Upload className="w-12 h-12 mx-auto text-muted-foreground group-hover:text-blue-500 transition-colors" />
                        <p className="mt-4 font-medium text-lg">
                          {file ? file.name : "Drag and drop file here or click to browse"}
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
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
                      <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-2">
                          <Hash className="w-3 h-3" />
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
                      <ShieldCheck className="w-5 h-5 text-indigo-500" />
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

                    <div className="p-4 rounded-lg bg-indigo-500/5 border border-indigo-500/10 space-y-3">
                      <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-medium">
                        <Clock className="w-4 h-4" />
                        Immortal Timestamp
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Your file will be permanently timestamped on the Stellar network. This provides verifiable evidence of the file's existence at this exact moment.
                      </p>
                    </div>

                    <Button 
                      className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/20"
                      disabled={!hash || !connected || isProcessing}
                      onClick={handleNotarize}
                    >
                      {isProcessing ? "Processing..." : "Notarize on Blockchain"}
                    </Button>

                    {successTx && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-center"
                      >
                        <p className="text-green-600 dark:text-green-400 font-medium flex items-center justify-center gap-2 mb-2">
                          <CheckCircle2 className="w-5 h-5" />
                          Notarization Successful!
                        </p>
                        <a 
                          href={`https://stellar.expert/explorer/testnet/tx/${successTx}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline flex items-center justify-center gap-1"
                        >
                          View Transaction <ExternalLink className="w-3 h-3" />
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
              className="max-w-3xl mx-auto"
            >
              <Card className="shadow-2xl border-blue-500/10">
                <CardHeader className="text-center">
                  <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search className="w-8 h-8 text-blue-600" />
                  </div>
                  <CardTitle className="text-2xl">Verify Proof of Existence</CardTitle>
                  <CardDescription>
                    Provide a file or enter its hash to verify if it has been previously notarized.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="relative group">
                      <input
                        type="file"
                        onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div className="border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 group-hover:border-blue-500 group-hover:bg-blue-500/5">
                        <p className="font-medium">
                          {file ? file.name : "Drop file here to verify"}
                        </p>
                      </div>
                    </div>
                    
                    <div className="relative">
                      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                        <Hash className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <Input
                        placeholder="Or enter SHA-256 hash manually..."
                        className="pl-10 h-12 bg-muted/30"
                        value={hash}
                        onChange={(e) => setHash(e.target.value)}
                      />
                    </div>
                  </div>

                  <Button 
                    className="w-full h-12 text-lg"
                    variant="outline"
                    disabled={!hash || isProcessing}
                    onClick={handleVerify}
                  >
                    {isProcessing ? "Checking Registry..." : "Verify Status"}
                  </Button>

                  {verificationResult && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mt-6"
                    >
                      {verificationResult === "not_found" ? (
                        <div className="p-8 text-center border-2 border-dashed rounded-2xl bg-red-500/5 border-red-500/20">
                          <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
                          <h3 className="text-xl font-bold text-red-600 mb-2">No Proof Found</h3>
                          <p className="text-muted-foreground">
                            This file hash has not been notarized in our registry yet.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-2xl border border-green-500/20 shadow-lg shadow-green-500/5">
                          <div className="bg-green-500 px-6 py-3 flex items-center justify-between text-white">
                            <div className="flex items-center gap-2 font-bold">
                              <ShieldCheck className="w-5 h-5" />
                              VERIFIED PROOF
                            </div>
                            <Badge className="bg-white/20 text-white border-none">On-Chain</Badge>
                          </div>
                          <div className="bg-card p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Timestamp</span>
                                <p className="font-medium">{new Date(Number(verificationResult.proof.timestamp) * 1000).toLocaleString()}</p>
                              </div>
                              <div className="space-y-1 text-right">
                                <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Ledger Seq</span>
                                <p className="font-medium">#{verificationResult.proof.ledger_seq}</p>
                              </div>
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Owner</span>
                                <p className="font-mono text-xs">{formatStellarAddress(verificationResult.owner)}</p>
                              </div>
                              <div className="space-y-1 text-right">
                                <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Status</span>
                                <Badge variant="outline" className="text-green-600 bg-green-500/10">Active</Badge>
                              </div>
                            </div>
                            <div className="pt-4 border-t border-border/50">
                              <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold block mb-1">Metadata</span>
                              <p className="text-sm italic">"{verificationResult.metadata || "No metadata provided"}"</p>
                            </div>
                            <div className="pt-4 border-t border-border/50">
                              <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold block mb-1">File Hash</span>
                              <p className="font-mono text-[10px] break-all text-muted-foreground">{verificationResult.hash}</p>
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
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Database className="w-6 h-6 text-indigo-500" />
                  Your Notarization Registry
                </h2>
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="w-4 h-4" />
                  Export All
                </Button>
              </div>

              {history.length === 0 ? (
                <Card className="border-dashed bg-muted/20">
                  <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                    <FileText className="w-16 h-16 text-muted-foreground/30 mb-4" />
                    <h3 className="text-xl font-medium text-muted-foreground">No records found</h3>
                    <p className="text-muted-foreground mt-2 max-w-sm">
                      Start notarizing files to build your immutable proof registry.
                    </p>
                    <Button 
                      variant="link" 
                      className="mt-4"
                      onClick={() => setActiveTab("notarize")}
                    >
                      Create your first notarization
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {history.map((record, index) => (
                    <motion.div
                      key={record.hash}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card className="h-full hover:shadow-xl transition-all duration-300 group overflow-hidden border-indigo-500/5 hover:border-indigo-500/20">
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-start">
                            <div className="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-600">
                              <FileCheck className="w-6 h-6" />
                            </div>
                            <Badge variant="outline" className="text-[10px] font-mono bg-muted/30">
                              #{record.proof.ledger_seq}
                            </Badge>
                          </div>
                          <CardTitle className="text-lg mt-3 truncate">
                            {record.metadata || "Untitled Document"}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-1 text-xs">
                            <Clock className="w-3 h-3" />
                            {new Date(Number(record.proof.timestamp) * 1000).toLocaleDateString()}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Hash</span>
                            <p className="text-[10px] font-mono break-all text-muted-foreground group-hover:text-foreground transition-colors">
                              {record.hash.substring(0, 32)}...
                            </p>
                          </div>
                          <div className="flex items-center gap-2 pt-2">
                            <Button size="sm" className="flex-1 gap-2 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border-none shadow-none">
                              <Download className="w-3 h-3" />
                              Certificate
                            </Button>
                            <Button size="icon" variant="outline" className="w-8 h-8 rounded-lg">
                              <Share2 className="w-3 h-3" />
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

      <footer className="pt-12 text-center text-sm text-muted-foreground border-t border-border/50">
        <p className="flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4 text-green-500" />
          Powered by Stellar Soroban | Open Source Learning Lab
        </p>
      </footer>
    </div>
  );
};

export default NotarizationDashboard;
