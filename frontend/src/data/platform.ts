export type ServiceStatus = 'active' | 'inactive' | 'coming_soon';

export type ServiceCard = {
  name: string;
  slug: string;
  description: string;
  status: ServiceStatus;
  tags: string[];
};

export const platformName = 'GPT Actions Hub';

export const publicHeroStats = [
  { label: 'API própria', value: '1 chave por conta' },
  { label: 'Conectores', value: 'Moodle hoje, outros em breve' },
  { label: 'Fluxo', value: 'Cadastre, ative, copie e use' },
];

export const onboardingSteps = [
  'Cadastre-se na plataforma e crie sua conta.',
  'Ative o serviço desejado e gere sua chave de API.',
  'Copie o YAML e adicione como Action no seu GPT.',
];

export const trustPoints = [
  'Cada usuário recebe uma chave própria para sua conta.',
  'Os conectores podem ser ativados individualmente.',
  'O produto começa com Moodle e cresce para novos serviços.',
];

export const dashboardStats = [
  { label: 'Serviços ativos', value: '1' },
  { label: 'Chave de API', value: 'Criada' },
  { label: 'Schemas disponíveis', value: '1' },
  { label: 'Último acesso', value: 'Hoje, 14:30' },
];

export const services: ServiceCard[] = [
  {
    name: 'Moodle',
    slug: 'moodle',
    description: 'Consulte cursos, alunos, atividades e informações acadêmicas via Actions em GPTs personalizados.',
    status: 'active',
    tags: ['MVP', 'Read-only', 'Pronto para uso'],
  },
  {
    name: 'Google Drive',
    slug: 'google-drive',
    description: 'Acesso futuro a arquivos, pastas e documentos privados com controle por serviço.',
    status: 'coming_soon',
    tags: ['Em breve'],
  },
  {
    name: 'Planilhas',
    slug: 'spreadsheets',
    description: 'Leitura e composição de dados estruturados em planilhas conectadas.',
    status: 'coming_soon',
    tags: ['Em breve'],
  },
];

export const helpTopics = [
  {
    title: 'Como adicionar uma Action ao seu GPT',
    items: [
      'Acesse o criador de GPTs personalizados.',
      'Vá até a seção Actions e clique em Create new action.',
      'Cole o YAML fornecido pela plataforma.',
      'Configure a autenticação com sua chave de API.',
      'Salve e teste a Action.',
    ],
  },
  {
    title: 'Como usar a chave de API',
    items: [
      'Envie a chave no header Authorization.',
      'Formato conceitual: Bearer SUA_CHAVE_DE_API.',
      'Não compartilhe a chave publicamente.',
    ],
  },
];

export const helpProblems = [
  'Chave inválida.',
  'Serviço não ativado.',
  'YAML colado incorretamente.',
  'Endpoint indisponível.',
  'Permissão insuficiente.',
];

export const apiKeyPreview = 'sk_live_••••••••••••••••••••9f3a';

export const yamlSourceUrl = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/schemas/moodle.yaml`;
