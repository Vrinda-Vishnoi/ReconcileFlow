import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Eye, Gauge, PlayCircle, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { cn } from '../lib/utils';

type DemoMode = 'quick' | 'demo' | 'stress';

export function ConfidenceBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return <span className="text-muted-foreground text-xs">N/A</span>;
  const color =
    score >= 90 ? 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20' :
    score >= 50 ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/20' :
    'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20';

  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', color)}>
      {score}%
    </span>
  );
}

export function Runs() {
  const navigate = useNavigate();
  const [isSimulating, setIsSimulating] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['runs'],
    queryFn: () => api.get('/runs'),
    refetchInterval: 10000,
  });

  const handleSimulate = async (mode: DemoMode) => {
    setIsSimulating(true);
    try {
      const response = await api.post('/runs/generate-settlement', { mode });
      await refetch();
      navigate(`/runs/${response.runId}`);
    } catch (error: any) {
      window.alert(error.message || 'Unable to start simulation');
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Reconciliation Runs</h1>
          <p className="text-sm text-muted-foreground">
            Run curated payment settlement demos and inspect the matching evidence.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => handleSimulate('quick')} disabled={isSimulating}>
            <PlayCircle className="mr-2 h-4 w-4" />
            Quick Demo
          </Button>
          <Button variant="outline" onClick={() => handleSimulate('demo')} disabled={isSimulating}>
            <Gauge className="mr-2 h-4 w-4" />
            Full Demo
          </Button>
          <Button variant="outline" onClick={() => handleSimulate('stress')} disabled={isSimulating}>
            <Zap className="mr-2 h-4 w-4" />
            Stress Test
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Runs</CardTitle>
          <CardDescription>
            Sorted by most recent. Open a run to inspect mismatches, amount deltas, confidence scores, and manual review actions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading runs...</div>
          ) : data?.runs?.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Matched</TableHead>
                  <TableHead>Partial</TableHead>
                  <TableHead>Unmatched</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.runs.map((run: any) => (
                  <TableRow key={run.id} className="group">
                    <TableCell className="font-mono text-xs font-medium">
                      <Link to={`/runs/${run.id}`} className="hover:text-primary hover:underline">
                        {run.id.substring(0, 12)}...
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        run.status === 'COMPLETED' ? 'success' :
                        run.status === 'FAILED' ? 'destructive' :
                        'outline'
                      }>
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-green-600 dark:text-green-500">
                      {run.totalMatched}
                    </TableCell>
                    <TableCell className="font-medium text-yellow-600 dark:text-yellow-400">
                      {run.totalPartial}
                    </TableCell>
                    <TableCell>
                      {run.totalUnmatched > 0 ? (
                        <span className="flex items-center gap-1 font-medium text-destructive">
                          <AlertCircle className="h-3 w-3" />
                          {run.totalUnmatched}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell>{run.totalProcessed}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(run.startedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/runs/${run.id}`}>
                          <Eye className="mr-1 h-4 w-4" />
                          Details
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-lg border border-dashed bg-muted/20 py-12 text-center text-muted-foreground">
              No runs found. Start with Quick Demo.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
