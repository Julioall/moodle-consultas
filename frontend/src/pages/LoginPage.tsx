import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api-client';
import { useAuth } from '../features/auth/AuthProvider';

export function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!apiKey.trim()) {
      setError('Informe sua chave de API.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(apiKey);
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/dashboard';
      navigate(from, { replace: true });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível validar sua chave de API.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="form-panel narrow-panel">
      <span className="eyebrow">Login</span>
      <h1>Entrar na plataforma</h1>
      <p className="hero-text">Use a chave de API gerada no cadastro para validar sua sessão no Supabase.</p>

      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Chave de API
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Cole sua chave de API"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <button className="button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Validando...' : 'Entrar'}
        </button>

        <p className="form-help">
          Ainda não tem chave? <Link to="/register">Criar conta</Link>
        </p>
      </form>
    </section>
  );
}
