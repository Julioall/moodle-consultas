# Mapa da Claris para evoluir o Moodle Consultas como GPT Actions

Atualizado em `2026-05-14`.

Este documento mapeia os caminhos, funcoes e capacidades da Claris que devem servir de referencia para evoluir o repositorio `Julioall/moodle-consultas.git`.

Objetivo: permitir que o `moodle-consultas` seja usado por GPT Actions como ponto de consulta e, em fases controladas, como camada operacional com habilidades parecidas com a Claris: consultar Moodle, resumir contexto academico, identificar riscos, criar tarefas, consultar agenda, preparar mensagens, confirmar envios somente quando houver canal autorizado e registrar auditoria.

## Principio de arquitetura

O `moodle-consultas` atual esta correto como proxy read-only para GPT Actions. Para chegar perto da Claris, nao transforme o GPT em dono de segredos nem em executor direto de operacoes sensiveis. Use esta separacao:

| Camada | Responsabilidade |
| --- | --- |
| GPT Action | Chamar endpoints HTTP definidos no OpenAPI, com Bearer `api_key`. |
| Supabase Edge Functions | Validar API key, aplicar permissoes, executar consultas e acoes, auditar. |
| Moodle | Fonte primaria de cursos, alunos, notas, atividades e mensagens. |
| Banco Supabase do `moodle-consultas` | API keys, auditoria, jobs, cache opcional, tarefas, agenda e historico operacional. |
| GitHub Actions | CI/CD, deploy, smoke tests e jobs agendados. Nao deve ser o runtime sincrono principal do GPT. |

Regra pratica: o GPT chama Supabase Edge Functions. GitHub Actions fica para validacao, deploy e rotinas agendadas. Se algum workflow precisar ser disparado pelo GPT, trate como job assincrono, com `workflow_dispatch` ou `repository_dispatch`, e retorne um `job_id` para consulta posterior.

## Premissas reais do `moodle-consultas`

Esta adaptacao nao deve assumir o mesmo modelo de identidade da Claris.

| Tema | Claris | `moodle-consultas` atual | Consequencia pratica |
| --- | --- | --- | --- |
| Identidade Moodle | Usuario faz login no Moodle. | Proxy usa um `MOODLE_TOKEN` fixo configurado como secret. | Nao existe "usuario Moodle logado" dentro da Action. |
| Identidade da Action | Sessao/app com usuario e permissoes. | `api_key` propria do proxy, sem vinculo automatico com usuario Moodle. | A API key identifica quem usa o proxy, nao quem esta logado no Moodle. |
| Escopo de dados | Dados filtrados pelo usuario logado e permissoes dele. | Dados visiveis para o token tecnico do Moodle. | Toda consulta depende das permissoes desse token fixo. |
| Escrita no Moodle | Pode operar em nome do usuario/sessao quando permitido. | O proxy atual so aceita GET e so libera funcoes read-only. | Nao enviar mensagens, alterar notas, matriculas ou cursos pelo estado atual. |
| Mensagens | Pode preparar e enviar por fluxo controlado. | Sem funcao de mensagem liberada e sem usuario Moodle individual. | No maximo preparar rascunhos/jobs internos; envio real fica bloqueado ate haver canal autorizado. |

Com token fixo, o caminho seguro e tratar o projeto como uma camada de consulta institucional. Ele pode responder perguntas sobre cursos, alunos, notas, conclusao, entregas e relatorios desde que o token tecnico tenha permissao no Moodle. Ele nao pode prometer comportamento "meus cursos", "minhas mensagens" ou "enviar como professor logado", porque esse contexto nao existe no backend atual.

### O que muda em relacao a Claris

- `moodle-auth` da Claris nao deve ser copiado literalmente para o GPT Actions.
- Ferramentas baseadas no usuario logado precisam virar consultas explicitas por `courseId`, `userId`, `email`, `username`, `idnumber` ou filtros de relatorio.
- Acoes de mensagem devem ficar como `prepare`/rascunho interno enquanto nao houver login Moodle por usuario ou token tecnico com permissao clara para envio institucional.
- Tarefas, agenda, auditoria e sugestoes podem existir no Supabase do `moodle-consultas`, porque nao dependem de escrever no Moodle.
- GitHub Actions nao substitui login Moodle nem runtime sincrono da Action; ele serve para CI, deploy e jobs assincronos.

## Fontes canonicas na Claris

Use estes caminhos da Claris como fonte para copiar padroes e comportamento:

| Caminho na Claris | Funcao |
| --- | --- |
| `docs/CLARIS.md` | Visao funcional, dominios e fluxos principais. |
| `docs/ARCHITECTURE.md` | Arquitetura frontend/backend, fronteiras de dominio e seguranca. |
| `docs/EDGE_FUNCTIONS.md` | Convencoes de Edge Functions, auth, CORS, runtime compartilhado e deploy. |
| `.github/copilot-instructions.md` | Convencoes de desenvolvimento e instrucoes para agentes de codigo. |
| `src/features/claris/` | UI, hooks e API frontend da Claris IA. |
| `supabase/functions/claris-chat/` | Endpoint principal do chat IA. |
| `supabase/functions/_shared/claris/tools.ts` | Definicoes de ferramentas em formato function-calling. |
| `supabase/functions/_shared/claris/executors.ts` | Execucao real das ferramentas, permissoes e auditoria. |
| `supabase/functions/_shared/claris/chat-config.ts` | Prompt base e selecao dinamica de ferramentas por intencao. |
| `supabase/functions/_shared/claris/loop.ts` | Loop LLM, tool calls, `uiActions` e `richBlocks`. |
| `supabase/functions/_shared/claris/knowledge-base.ts` | Base de ajuda da plataforma usada pela tool `get_platform_help`. |
| `supabase/functions/_shared/http/` | Handler padrao, CORS, validacao de body e respostas. |
| `supabase/functions/_shared/auth/` | Resolucao de usuario e permissoes. |
| `supabase/functions/_shared/moodle/` | Cliente Moodle, chamadas REST, retry e normalizacao de erro. |
| `scripts/smoke-edge-functions.mjs` | Modelo de smoke test local para Edge Functions. |
| `scripts/deploy-supabase-functions.mjs` | Modelo de deploy remoto de Edge Functions. |

## Mapa funcional da Claris

| Dominio | Caminhos principais | Habilidades |
| --- | --- | --- |
| Auth e sessao Moodle | `src/features/auth/`, `supabase/functions/moodle-auth/` | Login Moodle, sessao local, sincronizacao inicial, reautenticacao de fundo. |
| Cursos | `src/features/courses/`, `supabase/functions/moodle-sync-courses/` | Listar cursos, vincular cursos selecionados, painel de UC, catalogo. |
| Alunos | `src/features/students/`, `supabase/functions/moodle-sync-students/` | Listar alunos, perfil, historico, atividades, notas e sugestao de correcao. |
| Atividades e notas | `supabase/functions/moodle-sync-activities/`, `moodle-sync-grades/`, `moodle-grade-suggestions/` | Sincronizar atividades/notas, identificar pendencias, gerar sugestao IA de nota e feedback. |
| Dashboard | `src/features/dashboard/`, `src/features/dashboard/api/` | KPIs, risco, atividades a corrigir, lista de prioridade. |
| Claris IA | `src/features/claris/`, `supabase/functions/claris-chat/`, `_shared/claris/` | Chat, ferramentas, sugestoes, acoes assistidas, resposta rica. |
| Tarefas | `src/features/tasks/`, tool executors em `_shared/claris/executors.ts` | Criar, listar, atualizar, concluir e etiquetar tarefas. |
| Agenda | `src/features/agenda/`, tool executors em `_shared/claris/executors.ts` | Criar, listar, atualizar e remover eventos. |
| Mensagens Moodle | `supabase/functions/moodle-messaging/`, `src/features/claris/hooks/useChat.ts` | Conversas Moodle, mensagens, envio individual. |
| Campanhas e envios | `src/features/campaigns/`, `bulk-message-send/`, `process-scheduled-messages/` | Preparar job, confirmar envio, acompanhar status, executar agendamentos. |
| WhatsApp | `src/features/whatsapp/`, `whatsapp-instance-manager/`, `whatsapp-messaging/` | Instancias Evolution API, contatos, chats, mensagens e webhook. |
| Admin e configuracoes | `src/features/admin/`, `src/features/settings/` | Usuarios, grupos, permissoes, LLM settings, logs, suporte, limpeza. |

## Rotas frontend da Claris

| Rota | Permissao | Pagina |
| --- | --- | --- |
| `/` | `dashboard.view` | Dashboard |
| `/meus-cursos` | `courses.catalog.view` | Meus cursos |
| `/escolas` | `schools.view` | Escolas |
| `/cursos/:id` | `courses.panel.view` | Painel do curso |
| `/alunos` | `students.view` | Lista de alunos |
| `/alunos/:id` | `students.view` | Perfil do aluno |
| `/tarefas` | `tasks.view` | Kanban/lista de tarefas |
| `/agenda` | `agenda.view` | Agenda |
| `/mensagens` | `messages.view` | Mensagens/templates |
| `/whatsapp` | `whatsapp.view` | WhatsApp |
| `/campanhas` | `messages.bulk_send` | Campanhas e jobs |
| `/claris` | `claris.view` | Chat Claris IA |
| `/relatorios` | `reports.view` | Relatorios |
| `/configuracoes` | `settings.view` | Configuracoes pessoais |
| `/meus-servicos` | `services.view` | Servicos |
| `/admin/*` | admin app role | Administracao |

## Edge Functions da Claris

| Function | Caminho | Contrato principal |
| --- | --- | --- |
| `moodle-auth` | `supabase/functions/moodle-auth/` | Autentica no Moodle e retorna token/sessao. |
| `moodle-reauth-settings` | `supabase/functions/moodle-reauth-settings/` | Gerencia credenciais cifradas para reautenticacao. |
| `moodle-sync-courses` | `supabase/functions/moodle-sync-courses/` | `sync_courses`, `link_selected_courses`. |
| `moodle-sync-students` | `supabase/functions/moodle-sync-students/` | Sincroniza alunos de cursos selecionados. |
| `moodle-sync-activities` | `supabase/functions/moodle-sync-activities/` | Sincroniza conteudos, atividades e status. |
| `moodle-sync-grades` | `supabase/functions/moodle-sync-grades/` | `sync_grades`, `debug_grades`. |
| `moodle-grade-suggestions` | `supabase/functions/moodle-grade-suggestions/` | `generate_suggestion`, `generate_activity_suggestions`, `get_activity_suggestion_job`, `resume_activity_suggestion_job`, `cancel_activity_suggestion_job`, `approve_suggestion`. |
| `moodle-messaging` | `supabase/functions/moodle-messaging/` | `get_conversations`, `get_messages`, `send_message`. |
| `bulk-message-send` | `supabase/functions/bulk-message-send/` | Cria ou executa job de envio em massa. |
| `process-scheduled-messages` | `supabase/functions/process-scheduled-messages/` | Cron/dispatch para processar mensagens agendadas. |
| `claris-chat` | `supabase/functions/claris-chat/` | Chat IA com tool-calling e permissoes. |
| `claris-llm-test` | `supabase/functions/claris-llm-test/` | Testa configuracao global do LLM. |
| `generate-proactive-suggestions` | `supabase/functions/generate-proactive-suggestions/` | Gera sugestoes proativas. |
| `generate-automated-tasks` | `supabase/functions/generate-automated-tasks/` | Gera tarefas automaticas. |
| `generate-recurring-tasks` | `supabase/functions/generate-recurring-tasks/` | Gera tarefas recorrentes. |
| `data-cleanup` | `supabase/functions/data-cleanup/` | Limpeza operacional admin-only. |
| `whatsapp-instance-manager` | `supabase/functions/whatsapp-instance-manager/` | `create`, `connect`, `status`, `qrcode`, `configure-webhook`, `deactivate`, `delete`, `list`. |
| `whatsapp-messaging` | `supabase/functions/whatsapp-messaging/` | `get_contacts`, `get_chats`, `get_messages`, `send_message`, `send_media`, `send_sticker`, `resolve_media`. |
| `receive-whatsapp-webhook` | `supabase/functions/receive-whatsapp-webhook/` | Recebe eventos da Evolution API. |

## Ferramentas da Claris IA

Estas sao as ferramentas definidas em `supabase/functions/_shared/claris/tools.ts` e executadas por `executors.ts`. Para o `moodle-consultas`, elas podem virar endpoints OpenAPI individuais ou ficar atras de um endpoint unico `POST /agent/chat`.

### Consultas e analise academica

| Tool | Permissao | O que faz |
| --- | --- | --- |
| `get_dashboard_summary` | `dashboard.view` | Resumo de cursos, alunos por risco, tarefas e atividades a corrigir. |
| `get_students_at_risk` | `students.view` | Lista alunos em `atencao`, `risco` ou `critico`. |
| `get_student_details` | `students.view` | Perfil completo por nome: dados basicos, risco, tarefas e notas. |
| `get_activities_to_review` | `students.view` | Entregas aguardando correcao/avaliacao. |
| `get_student_summary` | `students.view` | Resumo rico por `student_id` ou nome: notas, faltas, tarefas e acesso. |
| `get_student_history` | `students.view` | Historico de snapshots, mudancas de risco e possivel evasao. |
| `get_grade_risk` | `students.view` | Alunos abaixo de percentual minimo de nota. |
| `get_engagement_signals` | `students.view` | Alunos sem acesso recente. |
| `get_recent_attendance_risk` | `students.view` | Alunos com faltas recentes acima do limite. |
| `get_upcoming_calendar_commitments` | `agenda.view` | Compromissos proximos da agenda. |

### Tarefas

| Tool | Permissao | O que faz |
| --- | --- | --- |
| `get_pending_tasks` | `tasks.view` | Lista pendencias abertas/em andamento. |
| `create_task` | `tasks.view` | Cria tarefa vinculada a aluno, curso, UC, turma ou contexto customizado. |
| `batch_create_tasks` | `tasks.view` | Cria ate 100 tarefas em lote. |
| `update_task` | `tasks.view` | Atualiza titulo, descricao, prioridade e prazo. |
| `change_task_status` | `tasks.view` | Altera status para `todo`, `in_progress` ou `done`. |
| `add_tag_to_task` | `tasks.view` | Adiciona tag em tarefa existente. |
| `list_tasks` | `tasks.view` | Lista tarefas com filtros. |

### Agenda

| Tool | Permissao | O que faz |
| --- | --- | --- |
| `create_event` | `agenda.view` | Cria evento de agenda. |
| `batch_create_events` | `agenda.view` | Cria ate 100 eventos em lote. |
| `update_event` | `agenda.view` | Atualiza evento. |
| `delete_event` | `agenda.view` | Remove evento do usuario. |
| `list_events` | `agenda.view` | Lista eventos por periodo/tipo. |

### Mensagens

| Tool | Permissao | O que faz |
| --- | --- | --- |
| `find_students_for_messaging` | `messages.view` | Busca alunos por nome para desambiguacao. |
| `prepare_single_student_message_send` | `messages.view` | Prepara mensagem individual sem enviar. |
| `confirm_single_student_message_send` | `messages.view` | Confirma e executa envio individual previamente preparado. |
| `list_message_templates` | `messages.view` | Lista modelos de mensagem e variaveis. |
| `prepare_bulk_message_send` | `messages.bulk_send` | Prepara envio em lote, cria job pendente e retorna previa. |
| `confirm_bulk_message_send` | `messages.bulk_send` | Confirma envio em lote somente com confirmacao explicita vinculada ao `job_id`. |
| `cancel_bulk_message_send` | `messages.bulk_send` | Cancela job pendente. |

### Rotina, suporte e ajuda

| Tool | Permissao | O que faz |
| --- | --- | --- |
| `get_tutor_routine_suggestions` | `claris.proactive.generate` | Sugestoes de rotina do tutor com contexto academico. |
| `generate_weekly_checklist` | `claris.proactive.generate` | Checklist semanal com alunos em risco, correcoes, comunicacao, agenda e tarefas. |
| `run_proactive_engines` | `claris.proactive.generate` | Dispara motores de sugestao proativa. |
| `save_suggestion` | `claris.proactive.generate` | Salva sugestao para aparecer no painel. |
| `get_notifications` | `messages.view` | Le notificacoes internas do usuario. |
| `notify_user` | `messages.view` | Cria notificacao interna. |
| `get_platform_help` | sem permissao explicita no executor | Consulta base de conhecimento da plataforma. |
| `create_support_ticket` | sem permissao explicita no executor | Cria ticket de suporte vinculado ao usuario. |

## Regras de seguranca copiadas da Claris

1. Toda function critica deve validar usuario/API key dentro do handler, mesmo com `verify_jwt = false`.
2. Nunca exponha `MOODLE_TOKEN`, service role key, token LLM ou secrets no OpenAPI.
3. Toda acao com efeito colateral deve gerar auditoria.
4. Envio de mensagem a terceiros exige fluxo em duas fases: `prepare_*` e `confirm_*`.
5. Confirmacao deve estar vinculada ao `job_id`.
6. Excluir evento, alterar agenda compartilhada, enviar mensagem, aprovar nota ou escrever no Moodle exige confirmacao explicita.
7. Consultas, resumo, ajuda, checklist, notificacao interna e tarefa pessoal podem ser executados com menor friccao.
8. O agente nao deve inventar notas, datas, entregas, acessos, status ou confirmacoes.
9. Resultados inferidos precisam dizer o criterio usado.
10. Dados pessoais devem aparecer somente quando necessarios para a consulta.

## Estado atual do `moodle-consultas`

O repositorio ja tem uma base boa para GPT Actions:

| Caminho | Funcao atual |
| --- | --- |
| `supabase/functions/moodle-proxy/index.ts` | Proxy GET read-only para Moodle. |
| `supabase/functions/register/index.ts` | Cadastro de usuario e geracao de `api_key`. |
| `supabase/migrations/0001_create_api_keys.sql` | Tabela de API keys. |
| `openapi/moodle_consultas.yaml` | Schema OpenAPI 3.1 para importar no GPT Actions. |
| `docs/instrucoes_gpt.md` | Instrucoes atuais do GPT read-only. |
| `frontend/index.html` | Pagina simples para obter chave de API. |

### Rotas read-only atuais

| OperationId | Rota | Origem Moodle/proxy |
| --- | --- | --- |
| `healthCheck` | `GET /health` | Status do proxy. |
| `listCoursesByField` | `GET /courses` | `core_course_get_courses_by_field`. |
| `searchCourses` | `GET /courses/search` | `core_course_search_courses`. |
| `getCourseContents` | `GET /courses/{courseId}/contents` | `core_course_get_contents`. |
| `getCourseStudents` | `GET /courses/{courseId}/students` | `core_enrol_get_enrolled_users`. |
| `searchUsers` | `GET /users/search` | `core_user_get_users`. |
| `getUsersByField` | `GET /users/by-field` | `core_user_get_users_by_field`. |
| `getUserCourses` | `GET /users/{userId}/courses` | `core_enrol_get_users_courses`. |
| `getUserLastAccess` | `GET /users/{userId}/last-access` | Composicao de cursos/participantes. |
| `getStudentGrades` | `GET /users/{userId}/courses/{courseId}/grades` | `gradereport_user_get_grade_items`. |
| `getStudentCompletion` | `GET /users/{userId}/courses/{courseId}/completion` | `core_completion_get_activities_completion_status`. |
| `getStudentPendingActivities` | `GET /users/{userId}/courses/{courseId}/pending-activities` | Composicao de completion, contents e assignments. |
| `getCourseAssignments` | `GET /assignments/course/{courseId}` | `mod_assign_get_assignments`. |
| `getAssignmentSubmissions` | `GET /assignments/{assignmentId}/submissions` | `mod_assign_get_submissions`. |
| `getAssignmentGrades` | `GET /assignments/{assignmentId}/grades` | `mod_assign_get_grades`. |
| `reportPendingGrading` | `GET /reports/pending-grading` | Composicao de assignments, submissions e grades. |
| `reportPendingDelivery` | `GET /reports/pending-delivery` | Composicao de assignments e estudantes. |
| `getConfigurableReport` | `GET /reports/configurable/{reportId}` | `block_configurable_reports_get_report_data`. |

## Lacunas para chegar perto da Claris

| Capacidade da Claris | Existe no `moodle-consultas`? | O que falta |
| --- | --- | --- |
| Consulta Moodle read-only | Sim | Ampliar endpoints conforme demanda. |
| Chat agente com tool-calling | Nao | Criar `supabase/functions/agent-chat` ou `claris-agent`. |
| Permissoes por usuario/grupo | Parcial | API key existe, mas falta escopo/permissoes por rota/tool; isso nao equivale a usuario Moodle logado. |
| Auditoria de acoes IA | Nao | Criar tabela `agent_action_audit`. |
| Tarefas internas | Nao | Criar tabela e endpoints/tools de tasks. |
| Agenda interna | Nao | Criar tabela e endpoints/tools de calendar events. |
| Sugestoes proativas | Nao | Criar tabela de sugestoes e motores agendados. |
| Mensagens Moodle com confirmacao | Bloqueado no modelo atual | So adicionar envio se houver login Moodle por usuario, token tecnico com permissao institucional explicita ou outro canal autorizado; por enquanto, fazer apenas rascunho/prepare interno. |
| WhatsApp/Evolution API | Nao | Adicionar somente se for requisito; manter separado de Moodle. |
| Correcao IA de atividades | Nao | Sugestao read-only e possivel; gravar nota no Moodle exige token/write scope separado, auditoria e aprovacao manual. |
| GitHub Actions de CI/deploy | Nao encontrado | Adicionar workflows. |

## Matriz de viabilidade com token fixo

| Capacidade | Viabilidade agora | Como implementar sem login Moodle |
| --- | --- | --- |
| Pesquisar cursos e listar por campo | Alta | Usar endpoints atuais `/courses` e `/courses/search`, sempre deixando claro que a visibilidade vem do token tecnico. |
| Listar alunos de um curso | Alta, se o token tiver permissao | Exigir `courseId` e usar `/courses/{courseId}/students`. |
| Consultar cursos de um aluno especifico | Parcial | Usar `/users/{userId}/courses` quando o usuario for informado explicitamente; nao tratar como "cursos do usuario logado". |
| Consultar "meus cursos" | Nao viavel como login | Possivel somente se existir mapeamento `api_key -> moodle_user_id` ou login Moodle por usuario. |
| Notas, conclusao e pendencias de aluno | Alta, se o token tiver permissao | Exigir `userId` e `courseId`; usar endpoints atuais de grades, completion e pending activities. |
| Risco academico e engajamento | Media | Calcular por composicao de notas, entregas, conclusao e ultimo acesso; documentar criterios de inferencia. |
| Dashboard institucional | Media | Criar relatorios compostos por curso/periodo; pode ser caro, entao usar cache/jobs quando envolver muitos cursos. |
| Tarefas internas | Alta | Criar tabelas/endpoints no Supabase, vinculadas a `api_key_id`, curso/aluno/contexto opcional. |
| Agenda interna | Alta | Criar tabelas/endpoints no Supabase, sem depender do Moodle. |
| Mensagens Moodle | Baixa/bloqueada | Preparar texto e destinatarios, mas nao enviar enquanto nao houver identidade/canal autorizado. |
| Envio por outro canal | Condicional | Integrar WhatsApp/e-mail somente com credenciais proprias, opt-in, auditoria e confirmacao. |
| Escrever no Moodle | Baixa/bloqueada | Separar token de escrita, scopes, confirmacao e auditoria; nao misturar com o proxy read-only. |
| GitHub Actions disparado pela Action | Condicional | Usar Edge Function intermediaria que cria job, valida scope e dispara `workflow_dispatch`/`repository_dispatch`; nunca chamar GitHub direto do GPT com segredo. |

## Arquitetura recomendada para o agente do `moodle-consultas`

### Opcao recomendada: agente server-side

Crie uma Edge Function unica:

```text
supabase/functions/agent-chat/
  index.ts
  payload.ts
  _shared ou imports de ../_shared/
```

Contrato:

```http
POST /agent-chat
Authorization: Bearer <api_key>
Content-Type: application/json
```

Payload:

```json
{
  "message": "Quais alunos do curso 123 estao com entregas pendentes?",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "context": {
    "courseId": 123
  }
}
```

Resposta:

```json
{
  "ok": true,
  "reply": "Resumo em portugues...",
  "uiActions": [],
  "richBlocks": [],
  "toolResults": []
}
```

Vantagens:

- replica melhor o `claris-chat`;
- centraliza permissoes e confirmacoes;
- reduz complexidade do OpenAPI;
- evita que o GPT escolha endpoints destrutivos sem guardrails;
- permite devolver `uiActions` para confirmacao de job.

### Opcao alternativa: uma Action por ferramenta

Exponha cada tool como endpoint OpenAPI. Exemplo:

```http
POST /tools/tasks/create
POST /tools/messages/prepare-bulk-send
POST /tools/messages/confirm-bulk-send
GET  /tools/students/at-risk
```

Use esta opcao somente se quiser que o proprio GPT orquestre as ferramentas diretamente. Mesmo assim, mantenha confirmacao em duas fases no backend.

## Contrato minimo de novas tabelas

O `moodle-consultas` nao precisa copiar todo o banco da Claris no inicio. Comece com um modelo minimo:

| Tabela | Campos essenciais | Uso |
| --- | --- | --- |
| `api_keys` | ja existe | Autenticacao por Bearer token. |
| `agent_action_audit` | `id`, `api_key_id`, `tool_name`, `tool_args`, `result_summary`, `created_at` | Auditoria imutavel. |
| `agent_jobs` | `id`, `api_key_id`, `type`, `status`, `payload`, `result`, `created_at`, `updated_at` | Jobs pendentes/processando/concluidos. |
| `tasks` | `id`, `api_key_id`, `title`, `description`, `status`, `priority`, `due_date`, `entity_type`, `entity_id`, `tags` | Tarefas internas. |
| `calendar_events` | `id`, `api_key_id`, `title`, `description`, `start_at`, `end_at`, `type`, `location`, `tags` | Agenda interna. |
| `message_templates` | `id`, `api_key_id`, `title`, `category`, `content`, `is_favorite` | Templates de mensagem. |
| `message_jobs` | `id`, `api_key_id`, `channel`, `status`, `message_content`, `recipient_count`, `sent_count`, `failed_count` | Rascunho/job de mensagem; envio real so quando houver canal autorizado. |
| `message_job_recipients` | `id`, `job_id`, `moodle_user_id`, `student_name`, `personalized_message`, `status`, `error_message` | Destinatarios por job, inicialmente para previa/rascunho. |
| `agent_suggestions` | `id`, `api_key_id`, `type`, `title`, `body`, `priority`, `status`, `expires_at` | Sugestoes proativas. |
| `moodle_user_links` | `id`, `api_key_id`, `moodle_user_id`, `source`, `verified_at`, `created_at` | Opcional: vinculo manual/verificado entre API key e usuario Moodle para simular contexto "meu usuario". |
| `moodle_user_tokens` | `id`, `api_key_id`, `moodle_user_id`, `encrypted_token`, `scopes`, `expires_at`, `created_at` | Opcional e sensivel: tokens por usuario obtidos fora do chat, se o Moodle permitir login por web service. |

Se o objetivo for operar em cima da base real da Claris, prefira integrar com o Supabase da Claris via Edge Function segura e permissoes explicitas, em vez de duplicar dados.

## Permissoes sugeridas no `moodle-consultas`

Adicione `scopes` na tabela `api_keys`, por exemplo como `text[]`:

| Scope | Permite |
| --- | --- |
| `moodle.read` | Consultas read-only atuais. |
| `agent.chat` | Usar `POST /agent-chat`. |
| `tasks.write` | Criar/editar/concluir tarefas internas. |
| `agenda.write` | Criar/editar eventos internos. |
| `messages.prepare` | Preparar mensagens e jobs. |
| `messages.send` | Confirmar envio de mensagens somente quando existir canal autorizado; nao liberar no token fixo atual. |
| `reports.read` | Relatorios compostos. |
| `admin.manage` | Operacoes administrativas. |
| `github.dispatch` | Disparar workflows GitHub assincronos via backend, se esse bridge for implementado. |
| `moodle.user_login` | Vincular ou usar token Moodle por usuario, se houver fluxo de login seguro fora do chat. |

Toda rota deve declarar o scope exigido e validar no backend.

## Opcoes para contexto de usuario Moodle

Se for necessario chegar mais perto da Claris, ha tres caminhos. Eles nao devem expor senha, token Moodle ou segredo GitHub ao GPT.

### Opcao 1: manter token fixo e adicionar vinculo manual

Adicionar `moodle_user_links` com `api_key_id` e `moodle_user_id`.

Vantagens:

- simples;
- nao exige senha Moodle;
- permite comandos como "meus cursos" serem traduzidos para `/users/{moodle_user_id}/courses`.

Limites:

- ainda consulta com o token tecnico;
- nao envia mensagens como o usuario;
- exige processo administrativo para criar/verificar o vinculo.

### Opcao 2: login Moodle via proxy fora do chat

Criar uma tela/endpoint de vinculacao que recebe credenciais ou SSO fora do GPT, chama o mecanismo oficial do Moodle para gerar token de web service e salva o token cifrado no Supabase.

Fluxo sugerido:

1. Usuario acessa uma pagina propria de vinculacao, nao o chat.
2. Frontend envia credenciais/SSO para uma Edge Function segura.
3. Edge Function chama o Moodle para obter token de web service do usuario.
4. Backend salva token cifrado e escopos permitidos.
5. GPT continua usando apenas a `api_key`; o backend escolhe token tecnico ou token do usuario conforme a rota.

Cuidados:

- nunca pedir senha Moodle dentro da conversa do GPT;
- confirmar se o Moodle permite token por usuario para o servico necessario;
- separar funcoes read-only de funcoes de escrita;
- revogar tokens e registrar auditoria;
- proteger a chave de cifragem como secret do Supabase.

### Opcao 3: SSO/OAuth, se o Moodle suportar

Preferir OAuth/OIDC ou fluxo institucional quando disponivel. O padrao e o mesmo: login acontece fora do GPT, o backend guarda somente o necessario, e a Action recebe apenas respostas filtradas e auditadas.

## Bridge para GitHub Actions

Se o objetivo for liberar execucao de GitHub Actions a partir do GPT, implemente uma Edge Function intermediaria, nao uma chamada direta do GPT para o GitHub.

Fluxo recomendado:

1. GPT chama `POST /github/jobs` com `api_key`.
2. Backend valida scope `github.dispatch`, payload permitido e rate limit.
3. Backend cria `agent_jobs` com status `pending`.
4. Backend dispara `workflow_dispatch` ou `repository_dispatch` usando GitHub App/PAT guardado em secret do Supabase.
5. Workflow executa CI/deploy/rotina e atualiza o job no Supabase, ou o backend consulta status depois.
6. GPT consulta `GET /github/jobs/{jobId}` para responder ao usuario.

Use esse bridge para deploy, smoke tests, validacoes e rotinas pesadas. Nao use GitHub Actions como substituto de login Moodle nem como caminho sincrono para consulta simples.

## Prompt base para o agente

Use este comportamento como instrucao de sistema do GPT ou como prompt server-side do `agent-chat`:

```text
Voce e o agente Moodle Consultas, inspirado na Claris IA.
Atenda gestores, coordenadores, tutores, professores e monitores com base em dados reais do Moodle e dados operacionais autorizados.

Objetivos:
1. Consultar dados reais antes de responder quando a pergunta depender do Moodle.
2. Resumir contexto academico de forma objetiva.
3. Identificar riscos, pendencias e proximos passos.
4. Criar tarefas e agenda quando permitido.
5. Preparar mensagens como rascunho quando permitido, sem prometer envio pelo Moodle.
6. Exigir confirmacao explicita para qualquer envio autorizado, exclusao, alteracao institucional ou escrita no Moodle.

Regras:
- Nao invente notas, datas, acessos, entregas, alunos, cursos ou confirmacoes.
- Nao assuma usuario Moodle logado; com token fixo, consulte sempre por curso, aluno ou relatorio explicitamente identificado.
- Quando os dados forem inferidos, explique o criterio usado.
- Quando houver ambiguidade de aluno ou curso, consulte e peca confirmacao.
- Nunca exponha tokens, API keys, service role keys ou segredos.
- Para mensagens, sempre use prepare; so use confirm se existir endpoint/canal autorizado e job_id confirmado.
- Para listas extensas, mostre resumo e ofereca filtros.
- Responda em portugues do Brasil.
```

## Fluxo de uso para GPT Actions

### Consulta simples

1. Usuario pergunta por curso, aluno, notas, acesso ou pendencia.
2. GPT chama endpoint read-only do OpenAPI.
3. GPT resume dados, limita PII e informa limitacoes.

### Acao com baixo risco

Exemplo: criar tarefa interna.

1. GPT identifica contexto.
2. Backend valida API key e scope `tasks.write`.
3. Backend cria registro.
4. Backend grava auditoria.
5. GPT confirma o que foi criado.

### Acao sensivel

Exemplo: enviar mensagem.

No estado atual com token fixo, o fluxo deve parar no rascunho:

1. GPT chama `prepare_*`.
2. Backend cria job `draft` ou `pending_confirmation` e retorna `job_id`, previa e destinatarios.
3. GPT informa que o envio pelo Moodle nao esta habilitado nesse modelo.
4. Usuario pode copiar/aprovar internamente o texto, mas a Action nao chama `confirm_*`.

Quando houver login Moodle por usuario ou canal autorizado:

1. GPT chama `prepare_*`.
2. Backend cria job `pending_confirmation` e retorna `job_id`, previa e destinatarios.
3. GPT pede confirmacao explicita.
4. Usuario confirma citando ou clicando no `job_id`.
5. GPT chama `confirm_*`.
6. Backend valida confirmacao, executa envio, atualiza status e audita.

## OpenAPI: novas operacoes recomendadas

Mantenha os operationIds estaveis. Exemplo inicial:

```yaml
/agent-chat:
  post:
    operationId: agentChat
    summary: Conversar com o agente Moodle Consultas
    security:
      - bearerAuth: []
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required: [message]
            properties:
              message:
                type: string
              history:
                type: array
                items:
                  type: object
                  properties:
                    role:
                      type: string
                      enum: [user, assistant]
                    content:
                      type: string
              context:
                type: object
                additionalProperties: true
    responses:
      "200":
        description: Resposta do agente
```

Endpoints diretos uteis:

| OperationId | Metodo/rota | Scope |
| --- | --- | --- |
| `createTask` | `POST /tasks` | `tasks.write` |
| `listTasks` | `GET /tasks` | `tasks.write` |
| `updateTask` | `PATCH /tasks/{taskId}` | `tasks.write` |
| `createEvent` | `POST /events` | `agenda.write` |
| `listEvents` | `GET /events` | `agenda.write` |
| `prepareMessageSend` | `POST /messages/prepare` | `messages.prepare` |
| `confirmMessageSend` | `POST /messages/{jobId}/confirm` | `messages.send` condicional; nao habilitar sem canal autorizado |
| `cancelMessageSend` | `POST /messages/{jobId}/cancel` | `messages.prepare` |
| `getAgentAudit` | `GET /audit/actions` | `admin.manage` |
| `createGithubJob` | `POST /github/jobs` | `github.dispatch` |
| `getGithubJob` | `GET /github/jobs/{jobId}` | `github.dispatch` |

## GitHub Actions recomendadas

Crie `.github/workflows/` no `moodle-consultas` com:

| Workflow | Gatilho | Funcao |
| --- | --- | --- |
| `ci.yml` | `push`, `pull_request`, `workflow_dispatch` | Validar OpenAPI, checar Deno/TypeScript e formatacao. |
| `supabase-deploy.yml` | `workflow_dispatch`, push na `main` | Deploy de Edge Functions e migrations. |
| `edge-smoke.yml` | push em `supabase/**` e OpenAPI | Smoke test de `/health` e endpoints principais. |
| `scheduled-jobs.yml` | cron | Processar jobs agendados, se mensagens/sugestoes forem implementadas. |
| `openapi-check.yml` | push em `openapi/**` | Validar schema importavel no GPT Actions. |

Secrets esperados:

| Secret | Uso |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Deploy Supabase CLI. |
| `SUPABASE_PROJECT_ID` | Project ref do Supabase. |
| `SUPABASE_DB_PASSWORD` | Push de migrations. |
| `MOODLE_BASE_URL` | URL base do Moodle no backend. |
| `MOODLE_TOKEN` | Token Moodle server-side. |
| `AGENT_LLM_API_KEY` | Chave do provedor LLM, se `agent-chat` for server-side. |
| `AGENT_LLM_BASE_URL` | Base URL OpenAI-compatible. |
| `AGENT_LLM_MODEL` | Modelo usado pelo agente. |
| `JOB_CRON_SECRET` | Autorizacao de workflows cron que chamam Edge Functions. |
| `GITHUB_DISPATCH_TOKEN` ou GitHub App secrets | Somente se uma Edge Function for disparar workflows por `workflow_dispatch`/`repository_dispatch`. |

Nao coloque `MOODLE_TOKEN`, tokens por usuario ou secrets GitHub no schema OpenAPI, no prompt do GPT ou em parametros de workflow visiveis em logs. O workflow deve receber apenas identificadores de job e buscar o payload autorizado no Supabase quando necessario.

## Ordem de implementacao recomendada

1. Manter o proxy read-only atual e documentar que ele e a camada de consulta.
2. Adicionar CI simples para validar OpenAPI e functions.
3. Adicionar scopes em `api_keys`.
4. Criar `agent_action_audit`.
5. Criar `agent-chat` com um conjunto inicial de tools read-only:
   - cursos;
   - alunos;
   - notas;
   - pendencias;
   - relatorios.
6. Adicionar tarefas internas (`tasks`) com create/list/update/status.
7. Adicionar agenda interna (`calendar_events`).
8. Adicionar `prepare`/rascunho para mensagens, sem envio pelo Moodle.
9. Se necessario, adicionar `moodle_user_links` para mapear API key a usuario Moodle de forma administrativa.
10. Se realmente necessario, desenhar login Moodle por proxy fora do chat e com token cifrado por usuario.
11. Adicionar bridge para GitHub Actions apenas para jobs assincronos.
12. Somente depois adicionar confirmacao de envio, correcao IA, WhatsApp ou escritas no Moodle.
13. Criar smoke tests para cada nova capacidade.

## Criterios de pronto

Uma habilidade so deve ser considerada pronta quando:

- tem endpoint ou tool documentada no OpenAPI;
- valida API key e scope;
- nao expoe segredo;
- tem payload validado;
- registra auditoria quando houver efeito colateral;
- retorna erro estruturado;
- tem instrucao clara para o GPT;
- tem pelo menos um smoke test manual ou automatizado;
- possui regra de confirmacao quando impacta terceiros ou Moodle.

## Instrucao curta para colar no GPT

```text
Use a Action Moodle Consultas para dados atuais do Moodle.
Consulte antes de responder quando a pergunta depender de cursos, alunos, notas, atividades, entregas, acessos ou relatorios.
Nao invente dados ausentes.
Este GPT pode consultar e resumir usando um token tecnico do Moodle; nao assuma usuario Moodle logado.
Acoes com escrita so podem ocorrer quando houver endpoint especifico, permissao, auditoria, canal autorizado e confirmacao explicita.
Para mensagens, use prepare como rascunho; so use confirm com job_id se o backend informar que envio esta habilitado.
Responda em portugues do Brasil, com resumo, dados encontrados, interpretacao, limitacoes e proxima consulta sugerida quando util.
```
