import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="app-shell">
        <section className="card-panel">
          <span className="section-label">Sessão</span>
          <h2>Validando acesso</h2>
          <p className="hero-text">Estamos conferindo sua sessão Supabase antes de abrir o painel.</p>
        </section>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
