import { services } from '../data/platform';

export function ServicesPage() {
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
              <span className="status-pill">{service.status === 'active' ? 'Ativo' : 'Em breve'}</span>
            </div>

            <div className="tag-row">
              {service.tags.map((tag) => (
                <span key={tag} className="tag-pill">
                  {tag}
                </span>
              ))}
            </div>

            <div className="button-row compact">
              <button className="button" type="button">
                Ativar serviço
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
