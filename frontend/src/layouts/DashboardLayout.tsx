import { NavLink, Outlet } from 'react-router-dom';
import { services } from '../data/platform';

const menuItems = [
  { to: '/dashboard', label: 'Visão geral' },
  { to: '/dashboard/services', label: 'Serviços' },
  { to: '/dashboard/api-key', label: 'Chave de API' },
  { to: '/dashboard/yaml', label: 'Schema YAML' },
  { to: '/dashboard/help', label: 'Ajuda' },
];

export function DashboardLayout() {
  return (
    <div className="app-shell dashboard-shell">
      <aside className="sidebar">
        <div>
          <div className="brand">Central de Actions</div>
          <p className="brand-subtitle">Painel para serviços ativos e schemas prontos.</p>
        </div>

        <nav className="sidebar-nav" aria-label="Seções do dashboard">
          {menuItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/dashboard'}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <section className="sidebar-panel">
          <span className="section-label">Serviço atual</span>
          <strong>{services[0].name}</strong>
          <p>{services[0].description}</p>
        </section>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <span className="eyebrow">Dashboard</span>
            <h1>Painel operacional</h1>
          </div>
          <div className="button-row compact">
            <NavLink to="/dashboard/api-key" className="button button-secondary">
              Ver chave
            </NavLink>
            <NavLink to="/dashboard/yaml" className="button">
              Copiar YAML
            </NavLink>
          </div>
        </header>

        <Outlet />
      </div>
    </div>
  );
}
