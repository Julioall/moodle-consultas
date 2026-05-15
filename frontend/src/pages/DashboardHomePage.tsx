import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';

export function DashboardHomePage() {
  const { session } = useAuth();
  const dashboardStats = [
    { label: 'Serviços ativos', value: session?.session ? '1' : '0' },
    { label: 'Chave de API', value: session?.keyPreview ?? 'Não criada' },
    { label: 'Schemas disponíveis', value: '1' },
    { label: 'Sessão Moodle', value: session?.session?.mode === 'user' ? 'Usuário' : 'Técnica' },
  ];

  return (
    <div className="stack-large">
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
            <span className="section-label">Serviço ativo</span>
            <h2>Moodle</h2>
          </div>
          <Link to="/dashboard/services" className="inline-link">
            Ver configuração
          </Link>
        </div>

        <div className="feature-grid">
          <article className="feature-box">
            <strong>Status</strong>
            <p>Ativo</p>
          </article>
          <article className="feature-box">
            <strong>Escopo</strong>
            <p>Leitura de cursos, alunos, atividades e relatórios.</p>
          </article>
          <article className="feature-box">
            <strong>Próximo passo</strong>
            <p>Copiar o YAML e integrar a Action ao GPT personalizado.</p>
          </article>
        </div>
      </section>
    </div>
  );
}
