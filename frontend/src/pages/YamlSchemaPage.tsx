import { useEffect, useMemo, useState } from 'react';
import { ApiError, SchemaRecord, getSchemaYaml, listSchemas } from '../lib/api-client';

const fallbackYaml = `openapi: 3.1.0
info:
  title: Moodle Actions Hub API
  version: 2.1.0
servers:
  - url: https://scrzziyuruzzhebpzvdl.supabase.co/functions/v1/moodle-proxy
security:
  - bearerAuth: []
`;

export function YamlSchemaPage() {
  const [serviceSlug, setServiceSlug] = useState('moodle');
  const [schemas, setSchemas] = useState<SchemaRecord[]>([]);
  const [yaml, setYaml] = useState(fallbackYaml);
  const [copyStatus, setCopyStatus] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const selectedSchema = useMemo(
    () => schemas.find((schema) => schema.serviceSlug === serviceSlug),
    [schemas, serviceSlug],
  );

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoading(true);
      setError('');
      try {
        const availableSchemas = await listSchemas();
        const nextServiceSlug = availableSchemas.find((schema) => schema.available)?.serviceSlug ?? 'moodle';
        const selected = availableSchemas.some((schema) => schema.serviceSlug === serviceSlug) ? serviceSlug : nextServiceSlug;
        const content = await getSchemaYaml(selected);
        if (!active) return;
        setSchemas(availableSchemas);
        setServiceSlug(selected);
        setYaml(content);
      } catch (err) {
        if (!active) return;
        setYaml(fallbackYaml);
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o YAML.');
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  async function handleServiceChange(nextSlug: string) {
    setServiceSlug(nextSlug);
    setCopyStatus('');
    setError('');
    try {
      setYaml(await getSchemaYaml(nextSlug));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o YAML.');
      setYaml(fallbackYaml);
    }
  }

  function handleDownload() {
    const blob = new Blob([yaml], { type: 'application/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${serviceSlug}-action.yaml`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="card-panel">
      <div className="section-heading">
        <div>
          <span className="section-label">Schema YAML</span>
          <h2>Copie o schema da Action</h2>
        </div>

        <select className="service-select" value={serviceSlug} onChange={(event) => void handleServiceChange(event.target.value)}>
          {schemas.length === 0 ? <option value="moodle">Moodle</option> : null}
          {schemas.map((schema) => (
            <option key={schema.serviceSlug} value={schema.serviceSlug} disabled={!schema.available}>
              {schema.serviceName}
            </option>
          ))}
        </select>
      </div>

      <p className="hero-text">Serviço selecionado: {selectedSchema?.serviceName ?? 'Moodle'}. Use o arquivo abaixo como base para cadastrar a Action no GPT.</p>

      {isLoading ? <div className="alert">Carregando schema...</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}
      {copyStatus ? <div className="alert alert-success">{copyStatus}</div> : null}

      <div className="button-row compact">
        <button
          className="button"
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(yaml);
            setCopyStatus('YAML copiado.');
          }}
        >
          Copiar YAML
        </button>
        <button className="button button-secondary" type="button" onClick={handleDownload}>
          Baixar arquivo .yaml
        </button>
      </div>

      <pre className="code-panel">
        <code>{yaml}</code>
      </pre>

      <div className="callout">Depois de copiar, cole o schema na seção Actions do seu GPT personalizado e configure a autenticação com sua chave de API.</div>
    </section>
  );
}
