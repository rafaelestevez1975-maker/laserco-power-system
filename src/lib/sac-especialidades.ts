/**
 * Assuntos que uma atendente do SAC pode ter como especialidade (Reestruturação do SAC).
 * Espelha os motivos que a IA classifica em resolverMotivoSac (sac-ingest). Fica AQUI (módulo
 * comum, não 'use server') porque arquivos 'use server' só podem exportar funções async — uma
 * const exportada de lá vira undefined no cliente e quebra o componente.
 */
export const SAC_ESPECIALIDADES = [
  'Cancelamento', 'Transferência de Pacotes', 'Encerramento da unidade', 'Sessões Expiradas',
  'Ausência de resultados', 'Intercorrência', 'Máquina Quebrada', 'Falha operacional',
  'Laser Club', 'Agendamento (site)', 'Promoção do site', 'Cortesia/Brinde', 'Avaliação gratuita',
  'Financeiro', 'Outros',
] as const
