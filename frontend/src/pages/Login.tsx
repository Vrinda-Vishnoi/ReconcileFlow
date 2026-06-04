import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const setToken = useAuthStore((state) => state.setToken);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      const data = await api.post('/auth/login', { email, password });
      setToken(data.token);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError('');
    setIsLoading(true);

    try {
      const data = await api.post('/auth/demo-login');
      setToken(data.token);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Demo login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background/50 backdrop-blur-sm">
      <div className="w-full max-w-md p-8 rounded-2xl shadow-2xl bg-card text-card-foreground border border-border">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">ReconcileFlow</h1>
          <p className="text-muted-foreground text-sm">Welcome back to the dashboard</p>
        </div>
        
        {error && (
          <div className="mb-6 p-4 rounded-md bg-destructive/15 text-destructive border border-destructive/20 text-sm font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input 
              id="email" 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input 
              id="password" 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
          </div>
          
          <div className="bg-muted/40 p-3 rounded-lg border border-border/50 flex flex-col items-center justify-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Reviewing the project?</span>
            <Button 
              type="button" 
              variant="secondary" 
              size="sm" 
              className="w-full h-8 text-xs"
              onClick={handleDemoLogin}
              disabled={isLoading}
            >
              Enter Demo Workspace
            </Button>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm">
          <span className="text-muted-foreground">Don't have an account? </span>
          <Link to="/register" className="text-primary hover:underline font-medium">
            Register here
          </Link>
        </div>
      </div>
    </div>
  );
}
