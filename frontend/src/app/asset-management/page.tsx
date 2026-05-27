'use client';

import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useWallet } from '@/contexts/WalletContext';
import { Activity, AlertTriangle, Settings, Shield, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

interface AssetInfo {
  code: string;
  issuer: string;
  supply: string;
  clawbackEnabled: boolean;
  authRequired: boolean;
  authRevocable: boolean;
  trustlines: TrustlineInfo[];
}

interface TrustlineInfo {
  accountId: string;
  balance: string;
  authorized: boolean;
}

interface ClawbackForm {
  targetAccount: string;
  amount: string;
  reason: string;
}

export default function AssetManagementDashboard() {
  const { publicKey } = useWallet();
  const connected = !!publicKey;
  const address = publicKey;
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<AssetInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [clawbackForm, setClawbackForm] = useState<ClawbackForm>({
    targetAccount: '',
    amount: '',
    reason: '',
  });
  const [showClawbackDialog, setShowClawbackDialog] = useState(false);
  const [updatingFlags, setUpdatingFlags] = useState(false);

  // Mock data - replace with actual Horizon API calls
  useEffect(() => {
    if (connected) {
      loadAssets();
    }
  }, [connected]);

  const loadAssets = async () => {
    setLoading(true);
    try {
      // TODO: Replace with actual Horizon API calls
      // This would fetch assets issued by the connected wallet
      const mockAssets: AssetInfo[] = [
        {
          code: 'USDC',
          issuer: address || '',
          supply: '1000000.0000000',
          clawbackEnabled: true,
          authRequired: true,
          authRevocable: true,
          trustlines: [
            { accountId: 'GBX...123', balance: '500.0000000', authorized: true },
            { accountId: 'GDX...456', balance: '250.0000000', authorized: true },
            { accountId: 'GAX...789', balance: '100.0000000', authorized: false },
          ],
        },
        {
          code: 'TOKEN',
          issuer: address || '',
          supply: '500000.0000000',
          clawbackEnabled: false,
          authRequired: false,
          authRevocable: false,
          trustlines: [{ accountId: 'GTX...321', balance: '1000.0000000', authorized: true }],
        },
      ];
      setAssets(mockAssets);
      setSelectedAsset(mockAssets[0]);
    } catch (error) {
      console.error('Error loading assets:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateAssetFlags = async (assetCode: string, flags: Partial<AssetInfo>) => {
    setUpdatingFlags(true);
    try {
      // TODO: Implement actual Stellar transaction building
      // This would:
      // 1. Build a setOptions operation with the new flags
      // 2. Sign and submit the transaction
      console.log('Updating flags for asset:', assetCode, flags);

      // Update local state for demo
      setAssets((prev) =>
        prev.map((asset) => (asset.code === assetCode ? { ...asset, ...flags } : asset))
      );

      if (selectedAsset?.code === assetCode) {
        setSelectedAsset((prev) => (prev ? { ...prev, ...flags } : null));
      }
    } catch (error) {
      console.error('Error updating flags:', error);
    } finally {
      setUpdatingFlags(false);
    }
  };

  const executeClawback = async () => {
    if (!selectedAsset || !clawbackForm.targetAccount || !clawbackForm.amount) {
      return;
    }

    setLoading(true);
    try {
      // TODO: Implement actual clawback transaction
      // This would:
      // 1. Build a clawback operation
      // 2. Sign and submit the transaction
      console.log('Executing clawback:', {
        asset: selectedAsset.code,
        ...clawbackForm,
      });

      // Reset form and close dialog
      setClawbackForm({ targetAccount: '', amount: '', reason: '' });
      setShowClawbackDialog(false);

      // Reload assets to update trustlines
      await loadAssets();
    } catch (error) {
      console.error('Error executing clawback:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
  };

  if (!connected) {
    return (
      <div className="container mx-auto py-8">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Please connect your wallet to manage assets.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Asset Management Dashboard</h1>
          <p className="text-muted-foreground">
            Manage your Stellar assets, trustlines, and clawback operations
          </p>
        </div>
        <Button onClick={loadAssets} disabled={loading}>
          <Activity className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Asset List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Your Assets
            </CardTitle>
            <CardDescription>Select an asset to manage its settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {assets.map((asset) => (
              <div
                key={asset.code}
                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedAsset?.code === asset.code
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/50'
                }`}
                onClick={() => setSelectedAsset(asset)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{asset.code}</div>
                    <div className="text-sm text-muted-foreground">Supply: {asset.supply}</div>
                  </div>
                  <div className="flex gap-1">
                    {asset.clawbackEnabled && (
                      <Badge variant="secondary" className="text-xs">
                        Clawback
                      </Badge>
                    )}
                    {asset.authRequired && (
                      <Badge variant="outline" className="text-xs">
                        Auth Req
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Asset Details and Controls */}
        <div className="lg:col-span-2 space-y-6">
          {selectedAsset ? (
            <>
              {/* Asset Flags */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Asset Flags - {selectedAsset.code}
                  </CardTitle>
                  <CardDescription>
                    Configure asset behavior and authorization requirements
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label htmlFor="clawback">Clawback Enabled</Label>
                      <p className="text-sm text-muted-foreground">
                        Allow issuer to reclaim tokens from holders
                      </p>
                    </div>
                    <Switch
                      id="clawback"
                      checked={selectedAsset.clawbackEnabled}
                      onCheckedChange={(checked) =>
                        updateAssetFlags(selectedAsset.code, { clawbackEnabled: checked })
                      }
                      disabled={updatingFlags}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label htmlFor="auth-required">Authorization Required</Label>
                      <p className="text-sm text-muted-foreground">
                        Require issuer authorization for trustlines
                      </p>
                    </div>
                    <Switch
                      id="auth-required"
                      checked={selectedAsset.authRequired}
                      onCheckedChange={(checked) =>
                        updateAssetFlags(selectedAsset.code, { authRequired: checked })
                      }
                      disabled={updatingFlags}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label htmlFor="auth-revocable">Authorization Revocable</Label>
                      <p className="text-sm text-muted-foreground">
                        Allow issuer to revoke existing authorizations
                      </p>
                    </div>
                    <Switch
                      id="auth-revocable"
                      checked={selectedAsset.authRevocable}
                      onCheckedChange={(checked) =>
                        updateAssetFlags(selectedAsset.code, { authRevocable: checked })
                      }
                      disabled={updatingFlags}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Trustline Manager */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Trustline Manager
                  </CardTitle>
                  <CardDescription>View and manage accounts holding this asset</CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="all" className="w-full">
                    <TabsList>
                      <TabsTrigger value="all">All Trustlines</TabsTrigger>
                      <TabsTrigger value="authorized">Authorized</TabsTrigger>
                      <TabsTrigger value="unauthorized">Unauthorized</TabsTrigger>
                    </TabsList>

                    <TabsContent value="all" className="space-y-3">
                      {selectedAsset.trustlines.map((trustline, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div>
                            <div className="font-mono text-sm">
                              {formatAddress(trustline.accountId)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Balance: {trustline.balance}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={trustline.authorized ? 'default' : 'destructive'}>
                              {trustline.authorized ? 'Authorized' : 'Unauthorized'}
                            </Badge>
                            {selectedAsset.clawbackEnabled && trustline.authorized && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setClawbackForm({
                                    targetAccount: trustline.accountId,
                                    amount: trustline.balance,
                                    reason: '',
                                  });
                                  setShowClawbackDialog(true);
                                }}
                              >
                                Clawback
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </TabsContent>

                    <TabsContent value="authorized" className="space-y-3">
                      {selectedAsset.trustlines
                        .filter((t) => t.authorized)
                        .map((trustline, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 border rounded-lg"
                          >
                            <div>
                              <div className="font-mono text-sm">
                                {formatAddress(trustline.accountId)}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Balance: {trustline.balance}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="default">Authorized</Badge>
                              {selectedAsset.clawbackEnabled && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setClawbackForm({
                                      targetAccount: trustline.accountId,
                                      amount: trustline.balance,
                                      reason: '',
                                    });
                                    setShowClawbackDialog(true);
                                  }}
                                >
                                  Clawback
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                    </TabsContent>

                    <TabsContent value="unauthorized" className="space-y-3">
                      {selectedAsset.trustlines
                        .filter((t) => !t.authorized)
                        .map((trustline, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 border rounded-lg"
                          >
                            <div>
                              <div className="font-mono text-sm">
                                {formatAddress(trustline.accountId)}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Balance: {trustline.balance}
                              </div>
                            </div>
                            <Badge variant="destructive">Unauthorized</Badge>
                          </div>
                        ))}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Select an asset from the list to manage its settings
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Clawback Dialog */}
      <Dialog open={showClawbackDialog} onOpenChange={setShowClawbackDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Execute Clawback
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-2">
              This action will permanently reclaim tokens from the specified account. This action
              cannot be undone.
            </p>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="target-account">Target Account</Label>
              <Input
                id="target-account"
                value={clawbackForm.targetAccount}
                onChange={(e) =>
                  setClawbackForm((prev) => ({ ...prev, targetAccount: e.target.value }))
                }
                placeholder="G..."
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount to Clawback</Label>
              <Input
                id="amount"
                value={clawbackForm.amount}
                onChange={(e) => setClawbackForm((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="0.0000000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason (Optional)</Label>
              <Input
                id="reason"
                value={clawbackForm.reason}
                onChange={(e) => setClawbackForm((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="Reason for clawback..."
              />
            </div>

            {selectedAsset && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  You are about to clawback {clawbackForm.amount} {selectedAsset.code} from{' '}
                  {formatAddress(clawbackForm.targetAccount)}.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowClawbackDialog(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={executeClawback}
              disabled={loading || !clawbackForm.targetAccount || !clawbackForm.amount}
            >
              {loading ? 'Executing...' : 'Execute Clawback'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
