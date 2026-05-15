import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { ApiError } from '../lib/api-client';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [moodleUsername, setMoodleUsername] = useState('');
  const [moodlePassword, setMoodlePassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!name.trim() || !email.trim() || !moodleUsername.trim() || !moodlePassword) {
      setError('Preencha nome, e-mail, usuário Moodle e senha Moodle.');
      return;
    }

    setIsSubmitting(true);
    try {
      await register({ name, email, moodleUsername, moodlePassword });
      navigate('/dashboard/api-key', { replace: true });
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
      <p className="hero-text">O cadastro valida seu acesso ao Moodle, cria sua chave de API e ativa o serviço no painel.</p>

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

        {error ? <div className="alert alert-error">{error}</div> : null}

        <button className="button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Criando conta...' : 'Criar conta'}
        </button>
      </form>
    </section>
  );
}
