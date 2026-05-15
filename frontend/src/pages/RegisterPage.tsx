import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { ApiError } from '../lib/api-client';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!name.trim() || !email.trim() || password.length < 6) {
      setError('Preencha nome, e-mail e uma senha com pelo menos 6 caracteres.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await register({ name, email, password });
      if (result.requiresEmailConfirmation) {
        setSuccess('Conta criada. Confirme seu e-mail antes de entrar.');
        return;
      }
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível criar sua conta.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="form-panel narrow-panel">
      <span className="eyebrow">Cadastro</span>
      <h1>Criar conta</h1>
      <p className="hero-text">Crie sua conta da plataforma. A ativação do Moodle e a geração da API key acontecem no dashboard.</p>

      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Nome
          <input type="text" autoComplete="name" placeholder="Seu nome completo" value={name} onChange={(event) => setName(event.target.value)} />
        </label>

        <label>
          E-mail
          <input type="email" autoComplete="email" placeholder="voce@empresa.com" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>

        <label>
          Senha
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo de 6 caracteres"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error ? <div className="alert alert-error">{error}</div> : null}
        {success ? (
          <div className="alert alert-success">
            {success} <Link to="/login">Ir para login</Link>
          </div>
        ) : null}

        <button className="button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Criando conta...' : 'Criar conta'}
        </button>
      </form>
    </section>
  );
}
