# Politica de Privacidade - Moodle Consultas

Ultima atualizacao: 14 de maio de 2026

> Este documento e um modelo operacional para o projeto `moodle-consultas` e deve ser revisado pelo responsavel juridico ou pelo encarregado de dados antes da publicacao oficial.

## 1. Quem somos

O `moodle-consultas` e uma API de consulta, em modo somente leitura, que permite a usuarios autorizados consultar informacoes academicas do Moodle por meio de GPT Actions. O projeto utiliza Supabase Edge Functions como proxy entre o ChatGPT Action e os Web Services do Moodle.

Controlador dos dados: **[preencher com a instituicao responsavel]**

CNPJ: **[preencher]**

Contato para privacidade e protecao de dados: **[preencher e-mail/canal oficial]**

Encarregado pelo tratamento de dados pessoais, quando aplicavel: **[preencher nome ou canal do DPO/Encarregado]**

## 2. Abrangencia desta politica

Esta Politica de Privacidade explica como o projeto `moodle-consultas` trata dados pessoais nos seguintes componentes:

- cadastro e login da plataforma via Supabase Auth;
- Edge Function `platform-api`, responsavel pelo painel, ativacao de servicos e emissao de chave;
- Edge Function `moodle-proxy`, responsavel por validar a chave de API e consultar o Moodle;
- schema OpenAPI usado para configurar GPT Actions.

Esta politica nao substitui a politica de privacidade do Moodle, do ChatGPT/OpenAI, do Supabase, do GitHub Pages ou de outros servicos de infraestrutura. Cada provedor pode realizar tratamentos proprios conforme seus respectivos termos e politicas.

## 3. Dados pessoais que podemos tratar

### 3.1 Dados de cadastro para obtencao da chave de API

Quando um usuario cria conta e solicita uma chave de API, tratamos:

- nome completo;
- e-mail;
- hash da chave de API gerada para autenticacao;
- preview parcial da chave de API;
- status da chave, como ativa ou inativa;
- data e hora de criacao do cadastro.

### 3.2 Dados tecnicos de autenticacao e uso

Durante o uso da API, podemos tratar:

- chave de API enviada como Bearer token, validada por hash;
- data e hora das requisicoes;
- rota consultada e parametros informados, como IDs de curso, IDs de usuario, e-mails, usernames, idnumbers ou termos de busca;
- mensagens de erro e metadados tecnicos necessarios para seguranca, diagnostico e operacao;
- informacoes tecnicas eventualmente registradas pelos provedores de infraestrutura, como endereco IP, user agent e logs de acesso.

### 3.3 Dados academicos consultados no Moodle

O proxy pode retornar dados disponiveis no Moodle conforme as permissoes da sessao Moodle ativa do usuario que ativou o servico. Dependendo da rota consultada e das permissoes existentes, esses dados podem incluir:

- dados de cursos, turmas, secoes, conteudos e atividades;
- dados de participantes ou alunos, como ID Moodle, username, nome, sobrenome, nome completo, e-mail, idnumber, papeis no curso e datas de primeiro ou ultimo acesso;
- cursos vinculados a um aluno ou usuario;
- notas, itens de nota, progresso e status de conclusao;
- entregas, submissoes, prazos, status de correcao e relatorios de pendencias;
- dados retornados por relatorios configuraveis do Moodle, quando autorizados.

O `moodle-consultas` foi desenhado como proxy somente leitura. Ele nao deve criar, alterar ou excluir usuarios, cursos, matriculas, notas, mensagens ou atividades no Moodle.

## 4. Finalidades do tratamento

Tratamos dados pessoais para:

- cadastrar usuarios autorizados e gerar chave de API;
- autenticar requisicoes feitas ao proxy;
- permitir consultas academicas autorizadas ao Moodle;
- apoiar analises institucionais sobre cursos, alunos, notas, conclusao, acessos e pendencias;
- proteger o ambiente contra uso indevido, acessos nao autorizados e exposicao de segredos;
- diagnosticar erros, monitorar disponibilidade e manter a seguranca da API;
- cumprir obrigacoes legais, regulatorias, contratuais ou institucionais aplicaveis.

## 5. Bases legais

As bases legais aplicaveis devem ser definidas pelo controlador conforme o contexto institucional e a finalidade de cada tratamento. Em geral, o projeto pode envolver:

- execucao de contrato ou de procedimentos relacionados ao vinculo educacional ou institucional;
- cumprimento de obrigacao legal ou regulatoria;
- execucao de politicas publicas, quando aplicavel a instituicao;
- exercicio regular de direitos em processo judicial, administrativo ou arbitral;
- legitimo interesse do controlador ou de terceiro, respeitados os direitos e liberdades fundamentais dos titulares;
- consentimento, quando a instituicao optar por usa-lo em fluxos especificos e quando ele for adequado.

Dados pessoais sensiveis, se eventualmente retornados por relatorios do Moodle, devem ser tratados apenas quando houver base legal especifica e necessidade comprovada.

## 6. Compartilhamento de dados

Os dados podem ser compartilhados ou acessados nos seguintes contextos:

- com o Moodle institucional, que e a fonte primaria dos dados academicos;
- com o Supabase, usado para hospedar Edge Functions, armazenar chaves de API e operar o proxy;
- com o GitHub Pages, quando utilizado para hospedar a pagina estatica de cadastro;
- com o ChatGPT/OpenAI, quando o usuario configurar e utilizar GPT Actions para consultar a API;
- com equipes internas autorizadas, como tecnologia, gestao academica, coordenacao, tutoria, seguranca da informacao, auditoria ou suporte;
- com autoridades publicas, quando houver obrigacao legal ou ordem valida.

Tokens Moodle cifrados, a service role key do Supabase, o segredo de hash das API keys e outros segredos operacionais nao devem ser expostos no schema OpenAPI, no frontend, em respostas da API, em prompts ou em logs publicos.

## 7. Armazenamento e retencao

Os dados da chave de API sao armazenados no Supabase, na tabela `api_keys`, enquanto forem necessarios para autenticar o usuario, manter auditoria operacional, cumprir obrigacoes aplicaveis ou preservar a seguranca do servico. A chave completa nao e persistida.

Os dados academicos consultados no Moodle sao retornados sob demanda pelo proxy. O projeto, no estado atual, nao foi desenhado para manter uma copia propria permanente desses dados academicos fora do Moodle, salvo registros tecnicos, logs de infraestrutura ou futuras funcionalidades explicitamente documentadas.

Quando uma chave de API deixar de ser necessaria, ela podera ser desativada ou excluida conforme os procedimentos internos do controlador e as obrigacoes de retencao aplicaveis.

## 8. Seguranca

Adotamos medidas tecnicas e organizacionais proporcionais ao risco, incluindo:

- autenticacao por chave de API enviada como Bearer token;
- validacao da chave ativa no Supabase antes das consultas protegidas;
- armazenamento de tokens Moodle cifrados e chaves de servico como secrets de backend;
- limitacao das funcoes Moodle permitidas a operacoes de leitura;
- uso de RLS na tabela de chaves de API, com acesso operacional via service role nas Edge Functions;
- controle de permissoes conforme a sessao Moodle ativa do usuario;
- recomendacao de nao inserir senhas, tokens ou segredos em conversas, prompts, arquivos OpenAPI ou parametros visiveis.

Nenhum sistema e completamente imune a riscos. Em caso de incidente de seguranca que possa gerar risco ou dano relevante aos titulares, o controlador devera avaliar as medidas cabiveis, inclusive comunicacoes aos titulares e a Autoridade Nacional de Protecao de Dados, quando exigido.

## 9. Direitos dos titulares

Nos termos da LGPD, os titulares podem solicitar, conforme aplicavel:

- confirmacao da existencia de tratamento;
- acesso aos dados pessoais;
- correcao de dados incompletos, inexatos ou desatualizados;
- anonimizacao, bloqueio ou eliminacao de dados desnecessarios, excessivos ou tratados em desconformidade;
- portabilidade, quando regulamentada e aplicavel;
- informacoes sobre compartilhamento de dados;
- informacoes sobre a possibilidade de nao fornecer consentimento e suas consequencias, quando o tratamento depender de consentimento;
- revogacao do consentimento, quando esta for a base legal utilizada;
- revisao de decisoes tomadas unicamente com base em tratamento automatizado que afetem seus interesses, quando houver esse tipo de decisao.

Solicitacoes devem ser encaminhadas ao canal de privacidade informado nesta politica. O atendimento podera exigir validacao de identidade e avaliacao das permissoes, obrigacoes legais, contexto academico e registros mantidos no Moodle.

## 10. Uso de GPT Actions e IA

O `moodle-consultas` permite que uma GPT Action consulte dados do Moodle por meio de endpoints autenticados. Ao usar esse recurso:

- o usuario deve consultar apenas dados necessarios para sua finalidade autorizada;
- dados pessoais nao devem ser solicitados ou exibidos alem do necessario;
- o GPT nao deve receber senhas, tokens Moodle, service role keys ou outros segredos;
- respostas geradas por IA devem ser conferidas quando forem usadas para decisoes academicas, administrativas ou institucionais relevantes;
- o proxy nao deve ser usado para prometer dados que a sessao Moodle ativa do usuario nao consiga consultar.

O uso do ChatGPT/OpenAI pode envolver tratamento de dados pela propria OpenAI conforme as configuracoes da conta, termos aplicaveis e politicas do servico utilizado.

## 11. Menores de idade e dados educacionais

Como o Moodle pode conter dados de estudantes, inclusive eventualmente menores de idade, as consultas devem respeitar as permissoes institucionais, a necessidade da finalidade educacional e as regras aplicaveis ao ambiente academico. O acesso a dados de alunos deve ser restrito a pessoas autorizadas e utilizado apenas para finalidades legitimas relacionadas a acompanhamento, gestao, suporte, avaliacao ou obrigacoes institucionais.

## 12. Transferencia internacional

Dependendo da localizacao dos provedores de infraestrutura, do ambiente Moodle, do Supabase, do GitHub Pages e do ChatGPT/OpenAI, dados pessoais podem ser tratados ou armazenados fora do Brasil. Quando houver transferencia internacional de dados, o controlador devera verificar a existencia de mecanismos juridicos adequados e medidas de seguranca compativeis com a LGPD.

## 13. Cookies e tecnologias semelhantes

A pagina estatica de cadastro do projeto nao foi desenhada para usar cookies proprios de rastreamento ou publicidade. Ainda assim, provedores de hospedagem, navegadores ou ferramentas de infraestrutura podem registrar dados tecnicos de acesso para seguranca, disponibilidade e operacao.

Caso sejam adicionadas ferramentas de analytics, pixels, cookies de terceiros ou monitoramento adicional, esta politica devera ser atualizada antes da publicacao ou ativacao desses recursos.

## 14. Responsabilidades do usuario autorizado

O usuario que recebe uma chave de API deve:

- guardar a chave em local seguro;
- nao compartilhar a chave com terceiros nao autorizados;
- usar a API apenas para finalidades institucionais autorizadas;
- consultar somente dados necessarios;
- nao exportar, copiar ou divulgar dados pessoais fora dos ambientes autorizados;
- comunicar suspeita de vazamento, perda de chave ou acesso indevido ao canal responsavel.

## 15. Alteracoes desta politica

Esta politica pode ser atualizada para refletir mudancas no projeto, nas rotas disponiveis, nos provedores utilizados, nos controles de seguranca ou nas normas aplicaveis. A data de ultima atualizacao deve ser revisada sempre que houver alteracao relevante.

## 16. Referencias legais e institucionais

- Lei Geral de Protecao de Dados Pessoais - Lei n. 13.709/2018: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- ANPD - Direitos dos titulares: https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares
- ANPD - Guia orientativo sobre agentes de tratamento e encarregado: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_agentes_de_tratamento_e_encarregado___defeso_eleitoral.pdf
