import { useNavigate } from 'react-router-dom';

export function LoginPage() {
  const navigate = useNavigate();

  return (
    <section className="form-panel narrow-panel">
      <span className="eyebrow">Login</span>
      <h1>Entrar na plataforma</h1>
      <p className="hero-text">A tela já está pronta para integrar autenticação real no próximo passo.</p>

      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          navigate('/dashboard');
        }}
      >
        <label>
          E-mail
          <input type="email" placeholder="voce@empresa.com" />
        </label>

        <label>
          Senha
          <input type="password" placeholder="Sua senha" />
        </label>

        <button className="button" type="submit">
          Entrar
        </button>
      </form>
    </section>
  );
}
