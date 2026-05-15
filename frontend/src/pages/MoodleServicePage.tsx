import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, PlatformService, activateService, deactivateService, getService } from '../lib/api-client';

export function MoodleServicePage() {
  const [service, setService] = useState<PlatformService | null>(null);
  const [moodleUsername, setMoodleUsername] = useState('');
  const [moodlePassword, setMoodlePassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function refresh() {
    const current = await getService('moodle');
    setService(current);
  }

  useEffect(() => {
    let active = true;

    getService('moodle')
      .then((current) => {
        if (active) setService(current);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o Moodle.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleActivate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!moodleUsername.trim() || !moodlePassword) {
      setError('Informe usuário e senha do Moodle.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await activateService('moodle', { moodleUsername, moodlePassword });
      setService(result.service);
      setMoodlePassword('');
      setMessage(`Moodle ativado para ${result.moodleUser.fullname || result.moodleUser.username || 'este usuário'}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível ativar o Moodle.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeactivate() {
    setError('');
    setMessage('');
    setIsSubmitting(true);
    try {
      const nextService = await deactivateService('moodle');
      setService(nextService);
      setMessage('Moodle desativado para esta conta.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível desativar o Moodle.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="card-panel">
      <div className="section-heading">
        <div>
          <span className="section-label">Moodle</span>
          <h2>Configuração do primeiro conector</h2>
        </div>
        <Link className="inline-link" to="/dashboard/services">
          Voltar aos serviços
        </Link>
      </div>

      {isLoading ? <div className="alert">Carregando configuração...</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      <div className="feature-grid">
        <article className="feature-box">
          <strong>Status</strong>
          <p>{service?.status === 'active' ? 'Ativo' : 'Inativo'}</p>
        </article>
        <article className="feature-box">
          <strong>Usuário Moodle</strong>
          <p>{service?.moodleSession?.moodle_fullname || service?.moodleSession?.moodle_username || 'Não conectado'}</p>
        </article>
        <article className="feature-box">
          <strong>Expiração</strong>
          <p>{service?.moodleSession?.expires_at || 'Sem sessão ativa'}</p>
        </article>
      </div>

      <div className="split-panel">
        <form className="form-grid" onSubmit={handleActivate}>
          <div>
            <span className="section-label">Ativação</span>
            <h3>Validar credenciais Moodle</h3>
            <p className="form-help">A senha é usada apenas para gerar o token Moodle. Ela não é salva.</p>
          </div>

          <label>
            Usuário Moodle
            <input
              type="text"
              autoComplete="username"
              placeholder="Seu login no Moodle"
              value={moodleUsername}
              onChange={(event) => setMoodleUsername(event.target.value)}
            />
          </label>

          <label>
            Senha Moodle
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Sua senha do Moodle"
              value={moodlePassword}
              onChange={(event) => setMoodlePassword(event.target.value)}
            />
          </label>

          <div className="button-row compact">
            <button className="button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Validando...' : service?.status === 'active' ? 'Revalidar Moodle' : 'Ativar Moodle'}
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={handleDeactivate}
              disabled={isSubmitting || service?.status !== 'active'}
            >
              Desativar
            </button>
          </div>
        </form>

        <div className="callout">
          Depois de ativar o Moodle, gere uma chave em <strong>Chave de API</strong> e copie o YAML para configurar a Action no seu GPT personalizado.
        </div>
      </div>
    </section>
  );
}
