# moodle-consultas

Proxy **somente leitura** do Moodle para uso como ChatGPT Action, hospedado no Supabase Edge Functions.

## Arquitetura

```
ChatGPT Action
     │  Bearer token (api_key)
     ▼
Supabase Edge Function — moodle-proxy
     │  valida api_key na tabela api_keys
     │  chama Web Services do Moodle
     ▼
Moodle (ead.fieg.com.br)
```

## Estrutura

```
supabase/
  functions/
    moodle-proxy/index.ts   # proxy principal — todas as rotas de consulta
    register/index.ts       # endpoint de cadastro e geração de chave de API
  migrations/
    0001_create_api_keys.sql
frontend/
  index.html               # página de cadastro (hospedada no GitHub Pages)
openapi/
  moodle_consultas.yaml    # spec OpenAPI 3.1 para importar no ChatGPT Actions
docs/
  instrucoes_gpt.md        # instruções de sistema para o GPT
```

## Rotas disponíveis

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Status do proxy (sem auth) |
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
| GET | `/reports/configurable/{reportId}` | Relatório configurável |

## Configuração

### Secrets no Supabase

No painel do Supabase: **Project Settings → Edge Functions → Secrets**

| Secret | Descrição |
|--------|-----------|
| `MOODLE_BASE_URL` | URL base do Moodle, ex: `https://ead.exemplo.com.br` |
| `MOODLE_TOKEN` | Token do Web Service Moodle |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados automaticamente.

### Banco de dados

Aplicar a migration em `supabase/migrations/0001_create_api_keys.sql` via Supabase Dashboard → SQL Editor.

## Uso

1. O usuário acessa `frontend/index.html` (GitHub Pages) e se registra para obter uma `api_key`.
2. A `api_key` é usada como **Bearer token** na configuração de autenticação da Action no ChatGPT.
3. O GPT usa o schema `openapi/moodle_consultas.yaml` para saber quais endpoints chamar.

## Projeto Supabase ativo

- **Projeto:** `scrzziyuruzzhebpzvdl` (Moodle Consultas Proxy, us-east-1)
- **Proxy URL:** `https://scrzziyuruzzhebpzvdl.supabase.co/functions/v1/moodle-proxy`
- **Registro:** `https://scrzziyuruzzhebpzvdl.supabase.co/functions/v1/register`
- **Frontend:** `https://julioall.github.io/moodle-consultas-api-key/`
