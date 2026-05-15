import { useState } from 'react';
import { ApiError } from '../lib/api-client';
import { useAuth } from '../features/auth/AuthProvider';

export function ApiKeyPage() {
  const { refreshSession, session } = useAuth();
  const [copyStatus, setCopyStatus] = useState('');
  const [validationStatus, setValidationStatus] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  async function handleCopy() {
    if (!session?.apiKey) return;
    await navigator.clipboard.writeText(session.apiKey);
    setCopyStatus('Chave completa copiada.');
  }

  async function handleValidate() {
    setValidationStatus('');
    setIsValidating(true);
    try {
      await refreshSession(true);
      setValidationStatus('Sessão validada com sucesso no Moodle.');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Não foi possível validar a sessão.';
      setValidationStatus(message);
    } finally {
      setIsValidating(false);
    }
  }

  return (
    <section className="card-panel">
      <span className="section-label">Chave de API</span>
      <h2>Sua credencial da conta</h2>
      <p className="hero-text">A chave identifica sua conta e será usada como Bearer token na autenticação das Actions.</p>

      <div className="api-key-box">
        <code>{session?.keyPreview}</code>
      </div>

      <div className="session-grid">
        <article className="feature-box">
          <strong>Modo Moodle</strong>
          <p>{session?.session?.mode === 'user' ? 'Usuário validado' : 'Token técnico'}</p>
        </article>
        <article className="feature-box">
          <strong>Usuário</strong>
          <p>{session?.moodleUser?.fullname || session?.moodleUser?.username || 'Não informado'}</p>
        </article>
        <article className="feature-box">
          <strong>Expiração</strong>
          <p>{session?.session?.expiresAt || session?.session?.sessionExpiresAt || 'Sem expiração local definida'}</p>
        </article>
      </div>

      <div className="button-row compact">
        <button className="button" type="button" onClick={handleCopy}>
          Copiar chave
        </button>
        <button className="button button-secondary" type="button" onClick={handleValidate} disabled={isValidating}>
          {isValidating ? 'Validando...' : 'Validar sessão'}
        </button>
      </div>

      {copyStatus ? <div className="alert alert-success">{copyStatus}</div> : null}
      {validationStatus ? <div className="alert">{validationStatus}</div> : null}

      <div className="callout">Boa prática: a chave de API identifica sua conta. Não compartilhe publicamente.</div>
    </section>
  );
}
