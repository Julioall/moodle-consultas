import { services } from '../data/platform';
import { useAuth } from '../features/auth/AuthProvider';

export function ServicesPage() {
  const { session } = useAuth();

  return (
    <section className="card-panel">
      <div className="section-heading">
        <div>
          <span className="section-label">Serviços</span>
          <h2>Catálogo de conectores</h2>
        </div>
      </div>

      <div className="service-grid">
        {services.map((service) => (
          <article key={service.slug} className={`service-card status-${service.status}`}>
            <div className="service-head">
              <div>
                <h3>{service.name}</h3>
                <p>{service.description}</p>
              </div>
              <span className="status-pill">
                {service.slug === 'moodle' && session?.session ? 'Ativo' : service.status === 'active' ? 'Disponível' : 'Em breve'}
              </span>
            </div>

            <div className="tag-row">
              {service.tags.map((tag) => (
                <span key={tag} className="tag-pill">
                  {tag}
                </span>
              ))}
            </div>

            <div className="button-row compact">
              <button className="button" type="button" disabled={service.slug !== 'moodle'}>
                {service.slug === 'moodle' && session?.session ? 'Serviço ativo' : 'Ativar serviço'}
              </button>
              <button className="button button-secondary" type="button">
                Ver endpoints
              </button>
              <button className="button button-ghost" type="button">
                Ver instruções
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
