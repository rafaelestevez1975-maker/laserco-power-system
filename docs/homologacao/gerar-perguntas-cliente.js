/* ============================================================================
 *  Gerador do Questionário de Descoberta (Discovery) para o Cliente
 *  Laser&Co Power System — perguntas para viabilizar o projeto 100%
 *  ---------------------------------------------------------------------------
 *  Converte para PDF com:
 *    weasyprint perguntas-cliente.html "Perguntas-Cliente-LaserCo.pdf"
 *
 *  Cada pergunta: { q: texto, hint?: por que importa, crit?: true (crítica) }
 *  Baseado na análise do código: foca nos pontos hoje simulados/protótipo e
 *  nas decisões de integração, dados, infraestrutura e compliance.
 * ==========================================================================*/

const META = {
  sistema: 'Laser&Co Power System',
  doc: 'Questionário de Descoberta (Discovery) — Cliente',
  geradoEm: '18/06/2026',
};

const SECOES = [

{ id:1, titulo:'Visão geral, objetivo e modelo de negócio', perguntas:[
{q:'Qual é o objetivo principal do sistema e o problema que ele precisa resolver hoje que o BEMP e o SULTS não resolvem?', hint:'Define a prioridade real de tudo o que vem depois.', crit:true},
{q:'O sistema vai substituir totalmente o BEMP e o SULTS, conviver com eles ou substituir por etapas? Por quanto tempo haverá convivência?', crit:true},
{q:'Quem são os usuários finais e quantos por perfil? (franqueados, gerentes, recepção, profissionais de saúde, SAC, franqueadora, marketing, financeiro)', hint:'A base atual estima 86 usuários só de Ponto e 52 franqueados.'},
{q:'Quantas unidades existem hoje e qual a projeção de crescimento para 12–24 meses?', hint:'O protótipo traz 59 unidades ativas + 1 de treinamento.'},
{q:'O produto é exclusivo da rede Laser&Co ou será comercializado como SaaS para outras redes/franquias?', hint:'Muda decisões de multi-tenant e marca branca.', crit:true},
{q:'Existe uma data desejada de go-live e marcos intermediários (fases)?'},
{q:'Na visão do cliente, qual é a definição de "projeto 100% pronto" / critério de aceite final?', crit:true},
]},

{ id:2, titulo:'Escopo, prioridades e MVP', perguntas:[
{q:'O protótipo tem cerca de 100 pontos que hoje são apenas simulação (botões sem ação, dados de exemplo, integrações não implementadas). Quais módulos devem ser reais já na 1ª entrega?', crit:true},
{q:'Quais módulos podem ficar para uma fase 2? (ex.: Universidade Corporativa, Disco Virtual, App do Cliente, Expansão)'},
{q:'Existe uma lista priorizada de "obrigatório" x "desejável"?', crit:true},
{q:'Dos 26 relatórios listados, quais são realmente usados na rotina e precisam de dados reais e exportação?', hint:'Hoje todos os botões "Exportar" são apenas visuais.'},
{q:'O App do Cliente será um aplicativo nativo (App Store/Play), um PWA, ou não entra agora?', hint:'Hoje é só um protótipo navegável (toasts).'},
{q:'O agendamento feito pelo próprio cliente (online) faz parte do escopo?'},
]},

{ id:3, titulo:'Migração de dados e cadastros', perguntas:[
{q:'Existe base de dados atual (BEMP/SULTS) para migrar? Qual o volume? (clientes, contratos, histórico de sessões, financeiro, fidelidade)', crit:true},
{q:'Em que formato a exportação dos sistemas atuais está disponível? (Excel/CSV, API, acesso ao banco)', crit:true},
{q:'Quanto de histórico precisa ser migrado (todo o período ou apenas recente)?'},
{q:'Os cadastros das 59 unidades estão completos e atualizados? (CNPJ, endereço, inscrição municipal, e-mail, telefone, franqueado responsável)', hint:'São essenciais para NFS-e, cobrança e jurídico.'},
{q:'A migração inclui dados sensíveis (fotos clínicas, CPF, contratos assinados)? Como devem ser tratados?', crit:true},
{q:'Quem, do lado do cliente, valida a qualidade e a integridade dos dados migrados?'},
]},

{ id:4, titulo:'Backend, infraestrutura e ambientes', perguntas:[
{q:'Mantemos o Supabase como backend ou há preferência por outra plataforma? (AWS, GCP, Azure, on-premise)', hint:'Hoje usa Supabase (Postgres) com chave pública e RLS.', crit:true},
{q:'Quem é o titular/dono da conta de nuvem e das credenciais de produção?', crit:true},
{q:'Precisamos de ambientes separados de desenvolvimento, homologação e produção?'},
{q:'Qual a política de backup, retenção e recuperação de desastre esperada?'},
{q:'Haverá domínio próprio? Quem administra o DNS e o certificado SSL?', hint:'Hoje a produção está em laserco-power-system.vercel.app.'},
{q:'Qual o nível de disponibilidade (SLA) esperado do sistema?'},
{q:'O repositório de código hoje é público. Isso deve continuar assim ou passar a privado?', crit:true},
]},

{ id:5, titulo:'Autenticação, perfis de acesso e multi-unidade', perguntas:[
{q:'O conjunto de 13 perfis de acesso está correto e completo? Falta algum perfil?', hint:'Hoje: Administrador, Gestor, Franqueado, Gerente de Campo, Consultor, Gerente/Sub, Profissional de Saúde, Colaborador, Marketing, Financeiro, Expansão, Implantação, Ponto.'},
{q:'Cada unidade precisa de isolamento total dos dados (cada franqueado só vê o seu)?', hint:'Hoje o estado é um único registro compartilhado em nuvem — não há isolamento por unidade.', crit:true},
{q:'Um mesmo usuário pode pertencer/operar em mais de uma unidade?'},
{q:'Quais são as regras exatas de quem pode ler e escrever o quê, por perfil e por unidade?', crit:true},
{q:'É necessário login com Google/Microsoft (SSO) e/ou autenticação em duas etapas (2FA)?'},
{q:'A recuperação de senha por e-mail é obrigatória?', hint:'Hoje não existe "Esqueci minha senha" no sistema principal.'},
{q:'Há política de senha forte, troca periódica e bloqueio por inatividade?', hint:'Hoje há inativação automática de colaborador após 15 dias sem acesso — confirmar a regra.'},
]},

{ id:6, titulo:'Fiscal — emissão de Notas Fiscais (NFS-e)', perguntas:[
{q:'Quais municípios/prefeituras precisam de emissão de NFS-e? (cada unidade emite na sua cidade)', crit:true},
{q:'Cada unidade já possui certificado digital (A1/A3) e inscrição municipal? Quem fornece e mantém?', crit:true},
{q:'Vamos usar um intermediador/provedor de NFS-e (ex.: PlugNotas, NFE.io, Focus NFe, eNotas) ou integração direta com cada prefeitura?', hint:'Define custo, prazo e complexidade. Hoje é tudo simulado.', crit:true},
{q:'A política de emissão (não emitir / na venda / na execução) é definida por tipo de serviço? Qual a regra oficial?'},
{q:'Quais as regras de alíquota de ISS por município e por serviço?'},
{q:'São necessários cancelamento, substituição e carta de correção da NFS-e?'},
{q:'Há tratamento fiscal específico para Ultrassom? (citado como exceção em recorrência e royalties)'},
]},

{ id:7, titulo:'Pagamentos, recorrência e financeiro bancário', perguntas:[
{q:'O gateway de crédito recorrente definitivo é o PagoLivre? Já há contrato e credenciais de API?', hint:'O código cita PagoLivre e, em outro ponto, Asaas — precisa unificar.', crit:true},
{q:'Quais formas de pagamento e parcelamento reais, com taxas por adquirente e limites? (PIX, débito, crédito, link, recorrência)'},
{q:'A conciliação bancária será via Open Finance, API do banco ou arquivo CNAB? Quais bancos/adquirentes?', crit:true},
{q:'A emissão de boletos será por qual banco/convênio? A régua de cobrança automática é requisito?', hint:'Hoje boletos, baixa e envio são simulados.'},
{q:'Qual a regra exata de royalties? (% sobre faturamento bruto, % do fundo de marketing, dia de vencimento)', hint:'Protótipo usa 10% de royalties e 2% de fundo — confirmar.'},
{q:'Há integração necessária com ERP/sistema contábil externo?'},
{q:'As regras de juros (1% a.m.), multa (10%) e correção monetária para inadimplência estão corretas?', hint:'Hoje os índices vêm da API do Banco Central.'},
]},

{ id:8, titulo:'Comunicação — WhatsApp, e-mail e SMS', perguntas:[
{q:'O WhatsApp será via API Oficial (Meta Cloud) ou via solução não-oficial (Z-API, BLIP)?', hint:'Muda custo, aprovação e estabilidade. Hoje todos os disparos são simulados.', crit:true},
{q:'Já existe conta Meta Business verificada e números aprovados? Cada unidade terá o seu número?', crit:true},
{q:'Quem arca com o custo por mensagem/conversa e qual o volume mensal estimado?'},
{q:'O motor de automações (17 fluxos: recompra, lembretes, no-show, NPS, aniversário, etc.) precisa ser real e configurável pelo usuário?', hint:'Hoje é apenas um catálogo visual.'},
{q:'Qual provedor de e-mail transacional será usado (SendGrid, Amazon SES, etc.) e qual o domínio/remetente oficial?'},
{q:'Envio de SMS entra no escopo?'},
{q:'As notificações ao cliente (confirmação, ganhador de sorteio, cobrança) devem sair por WhatsApp, e-mail ou ambos?'},
]},

{ id:9, titulo:'Ponto Digital, Google Maps e RH', perguntas:[
{q:'A folha de ponto precisa ter validade legal (Portaria 671/MTP, REP-P), espelho de ponto e banco de horas?', crit:true},
{q:'Já existe chave do Google Maps com billing ativo, ou podemos usar OpenStreetMap?', hint:'Hoje o GPS do navegador é real; o mapa depende de chave.'},
{q:'A cerca virtual (raio e coordenadas por unidade) — quem fornece esses dados?'},
{q:'A folha de pagamento do RH deve calcular encargos de verdade (INSS, IRRF, FGTS) ou integrar com folha externa? Há integração com eSocial?', hint:'Hoje os valores são apenas exibidos (semeados), sem cálculo.', crit:true},
{q:'Quais funções de RH são realmente usadas? (recrutamento/kanban, férias, atestados, avaliação de desempenho, regras da rede)'},
{q:'O app de RH (hoje em React, embarcado) deve ser unificado ao sistema principal ou continuar separado?'},
]},

{ id:10, titulo:'Documentos, arquivos e Disco Virtual', perguntas:[
{q:'Onde os arquivos devem ser armazenados? (Supabase Storage, Amazon S3, Google Drive real)', crit:true},
{q:'O Disco Virtual exige integração real com a API do Google Drive ou armazenamento próprio basta?', hint:'Hoje a integração com o Drive é simulada (guarda só o link).'},
{q:'Anexos de contratos/PDF do Jurídico precisam de upload real, versionamento e histórico?', hint:'Hoje o anexo guarda apenas o nome do arquivo.'},
{q:'É necessária assinatura eletrônica de contratos (ex.: D4Sign, Clicksign, Gov.br)?'},
{q:'Fotos clínicas (antes/depois) precisam de armazenamento seguro, com consentimento e controle de acesso?', hint:'Hoje as fotos ficam só na memória da sessão.', crit:true},
]},

{ id:11, titulo:'CRM, Marketing, Expansão e SAC', perguntas:[
{q:'Os estágios do funil do CRM e as regras de SLA (ex.: 48h) são os definitivos?'},
{q:'Como funciona hoje a captação de leads por geolocalização e a "integração com o site"? Existe um site/endpoint real para receber os leads?', hint:'Hoje o endpoint é apenas um texto de exemplo.'},
{q:'No SAC, quais integrações de canais são reais e necessárias? (Reclame Aqui, Procon, Instagram, BLIP, Sults)', hint:'Hoje aparecem com status fixo, sem conexão.'},
{q:'A regra de reembolso (multa de 30%, isenção "por nossa culpa") é a política oficial? Quem aprova?'},
{q:'A regra de acordos do SAC ("1º pagamento após o dia 15", parcelamento) é definitiva?'},
{q:'A Gestão de Indiques (sorteio mensal, prêmio, link por unidade) será usada de fato e com que regras?'},
]},

{ id:12, titulo:'LGPD, segurança e compliance', perguntas:[
{q:'A empresa possui encarregado de dados (DPO), política de privacidade e termos de uso?', crit:true},
{q:'Qual o fluxo de consentimento exigido para dados de saúde e uso de imagem (fotos clínicas)?', crit:true},
{q:'Quais as regras de retenção e exclusão de dados (direito ao esquecimento)?'},
{q:'Por quanto tempo os logs de auditoria devem ser mantidos e quem pode acessá-los?', hint:'Hoje a auditoria guarda os últimos 400 eventos, em memória.'},
{q:'Há exigência de criptografia, anonimização ou segregação de dados sensíveis?'},
{q:'Existe necessidade de trilha de aprovação/consentimento para envio de mensagens de marketing (opt-in)?'},
]},

{ id:13, titulo:'Experiência, responsividade e dispositivos', perguntas:[
{q:'Quais dispositivos e navegadores são prioritários? (PC da recepção, tablet, celular do franqueado)', hint:'Validaremos em desktop, tablet e mobile.'},
{q:'Nas lojas, o App do Cliente roda em tablet compartilhado ou no celular do próprio cliente?'},
{q:'O sistema precisa de outros idiomas além do português, ou requisitos de acessibilidade?'},
{q:'Existe manual de identidade visual oficial (logo em alta, cores, tipografia) a seguir?', hint:'O protótipo usa tema vinho/dourado.'},
{q:'O funcionamento offline (PWA com cache) é um requisito importante para as unidades?'},
]},

{ id:14, titulo:'Performance, escala e disponibilidade', perguntas:[
{q:'Quais são os picos de uso (horários e dias) e quantos usuários simultâneos esperados?'},
{q:'Há um tempo de resposta aceitável para telas e relatórios pesados?'},
{q:'Qual o volume esperado de vendas/agendamentos/mensagens por mês na rede inteira?'},
]},

{ id:15, titulo:'Homologação, treinamento e suporte', perguntas:[
{q:'Quem, do lado do cliente, será responsável por homologar cada módulo? (usaremos o checklist de homologação)'},
{q:'Haverá ambiente e massa de dados específicos para testes/homologação?'},
{q:'Como será o treinamento das unidades? (presencial, online, material, "treina o treinador")'},
{q:'Como deve ser o suporte após o go-live? (canais, horário, SLA de atendimento)', crit:true},
{q:'A manutenção evolutiva e a correção de bugs serão contratadas como pacote contínuo?'},
]},

{ id:16, titulo:'Projeto, prazo, orçamento e governança', perguntas:[
{q:'Qual o orçamento disponível e o modelo de contratação? (escopo fechado x time & materiais x mensalidade)', crit:true},
{q:'Qual o prazo desejado e qual a flexibilidade dele?', crit:true},
{q:'Quem é o ponto focal do cliente com autonomia para decisões?', crit:true},
{q:'Qual a cadência de reuniões de acompanhamento e a ferramenta de gestão a usar?'},
{q:'Quais os critérios de aceite e as condições de pagamento por entrega/fase?'},
{q:'A quem pertence a propriedade intelectual e o código-fonte ao final do projeto?'},
]},

];

/* ====================== Geração do HTML ===================================*/
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

let total=0, criticas=0;
SECOES.forEach(s=>{ total+=s.perguntas.length; s.perguntas.forEach(p=>{ if(p.crit) criticas++; }); });

const indexRows = SECOES.map(s=>{
  const c = s.perguntas.filter(p=>p.crit).length;
  return `<tr><td class="ix-id">${s.id}</td><td>${esc(s.titulo)}</td><td class="num">${s.perguntas.length}</td><td class="num">${c||''}</td></tr>`;
}).join('');

const sectionsHTML = SECOES.map(sec=>{
  let n=0;
  const body = sec.perguntas.map(p=>{
    n++;
    const id = `${sec.id}.${n}`;
    const badge = p.crit ? '<span class="crit">CRÍTICA</span>' : '';
    const hint = p.hint ? `<div class="hint">${esc(p.hint)}</div>` : '';
    return `<div class="q ${p.crit?'isc':''}">
      <div class="qhead"><span class="qid">${id}</span><span class="qtxt">${esc(p.q)}</span>${badge}</div>
      ${hint}
      <div class="ans"><div class="line"></div><div class="line"></div></div>
    </div>`;
  }).join('');
  return `<section class="sec">
    <h2><span class="secid">${sec.id}</span> ${esc(sec.titulo)} <span class="seccount">(${sec.perguntas.length} perguntas)</span></h2>
    ${body}
  </section>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(META.doc)} — ${esc(META.sistema)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 14mm 16mm 14mm;
    @bottom-center { content: "${META.doc} — ${META.sistema}"; font-size: 7pt; color:#8a6f78; }
    @bottom-right  { content: "Página " counter(page) " / " counter(pages); font-size: 7pt; color:#8a6f78; }
  }
  @page :first { @bottom-center{content:""} @bottom-right{content:""} }
  * { box-sizing: border-box; }
  body { font-family: "DejaVu Sans", Arial, sans-serif; color:#241016; font-size:10pt; line-height:1.4; margin:0; }
  h1 { font-size:24pt; margin:0 0 4pt; color:#5b1726; }
  h2 { font-size:12.5pt; color:#fff; background:#6B2233; padding:5pt 9pt; border-radius:4px; margin:16pt 0 8pt; page-break-after:avoid; }
  .secid { display:inline-block; background:#C9A227; color:#3A2A06; font-weight:700; border-radius:3px; padding:0 7pt; margin-right:5pt; }
  .seccount { font-weight:400; font-size:9pt; opacity:.85; }
  /* Cover */
  .cover { height: 245mm; display:flex; flex-direction:column; justify-content:center; }
  .cover .brand { color:#C9A227; font-weight:700; letter-spacing:2px; font-size:11pt; text-transform:uppercase; }
  .cover h1 { font-size:30pt; margin:6pt 0 4pt; line-height:1.1; }
  .cover .sub { font-size:13pt; color:#6B2233; font-weight:600; max-width:150mm; }
  .cover .meta { margin-top:22pt; border-top:2px solid #C9A227; padding-top:12pt; }
  .cover .meta div { margin:3pt 0; font-size:10.5pt; }
  .cover .meta b { display:inline-block; width:150px; color:#6B2233; }
  .pill { display:inline-block; background:#6B2233; color:#fff; padding:3pt 10pt; border-radius:20px; font-size:9.5pt; margin-top:16pt; }
  /* Intro */
  .intro { page-break-before: always; }
  .intro h1 { font-size:17pt; border-bottom:2px solid #C9A227; padding-bottom:4pt; }
  .intro p, .intro li { font-size:10pt; }
  .intro h3 { color:#6B2233; margin:14pt 0 4pt; font-size:11.5pt; }
  table.ix { border-collapse:collapse; width:100%; font-size:9.5pt; margin-top:4pt; }
  table.ix th, table.ix td { border:1px solid #d8c4cb; padding:4pt 8pt; }
  table.ix th { background:#6B2233; color:#fff; text-align:left; }
  table.ix .ix-id { font-weight:700; color:#6B2233; text-align:center; width:34px; }
  table.ix .num { text-align:center; width:74px; }
  .kpis { display:flex; gap:10pt; margin:10pt 0; }
  .kpi { flex:1; border:1px solid #d8c4cb; border-radius:6px; padding:9pt; text-align:center; background:#faf5f6; }
  .kpi .v { font-size:21pt; font-weight:700; color:#6B2233; }
  .kpi .l { font-size:8.5pt; color:#5c4a4f; }
  .kpi.c .v { color:#a8500b; }
  /* Questions */
  .sec { page-break-before: always; }
  .q { margin:0 0 9pt; padding:0 0 2pt; page-break-inside: avoid; }
  .q.isc { border-left:3px solid #C9A227; padding-left:8pt; background:#fffdf6; }
  .qhead { display:flex; align-items:baseline; gap:6pt; }
  .qid { font-weight:700; color:#6B2233; white-space:nowrap; font-size:9.5pt; }
  .qtxt { flex:1; font-weight:600; font-size:10pt; }
  .crit { background:#a8500b; color:#fff; font-size:7pt; font-weight:700; padding:1pt 6pt; border-radius:10px; white-space:nowrap; letter-spacing:.5px; }
  .hint { font-size:8.6pt; color:#7a5c63; font-style:italic; margin:1pt 0 0 2pt; }
  .ans { margin-top:7pt; }
  .ans .line { border-bottom:1px dotted #b79aa2; height:15pt; }
  /* Notes page */
  .notes { page-break-before: always; }
  .notes h1 { font-size:16pt; border-bottom:2px solid #C9A227; padding-bottom:4pt; }
  .nline { border-bottom:1px dotted #b79aa2; height:20pt; }
</style></head>
<body>

<!-- CAPA -->
<div class="cover">
  <div class="brand">Laser&amp;Co — Levantamento de Requisitos</div>
  <h1>Perguntas para o Cliente</h1>
  <div class="sub">Questionário de descoberta para viabilizar o projeto do ${esc(META.sistema)} de ponta a ponta — sem retrabalho e sem surpresas.</div>
  <div class="meta">
    <div><b>Documento:</b> ${esc(META.doc)}</div>
    <div><b>Sistema:</b> ${esc(META.sistema)}</div>
    <div><b>Total de perguntas:</b> ${total} (${criticas} críticas)</div>
    <div><b>Seções:</b> ${SECOES.length}</div>
    <div><b>Gerado em:</b> ${esc(META.geradoEm)}</div>
  </div>
  <div><span class="pill">Use em reunião de kickoff &middot; Preencha as respostas em cada linha</span></div>
</div>

<!-- INTRO -->
<div class="intro">
  <h1>Como usar este questionário</h1>
  <p>Este roteiro foi montado a partir da <b>análise do protótipo atual</b>. Hoje o sistema é uma demonstração navegável:
  muitos fluxos funcionam apenas na tela (botões sem ação, dados de exemplo) e várias integrações externas (fiscal, pagamentos,
  WhatsApp, Google Drive) ainda são simuladas. Para levar o projeto a <b>produção 100% funcional</b>, é preciso fechar com o
  cliente as decisões abaixo — cada resposta destrava uma parte do desenvolvimento.</p>
  <p>As perguntas marcadas como <span class="crit">CRÍTICA</span> são bloqueadoras: sem elas, não é seguro estimar prazo,
  custo nem começar a construir. Recomenda-se respondê-las primeiro, ainda no kickoff.</p>

  <div class="kpis">
    <div class="kpi"><div class="v">${total}</div><div class="l">Perguntas</div></div>
    <div class="kpi c"><div class="v">${criticas}</div><div class="l">Críticas (bloqueadoras)</div></div>
    <div class="kpi"><div class="v">${SECOES.length}</div><div class="l">Áreas / seções</div></div>
  </div>

  <h3>Índice de seções</h3>
  <table class="ix"><thead><tr><th>#</th><th>Seção</th><th>Perguntas</th><th>Críticas</th></tr></thead>
  <tbody>${indexRows}</tbody></table>

  <h3>Dica de condução</h3>
  <p>Sugestão de ordem na reunião: (1) Visão geral e escopo/MVP — para alinhar expectativa; (2) Dados e infraestrutura —
  para destravar o ambiente; (3) Integrações fiscais, de pagamento e de comunicação — normalmente os maiores riscos de prazo;
  (4) LGPD e compliance; (5) Projeto, prazo e governança. Registre as respostas direto neste documento ou em ata.</p>
</div>

<!-- SEÇÕES -->
${sectionsHTML}

<!-- ANOTAÇÕES -->
<div class="notes">
  <h1>Anotações e decisões pendentes</h1>
  ${Array.from({length:18}).map(()=>'<div class="nline"></div>').join('')}
</div>

</body></html>`;

require('fs').writeFileSync(__dirname + '/perguntas-cliente.html', html);
console.log('OK — perguntas-cliente.html gerado. Seções:', SECOES.length, '| Perguntas:', total, '| Críticas:', criticas);
