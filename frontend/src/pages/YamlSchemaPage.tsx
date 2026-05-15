import { useEffect, useState } from 'react';
import { yamlSourceUrl } from '../data/platform';

const fallbackYaml = `openapi: 3.1.0
info:
  title: Moodle Actions Hub API
  version: 1.0.0
servers:
  - url: https://scrzziyuruzzhebpzvdl.supabase.co/functions/v1/moodle-proxy
security:
  - bearerAuth: []
`;

export function YamlSchemaPage() {
  const [service, setService] = useState('Moodle');
  const [yaml, setYaml] = useState(fallbackYaml);

  useEffect(() => {
    void fetch(yamlSourceUrl)
      .then((response) => response.text())
      .then(setYaml)
      .catch(() => setYaml(fallbackYaml));
  }, []);

  return (
    <section className="card-panel">
      <div className="section-heading">
        <div>
          <span className="section-label">Schema YAML</span>
          <h2>Copie o schema da Action</h2>
        </div>

        <select className="service-select" value={service} onChange={(event) => setService(event.target.value)}>
          <option>Moodle</option>
          <option disabled>Google Drive - em breve</option>
          <option disabled>Planilhas - em breve</option>
        </select>
      </div>

      <p className="hero-text">Serviço selecionado: {service}. Use o arquivo abaixo como base para cadastrar a Action no GPT.</p>

      <div className="button-row compact">
        <button
          className="button"
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(yaml);
          }}
        >
          Copiar YAML
        </button>
        <a className="button button-secondary" href={yamlSourceUrl} download>
          Baixar arquivo .yaml
        </a>
      </div>

      <pre className="code-panel">
        <code>{yaml}</code>
      </pre>

      <div className="callout">Depois de copiar, cole o schema na seção Actions do seu GPT personalizado e configure a autenticação com sua chave de API.</div>
    </section>
  );
}
