# moodle-consultas

Plataforma de Actions para GPTs personalizados. O Moodle é o primeiro conector, mas a base já foi preparada para receber outros serviços no futuro, como Google Drive, planilhas, APIs internas, ERPs e CRMs.

## Arquitetura

```
Frontend React + Vite
     │  login, cadastro, dashboard, schema YAML e ajuda
     ▼
API backend no Supabase
     │  autenticação, chaves de API e proxy dos conectores
     ▼
Conectores externos
     │  Moodle hoje, outros serviços depois
     ▼
Sistemas de origem
```

## Estrutura

```
supabase/
  functions/
    moodle-proxy/index.ts   # proxy principal — rotas read-only do Moodle
    platform-api/index.ts   # API do dashboard — auth, serviços, API keys e schemas
  migrations/
    0001_create_api_keys.sql
    0002_create_moodle_user_sessions.sql
    0003_platform_actions_mvp.sql
frontend/
  index.html                # entrada do app React + Vite
  src/                      # Home, Login, Register, Dashboard, Services, API Key, YAML e Help
openapi/
  moodle_consultas.yaml     # spec OpenAPI canônica do conector Moodle
docs/
  instrucoes_gpt.md         # instruções de sistema para o GPT
```

## Rotas do frontend

| Rota | Descrição |
|------|-----------|
| `/` | Página inicial pública |
| `/login` | Login |
| `/register` | Cadastro |
| `/dashboard` | Visão geral do painel |
| `/dashboard/services` | Serviços disponíveis |
| `/dashboard/services/moodle` | Ativação e configuração do Moodle |
| `/dashboard/api-key` | Chave de API |
| `/dashboard/yaml` | Schema YAML / OpenAPI |
| `/dashboard/help` | Ajuda guiada |

## Autenticação do MVP

O cadastro e login da plataforma usam Supabase Auth com e-mail e senha.

O dashboard chama a Edge Function `platform-api` usando o JWT Supabase da sessão. Por ela o usuário consulta serviços, ativa/desativa Moodle, gera API key e obtém o YAML.

A API key das GPT Actions é separada do login da plataforma. Ela usa o formato `gah_live_*`, é salva apenas como HMAC-SHA-256 no banco e a chave completa aparece somente ao gerar/regenerar.

API keys legadas em texto não autenticam mais.

## Rotas do backend

### `platform-api`

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/auth/me` | Perfil da conta autenticada |
| GET | `/services` | Serviços disponíveis com status do usuário |
| GET | `/services/{slug}` | Detalhe de um serviço |
| POST | `/services/{slug}/activate` | Ativar serviço; Moodle exige usuário/senha Moodle |
| POST | `/services/{slug}/deactivate` | Desativar serviço |
| GET | `/api-keys/current` | Preview da chave de API ativa |
| POST | `/api-keys/regenerate` | Revoga a chave anterior e retorna uma nova chave completa uma única vez |
| GET | `/schemas` | Schemas disponíveis |
| GET | `/schemas/{serviceSlug}.yaml` | Schema YAML do serviço |

### `moodle-proxy`

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Status do proxy |
| GET | `/session` | Sessão Moodle vinculada à chave de API |
| GET | `/courses` | Listar/filtrar cursos |
| GET | `/courses/search` | Pesquisar cursos por texto |
| GET | `/courses/{courseId}/contents` | Conteúdos do curso |
| GET | `/courses/{courseId}/students` | Alunos do curso |
| GET | `/users/search` | Pesquisar usuários |
| GET | `/users/by-field` | Consultar usuários por campo |
| GET | `/users/{userId}/courses` | Cursos de um aluno |
| GET | `/users/{userId}/last-access` | Últimos acessos do aluno |
| GET | `/users/{userId}/courses/{courseId}/grades` | Notas do aluno |
| GET | `/users/{userId}/courses/{courseId}/completion` | Status de conclusão |
| GET | `/users/{userId}/courses/{courseId}/pending-activities` | Atividades pendentes |
| GET | `/assignments/course/{courseId}` | Tarefas do curso |
| GET | `/assignments/{assignmentId}/submissions` | Entregas de uma tarefa |
| GET | `/assignments/{assignmentId}/grades` | Notas de uma tarefa |
| GET | `/reports/pending-grading` | Relatório de correções pendentes |
| GET | `/reports/pending-delivery` | Relatório de entregas pendentes |
| GET | `/reports/courses-summary` | Resumo rápido para lista de cursos |
| GET | `/reports/students-risk` | Alunos em atenção/risco/crítico por curso |
| GET | `/reports/course-gradebook` | Notas lançadas em atividades por curso |
| GET | `/reports/course-audit` | Auditoria de materiais e cronograma do curso |
| GET | `/reports/configurable/{reportId}` | Relatório configurável |

## Uso local

Dentro de `frontend/`:

```bash
npm.cmd install
npm.cmd run dev
npm.cmd run build
```

## Configuração do Supabase

No painel do Supabase: **Project Settings → Edge Functions → Secrets**.

| Secret | Descrição |
|--------|-----------|
| `API_KEY_HASH_SECRET` | Segredo forte para HMAC-SHA-256 das API keys `gah_live_*` |
| `MOODLE_BASE_URL` | URL base do Moodle, ex: `https://ead.exemplo.com.br` |
| `MOODLE_SERVICE_NAME` | Nome curto do serviço de webservice usado para gerar token por usuário no `login/token.php` |
| `MOODLE_SESSION_SECRET` | Segredo forte para cifrar tokens Moodle por usuário no banco |
| `MOODLE_SESSION_TTL_SECONDS` | TTL local da sessão Moodle por usuário, opcional; padrão 43200 segundos |
| `MOODLE_OPENAPI_SCHEMA_URL` | URL pública do schema YAML, opcional |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados automaticamente.

No GitHub Actions, configure também:

| Secret | Descrição |
|--------|-----------|
| `SUPABASE_ACCESS_TOKEN` | Token para deploy de Edge Functions e aplicação das migrations via Management API |
| `SUPABASE_ANON_KEY` | Chave pública anon/publishable usada no build do frontend para Supabase Auth |

## Projeto Supabase ativo

- **Projeto:** `scrzziyuruzzhebpzvdl`
- **Proxy URL:** `https://scrzziyuruzzhebpzvdl.supabase.co/functions/v1/moodle-proxy`
- **Dashboard API:** `https://scrzziyuruzzhebpzvdl.supabase.co/functions/v1/platform-api`
- **Frontend:** `https://julioall.github.io/moodle-consultas/`
