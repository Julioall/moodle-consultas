import { useMemo, useState } from 'react';
import { apiKeyPreview } from '../data/platform';

function createPreviewKey() {
  const bytes = window.crypto.getRandomValues(new Uint8Array(4));
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `sk_live_••••••••••••••••••••${suffix}`;
}

export function ApiKeyPage() {
  const [previewKey, setPreviewKey] = useState(apiKeyPreview);
  const maskedCopy = useMemo(() => previewKey, [previewKey]);

  return (
    <section className="card-panel">
      <span className="section-label">Chave de API</span>
      <h2>Sua credencial da conta</h2>
      <p className="hero-text">A chave identifica sua conta e será usada como Bearer token na autenticação das Actions.</p>

      <div className="api-key-box">
        <code>{maskedCopy}</code>
      </div>

      <div className="button-row compact">
        <button
          className="button"
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(maskedCopy);
          }}
        >
          Copiar chave
        </button>
        <button className="button button-secondary" type="button" onClick={() => setPreviewKey(createPreviewKey())}>
          Regenerar chave
        </button>
      </div>

      <div className="callout">Boa prática: a chave de API identifica sua conta. Não compartilhe publicamente.</div>
    </section>
  );
}
