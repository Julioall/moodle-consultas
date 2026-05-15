import { useNavigate } from 'react-router-dom';

export function RegisterPage() {
  const navigate = useNavigate();

  return (
    <section className="form-panel narrow-panel">
      <span className="eyebrow">Cadastro</span>
      <h1>Criar conta</h1>
      <p className="hero-text">O cadastro já prepara o espaço para gerar uma chave de API e redirecionar ao dashboard.</p>

      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          navigate('/dashboard');
        }}
      >
        <label>
          Nome
          <input type="text" placeholder="Seu nome completo" />
        </label>

        <label>
          E-mail
          <input type="email" placeholder="voce@empresa.com" />
        </label>

        <label>
          Senha
          <input type="password" placeholder="Crie uma senha" />
        </label>

        <button className="button" type="submit">
          Criar conta
        </button>
      </form>
    </section>
  );
}
