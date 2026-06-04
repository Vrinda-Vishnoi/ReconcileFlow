import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Clock,
  Eye,
  FileWarning,
  Gauge,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../lib/api';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { cn } from '../lib/utils';
import { ConfidenceBadge } from './Runs';

type MatchStatus = 'MATCHED' | 'PARTIAL' | 'UNMATCHED' | 'DISPUTED' | 'RESOLVED';
type Filter = 'ALL' | MatchStatus | 'ISSUES';

interface RunDetailResponse {
  id: string;
  source: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  totalProcessed: number;
  totalMatched: number;
  totalUnmatched: number;
  totalPartial: number;
  totalDisputed: number;
  startedAt: string;
  completedAt?: string | null;
  errorMessage?: string | null;
  matches: ReconciliationMatch[];
}

interface ReconciliationMatch {
  id: string;
  status: MatchStatus;
  discrepancyType?: string | null;
  amountDeltaMinor?: string | null;
  confidenceScore?: number | null;
  resolvedReason?: string | null;
  reconciledAt: string;
  order?: {
    externalRef: string;
    amountMinor: string;
    customerEmail?: string | null;
  } | null;
  gatewayTxn?: {
    gatewayRef: string;
    amountMinor: string;
    feeMinor: string;
    receivedAt: string;
  } | null;
  bankSettlement?: {
    utr: string;
    rrn?: string | null;
    amountMinor: string;
    bankName?: string | null;
    settledAt: string;
  } | null;
}

const filters: Array<{ value: Filter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'ISSUES', label: 'Needs Review' },
  { value: 'MATCHED', label: 'Matched' },
  { value: 'PARTIAL', label: 'Partial' },
  { value: 'UNMATCHED', label: 'Unmatched' },
  { value: 'RESOLVED', label: 'Resolved' },
];

export function RunDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('ISSUES');
  const [isResolving, setIsResolving] = useState<string | null>(null);

  const { data: run, isLoading, refetch } = useQuery<RunDetailResponse>({
    queryKey: ['runs', id],
    queryFn: () => api.get(`/runs/${id}`),
    refetchInterval: 3000,
    enabled: !!id,
  });

  const matches = run?.matches ?? [];
  const visibleMatches = matches.filter((match) => {
    if (filter === 'ALL') return true;
    if (filter === 'ISSUES') return match.status !== 'MATCHED' && match.status !== 'RESOLVED';
    return match.status === filter;
  });

  const matchRate = run
    ? Math.round((run.totalMatched / Math.max(run.totalProcessed, 1)) * 100)
    : 0;

  const handleResolve = async (match: ReconciliationMatch) => {
    const reason = window.prompt('Resolution reason', 'Reviewed bank evidence and accepted this exception.');
    if (!reason) return;

    setIsResolving(match.id);
    try {
      await api.post(`/matches/${match.id}/resolve`, { reason });
      await refetch();
      setFilter('RESOLVED');
    } catch (error: any) {
      window.alert(error.message || 'Unable to resolve match');
    } finally {
      setIsResolving(null);
    }
  };

  if (isLoading) {
    return <div className="py-10 text-center text-muted-foreground">Loading run evidence...</div>;
  }

  if (!run) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => navigate('/runs')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to runs
        </Button>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">Run not found.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/runs')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">Run {run.id.substring(0, 8)}</h1>
              <StatusBadge status={run.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {run.source} started {new Date(run.startedAt).toLocaleString()}
            </p>
          </div>
        </div>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCcw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Gauge} label="Match Rate" value={`${matchRate}%`} tone="primary" />
        <MetricCard icon={CheckCircle2} label="Matched" value={run.totalMatched} tone="success" />
        <MetricCard icon={Banknote} label="Fee / Partial" value={run.totalPartial} tone="warning" />
        <MetricCard icon={FileWarning} label="Unmatched" value={run.totalUnmatched} tone="danger" />
        <MetricCard icon={Clock} label="Processed" value={run.totalProcessed} tone="muted" />
      </div>

      {run.errorMessage && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {run.errorMessage}
        </div>
      )}

      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Reconciliation Evidence</CardTitle>
            <CardDescription>
              Bank settlements, gateway captures, confidence scores, and manual review actions.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <Button
                key={item.value}
                size="sm"
                variant={filter === item.value ? 'default' : 'outline'}
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {visibleMatches.length > 0 ? (
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Decision</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>Bank Settlement</TableHead>
                  <TableHead>Delta</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleMatches.map((match) => (
                  <TableRow key={match.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <StatusBadge status={match.status} />
                        <div className="text-xs text-muted-foreground">
                          {decisionLabel(match)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <ReferenceBlock
                        primary={match.gatewayTxn?.gatewayRef}
                        secondary={match.order?.externalRef}
                        amount={match.gatewayTxn?.amountMinor ?? match.order?.amountMinor}
                      />
                    </TableCell>
                    <TableCell>
                      <ReferenceBlock
                        primary={match.bankSettlement?.utr}
                        secondary={match.bankSettlement?.bankName}
                        amount={match.bankSettlement?.amountMinor}
                      />
                    </TableCell>
                    <TableCell className={cn('font-medium', deltaTone(match))}>
                      {formatMinor(match.amountDeltaMinor)}
                    </TableCell>
                    <TableCell>
                      <ConfidenceBadge score={match.confidenceScore} />
                    </TableCell>
                    <TableCell className="text-right">
                      {match.status === 'PARTIAL' || match.status === 'UNMATCHED' || match.status === 'DISPUTED' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResolve(match)}
                          disabled={isResolving === match.id}
                        >
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          Resolve
                        </Button>
                      ) : match.status === 'RESOLVED' ? (
                        <span className="text-xs text-muted-foreground">{match.resolvedReason || 'Resolved'}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Eye className="h-3.5 w-3.5" />
                          Reviewed
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-lg border border-dashed bg-muted/20 py-12 text-center text-sm text-muted-foreground">
              No records match this filter.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Gauge;
  label: string;
  value: string | number;
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'muted';
}) {
  const toneClass = {
    primary: 'text-primary bg-primary/10',
    success: 'text-green-600 bg-green-500/10 dark:text-green-400',
    warning: 'text-yellow-600 bg-yellow-500/10 dark:text-yellow-400',
    danger: 'text-destructive bg-destructive/10',
    muted: 'text-muted-foreground bg-muted',
  }[tone];

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-md', toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReferenceBlock({
  primary,
  secondary,
  amount,
}: {
  primary?: string | null;
  secondary?: string | null;
  amount?: string | null;
}) {
  if (!primary && !secondary && !amount) {
    return <span className="text-xs text-muted-foreground">Missing</span>;
  }

  return (
    <div className="space-y-1">
      <div className="max-w-[220px] truncate font-mono text-xs font-medium" title={primary ?? undefined}>
        {primary || 'No reference'}
      </div>
      <div className="max-w-[220px] truncate text-xs text-muted-foreground" title={secondary ?? undefined}>
        {secondary || 'No linked record'}
      </div>
      <div className="text-xs font-medium">{formatMinor(amount)}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: MatchStatus | RunDetailResponse['status'] }) {
  if (status === 'MATCHED' || status === 'COMPLETED') {
    return <Badge variant="success">{status}</Badge>;
  }
  if (status === 'PARTIAL' || status === 'PENDING' || status === 'RUNNING') {
    return <Badge variant="warning">{status}</Badge>;
  }
  if (status === 'UNMATCHED' || status === 'DISPUTED' || status === 'FAILED') {
    return <Badge variant="destructive">{status}</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

function decisionLabel(match: ReconciliationMatch): string {
  if (match.status === 'RESOLVED') return 'Manual exception closed';
  if (!match.discrepancyType) return 'Exact reference and amount match';

  const labels: Record<string, string> = {
    TIME_WINDOW_MATCH: 'Same amount inside 24h window',
    FEE_MISMATCH: 'Gateway fee explains amount delta',
    MISSING_GATEWAY: 'Bank settlement has no gateway capture',
    MISSING_SETTLEMENT: 'Gateway capture has no bank settlement',
  };

  return labels[match.discrepancyType] ?? match.discrepancyType;
}

function deltaTone(match: ReconciliationMatch): string {
  if (!match.amountDeltaMinor || Number(match.amountDeltaMinor) === 0) return 'text-muted-foreground';
  if (match.status === 'PARTIAL') return 'text-yellow-600 dark:text-yellow-400';
  return 'text-destructive';
}

function formatMinor(value?: string | null): string {
  if (!value) return 'N/A';
  const amount = Number(value) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
}
