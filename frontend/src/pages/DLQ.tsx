import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';

export function DLQ() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dlq'],
    queryFn: () => api.get('/dlq'),
    refetchInterval: 15000,
  });

  const handleReplay = async (id: string) => {
    try {
      await api.post(`/dlq/${id}/replay`);
      refetch();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/dlq/${id}`);
      refetch();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-destructive flex items-center gap-2">
          <AlertTriangle className="w-8 h-8" />
          Dead Letter Queue
        </h1>
        <p className="text-muted-foreground">Failed webhook events and reconciliation tasks that need manual intervention.</p>
      </div>

      <Card className="border-destructive/20 shadow-sm shadow-destructive/5">
        <CardHeader>
          <CardTitle>Failed Jobs</CardTitle>
          <CardDescription>Review errors and choose to replay or discard.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading DLQ...</div>
          ) : data?.data?.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Error Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((item: any) => (
                  <TableRow key={item.id} className="group">
                    <TableCell className="text-destructive font-mono text-xs max-w-xs truncate" title={item.error}>
                      {item.error}
                    </TableCell>
                    <TableCell className="font-medium">
                      <Badge variant="outline">{item.status}</Badge>
                    </TableCell>
                    <TableCell>{item.retryCount}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(item.failedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="outline" size="sm" onClick={() => handleReplay(item.id)}>
                          <RotateCcw className="w-4 h-4 mr-1" />
                          Replay
                        </Button>
                        <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive hover:text-white" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-16 bg-muted/20 rounded-lg border border-dashed flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-lg font-medium text-foreground">Queue is clear!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                No failed jobs require your attention.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
