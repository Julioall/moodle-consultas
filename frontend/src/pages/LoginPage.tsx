import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { ApiError } from '../lib/api-client';

export function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Informe e-mail e senha.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login({ email, password });
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/dashboard';
      navigate(from, { replace: true });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível entrar.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="form-panel narrow-panel">
      <span className="eyebrow">Login</span>
      <h1>Entrar na plataforma</h1>
      <p className="hero-text">Acesse com o e-mail e senha da sua conta. A chave de API das Actions é gerenciada no painel.</p>

      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          E-mail
          <input
            type="email"
            autoComplete="email"
            placeholder="voce@empresa.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label>
          Senha
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Sua senha"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <button className="button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Entrando...' : 'Entrar'}
        </button>

        <p className="form-help">
          Ainda não tem conta? <Link to="/register">Criar conta</Link>
        </p>
      </form>
    </section>
  );
}
