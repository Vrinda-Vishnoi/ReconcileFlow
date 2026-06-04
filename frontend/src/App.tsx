import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useAuthStore } from './stores/authStore';
import { PageSkeleton } from './components/PageSkeleton';
import { BackendWarmupGate } from './components/BackendWarmupGate';

// Lazy load pages
const Login = React.lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Register = React.lazy(() => import('./pages/Register').then(m => ({ default: m.Register })));
const Dashboard = React.lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Runs = React.lazy(() => import('./pages/Runs').then(m => ({ default: m.Runs })));
const RunDetail = React.lazy(() => import('./pages/RunDetail').then(m => ({ default: m.RunDetail })));
const DLQ = React.lazy(() => import('./pages/DLQ').then(m => ({ default: m.DLQ })));
const Audit = React.lazy(() => import('./pages/Audit').then(m => ({ default: m.Audit })));

export default function App() {
  const token = useAuthStore((state) => state.token);
  const isAuthenticated = !!token;

  return (
    <BackendWarmupGate>
      <Router>
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" />} />
            <Route path="/register" element={!isAuthenticated ? <Register /> : <Navigate to="/" />} />
            
            <Route element={<Layout />}>
              <Route path="/" element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />} />
              <Route path="/runs" element={isAuthenticated ? <Runs /> : <Navigate to="/login" />} />
              <Route path="/runs/:id" element={isAuthenticated ? <RunDetail /> : <Navigate to="/login" />} />
              <Route path="/dlq" element={isAuthenticated ? <DLQ /> : <Navigate to="/login" />} />
              <Route path="/audit" element={isAuthenticated ? <Audit /> : <Navigate to="/login" />} />
            </Route>
          </Routes>
        </Suspense>
      </Router>
    </BackendWarmupGate>
  );
}
