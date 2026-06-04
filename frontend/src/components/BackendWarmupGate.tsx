import { ReactNode, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Server, WifiOff } from 'lucide-react';
import { API_BASE_URL } from '../lib/config';
import { Button } from './ui/button';

type HealthState = 'checking' | 'warming' | 'ready' | 'error';

interface BackendWarmupGateProps {
  children: ReactNode;
}

export function BackendWarmupGate({ children }: BackendWarmupGateProps) {
  const [state, setState] = useState<HealthState>('checking');
  const [attempts, setAttempts] = useState(0);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [message, setMessage] = useState('Checking backend health...');
  const [retrySeed, setRetrySeed] = useState(0);

  const healthUrl = useMemo(() => `${API_BASE_URL.replace(/\/$/, '')}/health`, []);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let attemptCount = 0;

    const checkHealth = async () => {
      attemptCount += 1;
      setAttempts(attemptCount);
      setLastCheckedAt(new Date());

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(healthUrl, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const data = await response.json().catch(() => null);
        const status = String(data?.status || '').toLowerCase();

        if (response.ok && (status === 'healthy' || status === 'running')) {
          if (!stopped) setState('ready');
          return;
        }

        if (!stopped) {
          setState('warming');
          setMessage('Render is starting the backend. This can take a minute on the free tier.');
        }
      } catch {
        if (!stopped) {
          setState(attemptCount > 2 ? 'warming' : 'checking');
          setMessage('Waiting for the backend health API to respond...');
        }
      } finally {
        window.clearTimeout(timeout);
      }

      if (!stopped) {
        timer = window.setTimeout(checkHealth, 4000);
      }
    };

    checkHealth();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [healthUrl, retrySeed]);

  if (state === 'ready') return <>{children}</>;

  const isWarming = state === 'warming';

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            {isWarming ? (
              <RefreshCw className="h-6 w-6 animate-spin" />
            ) : (
              <Server className="h-6 w-6" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {isWarming ? 'Backend is warming up' : 'Checking ReconcileFlow API'}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{message}</p>
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <WifiOff className="h-3.5 w-3.5" />
                <span className="font-mono">{healthUrl}</span>
              </div>
              <div className="mt-2">
                Attempt {attempts}
                {lastCheckedAt ? `, last checked ${lastCheckedAt.toLocaleTimeString()}` : ''}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setState('checking');
                setAttempts(0);
                setMessage('Checking backend health...');
                setRetrySeed((value) => value + 1);
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Check now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
