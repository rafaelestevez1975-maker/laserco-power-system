// Modelos de contrato  paridade com o legado (CONTRATOS / CONTRATO_TXT / termosClube).
// Namespeado para o módulo de contratos. NÃO altera libs compartilhadas.

/** Opções do select "Quando o contrato é emitido" (view-contrato-editor do legado). */
export const QUANDO_EMITIDO = [
  'Planos de Assinatura',
  'Assinaturas',
  'Créditos em Dinheiro, Pacotes, Serviços',
  'Pacotes',
  'Serviços',
] as const
export type QuandoEmitido = (typeof QUANDO_EMITIDO)[number]

/** Extensões aceitas no anexo do modelo (legado: accept ".pdf,.doc,.docx"). */
export const ARQ_ACCEPT = '.pdf,.doc,.docx'
export const ARQ_MIME_OK = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export type ContratoRow = {
  id: string
  nome: string | null
  quando_emitido: string | null
  enviar_email: boolean | null
  todas_unidades: boolean | null
  titulo: string | null
  termos: string | null
  arquivo_nome: string | null
  arquivo_path: string | null
  ativo: boolean | null
}

// ─── Planos (CONTRATO_TXT do legado) ────────────────────────────────────────
export const PLANO_BRONZE =
  'Plano Bronze: DEPILAÇÃO - R$ 99,90 mensais: 10 sessões virilha + 10 sessões perianal + 10 axila + 2 sessões BB Glow + 2 sessões de Black Peel + 4 sessões Lip Glow – total de 38 sessões de laser disponibilizadas por ano.'
export const PLANO_PRATA =
  'Plano Prata: REJUVENESCIMENTO FACIAL - R$ 149,90 mensais: 4 sessões Reju Facial + 4 Black Peel + 4 Lip Glow + 1 Ultrassom Fox Eyes – total de 12 sessões de laser e 1 de ultrassom disponibilizadas por ano.'
export const PLANO_OURO =
  'Plano Ouro: LASER COM PDRN - R$ 199,90 mensais: 3 sessões PDRN com laser + 4 BB Glow + 4 Lip Glow + 1 Ultrassom Fox Eyes – total de 11 sessões de laser e 1 de ultrassom disponibilizadas por ano.'

/** Termos do contrato Laser&Club (legado: termosClube(plano, semAdesao)). */
export function termosClube(plano: string, semAdesao: boolean): string {
  return `CLÁUSULA 1ª – OBJETO DE CONTRATAÇÃO: Por meio do presente contrato, fica ajustada a adesão da CONTRATANTE ao denominado "LASER&CLUB", que vem a ser um clube de Assinatura de Serviços de Laser e Ultrassom, com vantagens exclusivas para clientes da rede LASER COMPANY.

Parágrafo Primeiro: a CONTRATANTE irá aderir ao seguinte plano de assinatura:
${plano}

Parágrafo Segundo: Ao aderir a qualquer plano, será pago uma TAXA DE ADESÃO de R$ 199,90 que dará direito a um serviço dentre os relacionados abaixo, ou R$ 500,00 em descontos em qualquer serviço ou pacote na rede Laser Company (o desconto deve corresponder a no máximo 70% sobre o valor do pacote ou serviço adquirido):
a) Uma sessão de Laser BB Glow;
b) Uma sessão de laser para Rejuvenescimento de Mãos;
c) Uma sessão de laser para Clareamento de Virilha ou Axila;

Parágrafo Terceiro: A isenção no pagamento da taxa de adesão, ou a redução do seu montante, faz com que a CONTRATANTE perca o direito à sessão cortesia acima relacionada.

Parágrafo Quarto: Independente do plano aderido, a CONTRATANTE terá direito a:
a) Realizar um dos procedimentos listados no parágrafo segundo sem custo adicional, desde que pague integralmente a taxa de adesão;
b) Receber um cartão personalizado LASER&CLUB;
c) Durante a validade do plano, realizar as aplicações dos pacotes de serviços a laser contratados, sem custos adicionais;
d) Obter 10% de desconto em qualquer outro serviço, não cumulativo a qualquer outra promoção.

CLÁUSULA 2ª – DO PREÇO: Ao aderir ao LASER&CLUB, a CONTRATANTE pagará:
${semAdesao ? 'a) A taxa de adesão de R$ 199,90, à qual a CONTRATANTE fica isenta de pagamento;' : 'a) A taxa de adesão de R$ 199,90 (cento e noventa e nove reais e noventa centavos);'}
b) 12 parcelas mensais e sucessivas conforme plano escolhido, sendo a primeira debitada no ato da contratação.

Parágrafo primeiro: É facultado à CONTRATANTE migrar de plano a cada período de 12 meses, comunicando à unidade com 30 dias de antecedência, sem necessidade de nova taxa de adesão.
Parágrafo Segundo: Os pagamentos das mensalidades ocorrerão na modalidade de crédito recorrente, durante o prazo de vigência da cláusula 7ª, renovado sucessivamente caso não exista oposição das partes.
Parágrafo Terceiro: Ao renovar o plano, serão creditadas novamente as sessões anuais, somando-se às remanescentes (toda sessão creditada expira em dois anos).
Parágrafo Quarto: A CONTRATADA reserva-se o direito de promover anualmente o reajuste da mensalidade, mediante prévio aviso e sujeito à aprovação da CONTRATANTE.
Parágrafo Quinto: A não aprovação do reajuste permite que a CONTRATANTE se exclua do clube, sem penalidade, desde que adimplida até a data da rescisão.

CLÁUSULA 3ª – DAS OBRIGAÇÕES DA CONTRATANTE: A CONTRATANTE obriga-se a:
a. Realizar os serviços apenas na unidade em que contratou;
b. Respeitar os intervalos recomendados entre os procedimentos;
c. Seguir rigorosamente o protocolo orientado pelos profissionais, inclusive pós-aplicação;
d. Informar sobre uso de medicamentos, tratamentos ou condições de saúde;
e. Agendar as sessões conforme disponibilidade da unidade;
f. Efetuar pontualmente o pagamento, sob pena de suspensão imediata dos serviços.

CLÁUSULA 4ª – DAS OBRIGAÇÕES DA CONTRATADA: A CONTRATADA compromete-se a:
a) Prestar os serviços por meio de profissionais qualificados, com os melhores produtos disponíveis;
b) Utilizar os equipamentos necessários aos planos contratados;
c) Dar suporte em caso de dúvidas, pós-sessão ou eventual intercorrência.

CLÁUSULA 5ª – PRAZO ENTRE AS SESSÕES: A CONTRATANTE está ciente de que as sessões devem ser aplicadas ao longo de 12 meses, conforme os intervalos indicados para cada laser, importantes para a recuperação da pele e melhores resultados.
Parágrafo Único: Cada tipo de laser pode ter um intervalo específico, podendo alguns ser aplicados de forma conjunta e outros em sessões intervaladas.

CLÁUSULA 6ª – DA INADIMPLÊNCIA: Em caso de inadimplência, a CONTRATANTE ficará impossibilitada de realizar as sessões ou usufruir benefícios até regularizar a situação.
Parágrafo Único: O atraso por mais de 60 dias importa em rescisão imediata, com obrigação de pagar 2 mensalidades, nos termos da cláusula de rescisão.

CLÁUSULA 7ª – DA VIGÊNCIA, RENOVAÇÃO, RESCISÃO, SUSPENSÃO OU DESISTÊNCIA: O contrato vigorará por 12 meses a contar dos pagamentos da cláusula 2ª, renovado automaticamente caso não haja manifestação contrária com 30 dias de antecedência.
Parágrafo Primeiro: A cada renovação, os pacotes de serviços contratados serão novamente acrescidos.
Parágrafo Segundo: A não utilização de algum serviço não gera reembolso ou desconto na mensalidade, nem pode ser transferido a terceiros.
Parágrafo Terceiro: Em caso de resilição antecipada pela CONTRATANTE, ainda que imotivada, deverá comunicar com 30 dias de antecedência, por escrito, e pagar multa de 2 mensalidades.
Parágrafo Quarto: Sendo a rescisão de interesse da CONTRATADA, após 12 meses, deverá comunicar com 30 dias de antecedência.
Parágrafo Quinto: Ocorrendo desistência sem que tenha sido realizado qualquer serviço, o contrato é rescindido sem cobrança de rescisão, não restituída a adesão.
Parágrafo Sexto: Restituições ocorrem por transferência bancária de titularidade da CONTRATANTE, em até 30 dias da rescisão.
Parágrafo Sétimo: O contrato poderá ser SUSPENSO a pedido da CONTRATANTE por gravidez ou doença, retomando o plano sem taxa.
Parágrafo Oitavo: As sessões são disponibilizadas durante a vigência; a não utilização não gera restituição ou crédito na renovação.

CLÁUSULA 8ª – DA PESSOALIDADE: O contrato é pessoal e intransferível; os procedimentos não podem ser utilizados por terceiros, pois as aplicações e fotos ficam cadastradas na ficha da CONTRATANTE.

CLÁUSULA 9ª – DA LEI GERAL DE PROTEÇÃO DE DADOS (LGPD): A CONTRATADA declara-se ciente dos direitos e obrigações da Lei 13.709/2018 e compromete-se a adotar medidas razoáveis de proteção dos dados.
Parágrafo Único: A CONTRATADA mantém o zelo dos dados do cliente, compartilhando apenas nas hipóteses permitidas em lei e com instituições bancárias para processamento da venda, não repassando informações a terceiros fora dessas condições.

CLÁUSULA 10ª – CUIDADOS E RESULTADOS ADVERSOS: A CONTRATANTE está ciente de que:
(i) após a aplicação pode ocorrer irritação e ardência por algumas horas;
(ii) a pele pode apresentar coloração rosada/avermelhada por algumas horas;
(iii) uso de ácido na região exige suspensão de 3 a 7 dias antes e depois;
(iv) deve-se evitar bronzeamento excessivo de 3 a 15 dias antes e depois (pele íntegra);
(v) eventual "casquinha" não deve ser arrancada;
(vi) não realizar tratamento se estiver grávida, informando imediatamente;
(vii) informar qualquer medicamento em uso;
(viii) em situações raras podem surgir queimaduras, vermelhidões ou manchas transitórias.
Parágrafo Primeiro: A CONTRATANTE foi previamente avaliada por profissional da LASER&CO, definindo-se os lasers/ultrassons e as regiões, conforme ficha de avaliação.
Parágrafo Segundo: Em caso de qualquer sintoma anormal, contatar IMEDIATAMENTE a unidade, que conta com Responsável Técnica (RT).

CLÁUSULA 11ª – DO CLUBE DE FIDELIDADE: Por tratar-se de assinatura recorrente, o valor pago não soma pontos no clube de fidelidade da rede.

CLÁUSULA 12ª – DAS DISPOSIÇÕES GERAIS: A CONTRATANTE declara ter lido, compreendido e aceitado todas as cláusulas, advertências e cuidados. Não havendo observância às recomendações, a CONTRATADA não poderá ser responsabilizada por eventuais danos.
As partes elegem o Foro Central da Comarca onde realizados os serviços, com renúncia de qualquer outro.
Por estarem assim justos e de acordo, firmam o presente instrumento, de igual teor.`
}

/** Termos do contrato de prestação de serviços (legado: CONTRATO_TXT['prestacao']). */
export const TERMOS_PRESTACAO = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS – LASER&CO

CLÁUSULA PRIMEIRA – OBRIGAÇÕES DO CONTRATANTE
1.1. São obrigações da CONTRATANTE:
a. Agendar as sessões previamente para garantir disponibilidade de horário;
b. Comparecer às sessões com 15 minutos de antecedência, para preparação e evitar atrasos;
c. Cumprir o intervalo mínimo entre as sessões, que varia conforme o tratamento, segundo orientação profissional;
d. Seguir rigorosamente o protocolo orientado pelos profissionais da LASER&CO, inclusive o pré e pós sessão;
e. Efetuar pontualmente o pagamento, sob pena de suspensão imediata dos serviços.
1.2. A LASER&CO não se responsabiliza pela falta ou diminuição de resultado caso o CONTRATANTE não observe os cuidados pré e pós sessão.

CLÁUSULA SEGUNDA – OBRIGAÇÕES DA CONTRATADA
2.1. São obrigações da CONTRATADA:
a. Prestar os serviços por meio de profissionais qualificados, visando o melhor resultado;
b. Disponibilizar, quando aplicável, sessões bonificadas da mesma natureza do serviço adquirido;
c. Bonificar a CONTRATANTE com um ponto para cada real gasto no sistema de pontuação da rede;
d. Orientar sobre os melhores serviços a laser e ultrassom, intervalos, benefícios e resultados esperados;
e. Orientar sobre os cuidados pré e pós sessão para melhores resultados e menor risco de intercorrência.

CLÁUSULA TERCEIRA – DAS SESSÕES E INTERVALOS
3.1. É obrigação da CONTRATANTE agendar suas sessões dentro dos intervalos recomendados; recomenda-se marcar a sessão seguinte ao realizar uma sessão.
3.2. O intervalo entre as sessões a laser pode variar de 7 a 60 dias, conforme o tratamento.
3.3. Os prazos entre sessões são informados em loja, no website e no App da rede.
3.4. Os agendamentos podem ser feitos por: a) App "Laser&Co"; b) Website www.lasercompany.com; c) SAC da rede (WhatsApp); d) WhatsApp da unidade; e) Pessoalmente na unidade.
3.5. Agendar preferencialmente na unidade de contratação; não havendo horário, sessões de LASER (não ultrassom) podem ser feitas em qualquer unidade.
3.6. Os pacotes e sessões podem ser realizados em até 2 anos da contratação.

CLÁUSULA QUARTA – SISTEMA DE PONTUAÇÃO
4.1. A CONTRATANTE recebe UM PONTO por UM REAL gasto em serviços, trocáveis por outros serviços a laser. NÃO é possível trocar pontos por serviços de Ultrassom.
4.2. Cada serviço possui preço e pontuação; é preciso acumular pontos suficientes para um serviço completo, não sendo possível pagar parte em pontos e parte em dinheiro.
4.3. No Crédito Recorrente, os pontos são creditados a cada parcela paga.
4.4. A gestão de pontos é feita pelo App LASER&CO; prazo de 12 meses para uso a partir da aquisição.
4.5. A troca refere-se a UMA SESSÃO do serviço, não ao pacote completo.
4.6. Os pontos podem ser transferidos a terceiros, com anuência expressa de quem cede.

CLÁUSULA QUINTA – ATRASO E INADIMPLÊNCIA
5.1. Em caso de inadimplência, a CONTRATANTE fica impossibilitada de realizar o serviço até regularizar. O atraso importa multa de 10% sobre a parcela, juros de 1% e IGPM desde o vencimento. O não pagamento de duas parcelas consecutivas gera vencimento antecipado de todos os valores, possibilita inclusão em órgãos de restrição de crédito e, havendo cobrança judicial/extrajudicial, 20% de honorários advocatícios.

CLÁUSULA SEXTA – RESCISÃO, DESISTÊNCIA E SUSPENSÃO
6.1. A desistência/rescisão deve ser comunicada por escrito (inclusive e-mail), com preenchimento do formulário de rescisão; não se aceita pedido verbal.
6.2. A rescisão pela CONTRATANTE implica:
a) Sem nenhuma sessão realizada: multa de 20% sobre o valor contratado;
b) Uma sessão realizada: cobra-se a sessão como AVULSA (dobro do valor da sessão do pacote) e, do saldo, deduz-se multa de 20%, devolvendo-se a diferença;
c) Duas ou mais sessões: cálculo proporcional do uso, multa de 20% sobre o remanescente, devolvendo-se a diferença;
d) Reembolso de SESSÃO REALIZADA DE ULTRASSOM: multa de 20% sobre o valor pago + 50% do valor pago pelos disparos realizados; só autorizado em casos de intercorrência;
e) Compra fora do estabelecimento (link, website etc.): 7 dias para direito de arrependimento, desde que não executado nenhum serviço.
6.3. Os percentuais aplicam-se à desistência por culpa/vontade da CONTRATANTE, não em caso de intercorrência (não sendo intercorrência "falta de resultado").
6.4. No financiamento, a rescisão acresce 15% sobre os valores devidos por despesas bancárias; a restituição diz respeito ao principal, não a juros/encargos do banco.
6.5. Com a rescisão, a CONTRATANTE perde as sessões bonificadas, gratuidades e a pontuação do clube de fidelidade.
6.6. Em suspensão por questões médicas ou gravidez, a CONTRATANTE paga a totalidade contratada e a LASER&CO entrega a totalidade dos serviços quando houver disponibilidade física.
6.7. Em rescisão/desistência, a LASER&CO tem até 45 dias úteis para creditar os valores em conta de titularidade da CONTRATANTE.

CLÁUSULA SÉTIMA – PESSOALIDADE
7.1. O contrato é pessoal e intransferível; os procedimentos não podem ser usados por terceiros, pois cada sessão é registrada fotograficamente.
7.2. A cada sessão, a CONTRATANTE assina digitalmente um TERMO DE REALIZAÇÃO DE SESSÃO, atestando a realização e a manutenção das condições de saúde declaradas na Anamnese Digital.
7.3. Em caráter excepcional, impossibilitada de realizar as sessões, a CONTRATANTE PODERÁ TRANSFERIR seus pacotes a terceiro que indicar.

CLÁUSULA OITAVA – USO DA IMAGEM
8.1. Serão feitas imagens dos serviços (antes e depois) que ficarão EXCLUSIVAMENTE no sistema, para constatação e eficácia dos tratamentos.
8.2. As imagens só podem ser acessadas pelas profissionais de saúde.
8.3. Nenhuma imagem será utilizada pela LASER&CO sem autorização expressa na Anamnese Digital.

CLÁUSULA NONA – LEI GERAL DE PROTEÇÃO DE DADOS (LGPD)
9.1. A LASER&CO declara-se ciente da Lei 13.709/2018 e adota medidas razoáveis de proteção dos dados.
9.2. Os dados da CONTRATANTE serão usados para comunicações (e-mail, SMS, WhatsApp), agendamentos, recuperação de senha, execução e controle do procedimento e auditoria, para o bom cumprimento do contrato.

CLÁUSULA DÉCIMA – CUIDADOS E RESULTADOS ADVERSOS
10.1. A CONTRATANTE está ciente de que:
(i) após a aplicação pode ocorrer irritação e ardência por algumas horas;
(ii) a pele pode apresentar coloração rosada/avermelhada por algumas horas;
(iii) uso de ácido na região exige suspensão de 3 a 7 dias antes e depois;
(iv) evitar bronzeamento excessivo de 3 a 15 dias antes e depois (pele íntegra);
(v) eventual "casquinha" não deve ser arrancada;
(vi) não realizar tratamento se estiver grávida, informando imediatamente;
(vii) informar qualquer medicamento em uso;
(viii) em situações raras podem surgir queimaduras, vermelhidões ou manchas transitórias. A CONTRATANTE declara ter sido previamente avaliada por profissional da LASER&CO, conforme ficha de avaliação.
10.2. Em caso de sintoma anormal, contatar IMEDIATAMENTE a unidade, que conta com Responsável Técnica (RT).

CLÁUSULA DÉCIMA PRIMEIRA – CONDIÇÕES FINAIS
11.1. Na depilação a laser, a venda é de 5 sessões, sendo creditadas mais 5 sessões sem custo, se necessário, intransferíveis e não reembolsáveis se não utilizadas.
11.2. Os resultados dependem de cuidados com a pele, idade, flacidez, exposição a fatores externos e questões fisiológicas, podendo variar conforme o organismo de cada cliente.
11.3. Os pacotes sugeridos atendem a uma média do público; em alguns casos pode ser necessária a contratação de mais de um pacote.
11.4. Os serviços a laser são vendidos em PACOTES, pois é necessária uma quantidade mínima de sessões para o resultado esperado.`

/**
 * Texto padrão dos termos quando o modelo ainda não tem termos próprios salvos.
 * Tenta inferir o template a partir do nome do modelo (legado: openContratoEditor
 * preenche o textarea com CONTRATO_TXT[cid] ou com a nota de "não importado").
 */
export function termosPadraoPorNome(nome: string | null | undefined): string {
  const n = (nome || '').toLowerCase()
  const sa = /sem ades/.test(n)
  if (/bronze/.test(n)) return termosClube(PLANO_BRONZE, sa)
  if (/prata/.test(n)) return termosClube(PLANO_PRATA, sa)
  if (/ouro/.test(n)) return termosClube(PLANO_OURO, sa)
  if (/presta/.test(n)) return TERMOS_PRESTACAO
  return ''
}
