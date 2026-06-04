import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, PlayCircle, AlertCircle, FileText, LogOut, Bell } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { cn } from '../lib/utils';
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../lib/config';

export function Layout() {
  const logout = useAuthStore((state) => state.logout);
  const token = useAuthStore((state) => state.token);
  const navigate = useNavigate();
  const location = useLocation();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    if (token) {
      const socketOptions = { auth: { token } };
      const newSocket = SOCKET_URL ? io(SOCKET_URL, socketOptions) : io(socketOptions);
      
      newSocket.on('connect', () => console.log('Socket connected'));
      setSocket(newSocket);
      
      return () => {
        newSocket.disconnect();
      };
    }
  }, [token]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Runs', path: '/runs', icon: PlayCircle },
    { name: 'DLQ', path: '/dlq', icon: AlertCircle },
    { name: 'Audit', path: '/audit', icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-background flex text-foreground overflow-hidden">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-20 md:hidden" 
          onClick={() => setIsSidebarOpen(false)} 
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "bg-card border-r border-border transition-all duration-300 flex flex-col z-30",
        "fixed inset-y-0 left-0 md:static",
        isSidebarOpen ? "w-64 translate-x-0" : "w-64 -translate-x-full md:w-20 md:translate-x-0"
      )}>
        <div className="h-16 flex items-center justify-center border-b border-border cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
          <div className="flex items-center gap-2 text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            {(isSidebarOpen || window.innerWidth < 768) && <span className="font-bold text-xl tracking-tight text-foreground">ReconcileFlow</span>}
          </div>
        </div>
        
        <nav className="flex-1 py-6 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            
            return (
              <Link 
                key={item.path}
                to={item.path} 
                onClick={() => window.innerWidth < 768 && setIsSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm font-medium",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {(isSidebarOpen || window.innerWidth < 768) && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-border">
          <button 
            onClick={handleLogout} 
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm font-medium w-full text-destructive hover:bg-destructive/10",
              !(isSidebarOpen || window.innerWidth < 768) && "justify-center"
            )}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {(isSidebarOpen || window.innerWidth < 768) && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden w-full">
        {/* Header */}
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-md flex items-center justify-between px-4 md:px-8 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button className="md:hidden p-2 -ml-2 text-muted-foreground" onClick={() => setIsSidebarOpen(true)}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-xl font-semibold capitalize">
              {location.pathname === '/' ? 'Dashboard' : location.pathname.split('/')[1]}
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              className="relative p-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-accent"
              onClick={() => alert("You're all caught up! No new notifications.")}
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full"></span>
            </button>
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center text-primary font-medium text-sm hidden md:flex">
              AD
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-8 overflow-auto">
          <div className="max-w-6xl mx-auto">
            <Outlet context={{ socket }} />
          </div>
        </main>
      </div>
    </div>
  );
}
