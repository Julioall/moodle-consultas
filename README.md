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
    register/index.ts       # endpoint de cadastro e geração de chave de API
  migrations/
    0001_create_api_keys.sql
    0002_create_moodle_user_sessions.sql
frontend/
  index.html                # entrada do app React + Vite
  src/                      # Home, Login, Register, Dashboard, Services, API Key, YAML e Help
  public/schemas/moodle.yaml
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
| `/dashboard/api-key` | Chave de API |
| `/dashboard/yaml` | Schema YAML / OpenAPI |
| `/dashboard/help` | Ajuda guiada |

## Autenticação do MVP

O cadastro do frontend chama a Edge Function `register`, valida o usuário/senha do Moodle, cria uma chave de API no Supabase e salva a sessão local do painel no navegador.

O login do painel é feito pela chave de API: o frontend chama `/session` no `moodle-proxy` com `Authorization: Bearer <chave>` e só libera o dashboard se o backend confirmar a chave.

Este MVP ainda não usa senha própria de conta via Supabase Auth. A credencial real do painel é a chave de API emitida pelo backend.

## Rotas do backend

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
| `MOODLE_BASE_URL` | URL base do Moodle, ex: `https://ead.exemplo.com.br` |
| `MOODLE_TOKEN` | Token do Web Service Moodle |
| `MOODLE_SERVICE_NAME` | Nome curto do serviço de webservice usado para gerar token por usuário no `login/token.php` |
| `MOODLE_SESSION_SECRET` | Segredo forte para cifrar tokens Moodle por usuário no banco |
| `MOODLE_SESSION_TTL_SECONDS` | TTL local da sessão Moodle por usuário, opcional; padrão 43200 segundos |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados automaticamente.

## Projeto Supabase ativo

- **Projeto:** `scrzziyuruzzhebpzvdl` (Moodle Consultas Proxy, us-east-1)
- **Proxy URL:** `https://scrzziyuruzzhebpzvdl.supabase.co/functions/v1/moodle-proxy`
- **Registro:** `https://scrzziyuruzzhebpzvdl.supabase.co/functions/v1/register`
- **Frontend:** `https://julioall.github.io/moodle-consultas/`
