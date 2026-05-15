import { Link } from 'react-router-dom';
import { onboardingSteps, platformName, publicHeroStats, services, trustPoints } from '../data/platform';

export function HomePage() {
  return (
    <div className="stack-large">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">{platformName}</span>
          <h1>Conecte seus sistemas aos GPTs personalizados</h1>
          <p className="hero-text">
            Gere chaves de API, ative serviços e copie schemas prontos para adicionar Actions aos seus GPTs.
            Comece pelo Moodle e evolua para novos conectores sem refazer a base.
          </p>

          <div className="button-row">
            <Link className="button" to="/register">
              Criar conta
            </Link>
            <Link className="button button-secondary" to="/login">
              Entrar
            </Link>
            <Link className="button button-ghost" to="/dashboard">
              Ver como funciona
            </Link>
          </div>
        </div>

        <div className="hero-aside">
          {publicHeroStats.map((stat) => (
            <article key={stat.label} className="metric-card">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="content-grid two-columns">
        <article className="card-panel">
          <span className="section-label">Como funciona</span>
          <ol className="step-list">
            {onboardingSteps.map((step, index) => (
              <li key={step}>
                <strong>{index + 1}.</strong> {step}
              </li>
            ))}
          </ol>
        </article>

        <article className="card-panel">
          <span className="section-label">Confiança</span>
          <ul className="bullet-list">
            {trustPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="card-panel">
        <div className="section-heading">
          <div>
            <span className="section-label">Serviços disponíveis</span>
            <h2>MVP com foco no Moodle</h2>
          </div>
          <Link to="/dashboard/services" className="inline-link">
            Ver catálogo
          </Link>
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
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
