'use client';

import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { formatDistanceToNow, formatNumber } from '@/lib/utils';
import { AlertTriangle, ArrowRightLeft, Clock, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

interface PointsData {
  balance: number;
  lifetimeEarned: number;
  expiringSoon: number;
  conversionRate: number;
  conversions: { points: number; tokens: number; timestamp: number }[];
}

export default function RewardsDashboard() {
  const [points, setPoints] = useState<PointsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [convertAmount, setConvertAmount] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/rewards');
      setPoints(res.data);
    } catch (error) {
      console.error('Error fetching rewards:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConvert = async () => {
    if (!convertAmount || parseInt(convertAmount) <= 0) return;

    try {
      await api.post('/rewards/convert', { points: parseInt(convertAmount) });
      setConvertAmount('');
      fetchData();
    } catch (error) {
      console.error('Error converting rewards:', error);
    }
  };

  if (loading) return <div className="flex justify-center min-h-[400px] items-center"><div className="animate-spin h-10 w-10 border-2 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Rewards</h1><p className="text-muted-foreground">Track points and convert to tokens</p></div>
        <Button variant="outline" onClick={fetchData}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Your Balance</p><p className="text-2xl font-bold">{formatNumber(points?.balance || 0)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Lifetime Earned</p><p className="text-2xl font-bold">{formatNumber(points?.lifetimeEarned || 0)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Conversion Rate</p><p className="text-2xl font-bold">1:{points?.conversionRate || '—'}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Expiring Soon</p><p className="text-2xl font-bold text-orange-500">{formatNumber(points?.expiringSoon || 0)}</p></CardContent></Card>
      </div>

      {points && points.expiringSoon > 0 && (
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          <span className="text-sm text-orange-700">{formatNumber(points.expiringSoon)} points expire soon — convert them before they're gone!</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardHeader><CardTitle className="flex items-center gap-2"><ArrowRightLeft className="h-5 w-5" />Convert Points</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input type="number" placeholder="Points to convert" value={convertAmount} onChange={e => setConvertAmount(e.target.value)} />
            {convertAmount && <p className="text-xs text-muted-foreground">You'll receive {Math.floor(parseInt(convertAmount) / (points?.conversionRate || 1))} tokens</p>}
            <Button onClick={handleConvert} className="w-full" disabled={!convertAmount}>Convert</Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />Conversion History</CardTitle></CardHeader>
          <CardContent>
            {!points?.conversions?.length ? <p className="text-muted-foreground text-center py-6">No conversions yet</p> :
              <div className="space-y-2">
                {points.conversions.slice(0, 10).map((c, i) => (
                  <div key={i} className="flex justify-between p-2 bg-muted/50 rounded text-sm">
                    <span>{formatNumber(c.points)} pts → {formatNumber(c.tokens)} tokens</span>
                    <span className="text-muted-foreground">{formatDistanceToNow(c.timestamp)}</span>
                  </div>
                ))}
              </div>
            }
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
