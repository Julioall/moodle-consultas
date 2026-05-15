import { NavLink, Outlet } from 'react-router-dom';
import { platformName } from '../data/platform';
import { useAuth } from '../features/auth/AuthProvider';

export function PublicLayout() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="app-shell public-shell">
      <header className="topbar">
        <div>
          <div className="brand">{platformName}</div>
          <p className="brand-subtitle">Conecte serviços externos aos GPTs personalizados.</p>
        </div>

        <nav className="topnav" aria-label="Navegação principal">
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/login">Entrar</NavLink>
          <NavLink to="/register">Criar conta</NavLink>
          {isAuthenticated ? <NavLink to="/dashboard">Dashboard</NavLink> : null}
        </nav>
      </header>

      <main className="page-frame">
        <Outlet />
      </main>
    </div>
  );
}
