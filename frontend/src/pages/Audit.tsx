import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Shield } from 'lucide-react';

export function Audit() {
  const { data, isLoading } = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.get('/audit'),
    refetchInterval: 15000,
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="w-8 h-8 text-primary" />
          Audit Log
        </h1>
        <p className="text-muted-foreground">Immutable record of all critical financial operations and state changes.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>System Events</CardTitle>
          <CardDescription>Append-only financial audit trail</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading audit log...</div>
          ) : data?.data?.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event Action</TableHead>
                  <TableHead>Resource ID</TableHead>
                  <TableHead>User / System</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="text-right">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs uppercase bg-accent/50">
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.entityId}</TableCell>
                    <TableCell className="text-sm font-medium">{log.actor || 'SYSTEM'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={JSON.stringify(log.after)}>
                      {humanizeAuditDetails(log.after)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-xs">
                      {new Date(log.timestamp).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">No audit logs found.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function humanizeAuditDetails(value: unknown): string {
  if (!value || typeof value !== 'object') return 'No details';
  const details = value as Record<string, unknown>;
  const status = typeof details.status === 'string' ? details.status : null;
  const type = typeof details.discrepancyType === 'string' ? details.discrepancyType : null;
  const ref = typeof details.externalRef === 'string' ? details.externalRef : null;

  return [status, type, ref].filter(Boolean).join(' | ') || JSON.stringify(value);
}
