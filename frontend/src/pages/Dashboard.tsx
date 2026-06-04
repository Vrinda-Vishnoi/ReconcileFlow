import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import {
  Activity, Database, CheckCircle2, Clock, AlertTriangle,
  ArrowRight, TrendingUp, ShieldAlert, Layers
} from 'lucide-react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { Socket } from 'socket.io-client';
import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';

export function Dashboard() {
  const { socket } = useOutletContext<{ socket: Socket | null }>();
  const navigate = useNavigate();
  const [realtimeQueue, setRealtimeQueue] = useState<any>(null);
  const [isStartingRun, setIsStartingRun] = useState(false);

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get('/health'),
    refetchInterval: 5000,
  });

  const { data: runsData } = useQuery({
    queryKey: ['runs', 'recent'],
    queryFn: () => api.get('/runs?limit=5'),
  });

  const { data: summary } = useQuery({
    queryKey: ['runs', 'summary'],
    queryFn: () => api.get('/runs/summary'),
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (socket) {
      socket.on('queue_stats', (stats) => setRealtimeQueue(stats));
      socket.emit('subscribe', 'dashboard');
      return () => { socket.off('queue_stats'); };
    }
  }, [socket]);

  const queueStats = realtimeQueue || health?.checks?.queue;
  const dbHealth = health?.checks?.database;
  const latestRun = runsData?.runs?.[0];
  const totals = latestRun
    ? {
        matched: latestRun.totalMatched,
        partial: latestRun.totalPartial,
        unmatched: latestRun.totalUnmatched,
        disputed: latestRun.totalDisputed,
        total: latestRun.totalProcessed,
      }
    : summary?.totals;
  const trend = summary?.trend || [];

  const matchRate = totals
    ? Math.round((totals.matched / Math.max(totals.total, 1)) * 100)
    : null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">System Overview</h1>
        <p className="text-muted-foreground text-sm">Real-time reconciliation engine status.</p>
      </div>

      {/* ── Reconciliation Summary Card ── */}
      {totals && (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-card overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Latest Run Summary
                </CardTitle>
                <CardDescription>
                  {latestRun ? `Run ${latestRun.id.split('-')[0]} evidence snapshot` : 'Last 7 days match performance'}
                </CardDescription>
              </div>
              {matchRate !== null && (
                <div className="text-right">
                  <div className="text-4xl font-extrabold text-primary">{matchRate}%</div>
                  <div className="text-xs text-muted-foreground">match rate</div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="text-center p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="text-2xl font-bold text-green-500">{totals.matched}</div>
                <div className="text-xs text-muted-foreground mt-1">Matched</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <div className="text-2xl font-bold text-yellow-500">{totals.partial}</div>
                <div className="text-xs text-muted-foreground mt-1">Partial</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <div className="text-2xl font-bold text-destructive">{totals.unmatched}</div>
                <div className="text-xs text-muted-foreground mt-1">Unmatched</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <div className="text-2xl font-bold text-purple-500">{totals.disputed}</div>
                <div className="text-xs text-muted-foreground mt-1">Disputed</div>
              </div>
            </div>

            {trend.length > 0 ? (
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                    <defs>
                      <linearGradient id="matched" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="unmatched" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="rgba(255,255,255,0.2)" />
                    <YAxis tick={{ fontSize: 10 }} stroke="rgba(255,255,255,0.2)" />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                    />
                    <Area type="monotone" dataKey="matched" stroke="#22c55e" fill="url(#matched)" strokeWidth={2} />
                    <Area type="monotone" dataKey="unmatched" stroke="#ef4444" fill="url(#unmatched)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-36 flex items-center justify-center border border-dashed rounded-lg text-muted-foreground text-sm">
                Trigger a simulation run to see trend data
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Status Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Database</CardTitle>
            <Database className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-1">
              {dbHealth?.status === 'connected' ? 'Healthy' : 'Degraded'}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              {dbHealth?.latencyMs ? `${dbHealth.latencyMs}ms latency` : 'Checking...'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Jobs</CardTitle>
            <Activity className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-1">{queueStats?.active ?? 0}</div>
            <p className="text-xs text-muted-foreground">Processing right now</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Waiting Jobs</CardTitle>
            <Clock className="w-4 h-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-1">{queueStats?.waiting ?? 0}</div>
            <p className="text-xs text-muted-foreground">In queue</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Failed (DLQ)</CardTitle>
            <AlertTriangle className="w-4 h-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-1">{queueStats?.failed ?? 0}</div>
            <p className="text-xs text-muted-foreground text-destructive">Requires attention</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Recent Runs table ── */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Runs</CardTitle>
              <CardDescription>Latest automated reconciliation runs</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/runs">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {runsData?.runs?.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Matched</TableHead>
                    <TableHead>Mismatches</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runsData.runs.map((run: any) => (
                    <TableRow key={run.id}>
                      <TableCell className="font-mono text-xs">
                        <Link to={`/runs/${run.id}`} className="hover:text-primary hover:underline">
                          {run.id.split('-')[0]}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          run.status === 'COMPLETED' ? 'success' :
                          run.status === 'FAILED' ? 'destructive' : 'outline'
                        }>
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-green-500 font-medium">{run.totalMatched}</TableCell>
                      <TableCell>
                        {run.totalUnmatched > 0 ? (
                          <span className="text-destructive font-medium">{run.totalUnmatched}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-xs">
                        {new Date(run.startedAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 bg-muted/20 rounded-lg border border-dashed">
                <Layers className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <h3 className="text-lg font-medium">No runs yet</h3>
                <p className="text-sm text-muted-foreground mt-1">Trigger a simulation to get started.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Quick Actions ── */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common operations</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-3">
            <Button
              className="w-full justify-between group"
              onClick={async () => {
                setIsStartingRun(true);
                try {
                  const response = await api.post('/runs/generate-settlement', { mode: 'quick' });
                  navigate(`/runs/${response.runId}`);
                } catch (error: any) {
                  window.alert(error.message || 'Unable to start demo run');
                } finally {
                  setIsStartingRun(false);
                }
              }}
              disabled={isStartingRun}
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Start Quick Demo
              </span>
              <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
            </Button>
            <Button variant="outline" className="w-full justify-between group text-destructive hover:bg-destructive/10 border-destructive/20" asChild>
              <Link to="/dlq">
                <span className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  Inspect DLQ
                </span>
                <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
