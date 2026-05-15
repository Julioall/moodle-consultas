import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, ApiKeyRecord, PlatformService, getCurrentApiKey, listServices } from '../lib/api-client';

export function DashboardHomePage() {
  const [services, setServices] = useState<PlatformService[]>([]);
  const [apiKey, setApiKey] = useState<ApiKeyRecord | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    Promise.all([listServices(), getCurrentApiKey()])
      .then(([serviceItems, currentKey]) => {
        if (!active) return;
        setServices(serviceItems);
        setApiKey(currentKey);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o painel.');
      });

    return () => {
      active = false;
    };
  }, []);

  const moodle = useMemo(() => services.find((service) => service.slug === 'moodle'), [services]);
  const activeServices = services.filter((service) => service.status === 'active').length;
  const dashboardStats = [
    { label: 'Serviços ativos', value: String(activeServices) },
    { label: 'Chave de API', value: apiKey?.keyPreview ?? 'Não criada' },
    { label: 'Schemas disponíveis', value: '1' },
    { label: 'Moodle', value: moodle?.status === 'active' ? 'Ativo' : 'Inativo' },
  ];

  return (
    <div className="stack-large">
      {error ? <div className="alert alert-error">{error}</div> : null}

      <section className="content-grid four-columns">
        {dashboardStats.map((stat) => (
          <article key={stat.label} className="metric-card metric-card-dark">
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </article>
        ))}
      </section>

      <section className="card-panel">
        <div className="section-heading">
          <div>
            <span className="section-label">Próxima ação</span>
            <h2>Moodle</h2>
          </div>
          <Link to="/dashboard/services/moodle" className="inline-link">
            Ver configuração
          </Link>
        </div>

        <div className="feature-grid">
          <article className="feature-box">
            <strong>Status</strong>
            <p>{moodle?.status === 'active' ? 'Ativo' : 'Ative o serviço para liberar as Actions.'}</p>
          </article>
          <article className="feature-box">
            <strong>Chave de API</strong>
            <p>{apiKey ? 'Criada e pronta para uso.' : 'Gere uma chave para autenticar o GPT.'}</p>
          </article>
          <article className="feature-box">
            <strong>Schema</strong>
            <p>Copie o YAML e configure como Action no GPT personalizado.</p>
          </article>
        </div>

        <div className="button-row compact">
          <Link className="button" to="/dashboard/services/moodle">
            {moodle?.status === 'active' ? 'Revisar Moodle' : 'Ativar Moodle'}
          </Link>
          <Link className="button button-secondary" to="/dashboard/api-key">
            {apiKey ? 'Ver chave' : 'Gerar chave'}
          </Link>
          <Link className="button button-ghost" to="/dashboard/yaml">
            Copiar YAML
          </Link>
        </div>
      </section>
    </div>
  );
}
