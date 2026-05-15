import { useEffect, useState } from 'react';
import { ApiError, ApiKeyRecord, getCurrentApiKey, regenerateApiKey } from '../lib/api-client';

export function ApiKeyPage() {
  const [key, setKey] = useState<ApiKeyRecord | null>(null);
  const [generatedKey, setGeneratedKey] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    let active = true;

    getCurrentApiKey()
      .then((currentKey) => {
        if (active) setKey(currentKey);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a chave.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleCopy() {
    if (!generatedKey) return;
    await navigator.clipboard.writeText(generatedKey);
    setCopyStatus('Chave completa copiada.');
  }

  async function handleRegenerate() {
    setError('');
    setCopyStatus('');
    setGeneratedKey('');
    setIsRegenerating(true);
    try {
      const result = await regenerateApiKey();
      setKey(result.key);
      setGeneratedKey(result.apiKey);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível regenerar a chave.');
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <section className="card-panel">
      <span className="section-label">Chave de API</span>
      <h2>Sua credencial para GPT Actions</h2>
      <p className="hero-text">A chave identifica sua conta nas Actions. O banco salva apenas o hash; a chave completa aparece somente ao gerar ou regenerar.</p>

      {isLoading ? <div className="alert">Carregando chave...</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="api-key-box">
        <code>{key?.keyPreview ?? 'Nenhuma chave criada'}</code>
      </div>

      <div className="session-grid">
        <article className="feature-box">
          <strong>Status</strong>
          <p>{key ? 'Criada' : 'Pendente'}</p>
        </article>
        <article className="feature-box">
          <strong>Criada em</strong>
          <p>{key?.createdAt ?? 'Ainda não gerada'}</p>
        </article>
        <article className="feature-box">
          <strong>Último uso</strong>
          <p>{key?.lastUsedAt ?? 'Sem uso registrado'}</p>
        </article>
      </div>

      {generatedKey ? (
        <div className="one-time-key">
          <span className="section-label">Exibição única</span>
          <p>Copie esta chave agora. Ela não poderá ser recuperada depois que você sair desta tela.</p>
          <code>{generatedKey}</code>
        </div>
      ) : null}

      <div className="button-row compact">
        <button className="button" type="button" onClick={handleRegenerate} disabled={isRegenerating}>
          {isRegenerating ? 'Gerando...' : key ? 'Regenerar chave' : 'Gerar chave'}
        </button>
        <button className="button button-secondary" type="button" onClick={handleCopy} disabled={!generatedKey}>
          Copiar chave completa
        </button>
      </div>

      {copyStatus ? <div className="alert alert-success">{copyStatus}</div> : null}

      <div className="callout">Boa prática: a chave de API identifica sua conta. Não compartilhe publicamente. Caso seja exposta, gere uma nova imediatamente.</div>
    </section>
  );
}
