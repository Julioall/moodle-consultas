import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, PlatformService, listServices } from '../lib/api-client';

function statusLabel(status: PlatformService['status']) {
  const labels: Record<PlatformService['status'], string> = {
    available: 'Disponível',
    active: 'Ativo',
    inactive: 'Inativo',
    coming_soon: 'Em breve',
    error: 'Erro',
  };
  return labels[status];
}

export function ServicesPage() {
  const [services, setServices] = useState<PlatformService[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    listServices()
      .then((items) => {
        if (active) setServices(items);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os serviços.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="card-panel">
      <div className="section-heading">
        <div>
          <span className="section-label">Serviços</span>
          <h2>Catálogo de conectores</h2>
        </div>
      </div>

      {isLoading ? <div className="alert">Carregando serviços...</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="service-grid">
        {services.map((service) => (
          <article key={service.slug} className={`service-card status-${service.status}`}>
            <div className="service-head">
              <div>
                <h3>{service.name}</h3>
                <p>{service.description}</p>
              </div>
              <span className="status-pill">{statusLabel(service.status)}</span>
            </div>

            <div className="tag-row">
              <span className="tag-pill">{service.slug === 'moodle' ? 'MVP' : 'Futuro'}</span>
              <span className="tag-pill">{service.slug === 'moodle' ? 'Read-only' : 'Em breve'}</span>
              <span className="tag-pill">Actions</span>
            </div>

            <div className="button-row compact">
              {service.slug === 'moodle' ? (
                <>
                  <Link className="button" to="/dashboard/services/moodle">
                    {service.status === 'active' ? 'Ver configuração' : 'Ativar serviço'}
                  </Link>
                  <Link className="button button-secondary" to="/dashboard/yaml">
                    Ver YAML
                  </Link>
                  <Link className="button button-ghost" to="/dashboard/help">
                    Ver instruções
                  </Link>
                </>
              ) : (
                <button className="button button-secondary" type="button" disabled>
                  Em breve
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
