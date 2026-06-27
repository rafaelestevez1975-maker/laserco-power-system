-- =============================================================================
-- Migration — ANAMNESE / DOCUMENTOS + ORIGENS + MOTIVOS
--   (paridade com o legado: legacy/index.html)
-- =============================================================================
-- CONTEXTO
--   O legado tem três telas de cadastro que não existiam como tabela no lkii:
--
--   1. Documentos / Anamnese Digital (DOCS_LIST / DOC_MODELS / docsRows /
--      openDocEditor / renderDocEditor). Construtor de documentos clínicos com:
--        · metadados (nome, tipo, descrição, preenchimento, obrigatório, status,
--          acumulativo, unidades com acesso);
--        · seções e perguntas dinâmicas (8 tipos de campo: simnao, textocurto,
--          textolongo, numero, selecao, consent, assinatura, imagem);
--        · flags por pergunta: obrig. e "inviabiliza" (regra clínica — respondida
--          positivamente bloqueia os serviços).
--      8 documentos seed: Anamnese, Termo de Sessão (acumulativo), Autorização
--      para Menor, Uso de Imagem, Cancelamento, Transferência de Pacotes,
--      Troca p/ Crédito e Orientações Pós-Laser (Rascunho / subconjunto de unidades).
--
--   2. Origens de Cliente (buildOrigens / ORIGENS) — CRUD de canais de captação,
--      com flags auto (Geolocalizado) e campo (Outros).
--
--   3. Motivos de Cancelamento (buildMotivos / MOTIVOS) — CRUD com flag "sistema"
--      (padrão do sistema: só inativa, não exclui).
--
-- DECISÃO ADOTADA
--   · Catálogo por EMPRESA (config da rede), espelhando catalogo.sql.
--   · documentos.secoes em JSONB (lista de {titulo, campos:[{q,t,obr,inv}]}) —
--     o construtor do legado já trabalha com esse formato; evita N tabelas filhas.
--   · documentos.unidades_ids uuid[] = subconjunto de unidades com acesso
--     (NULL/[] = "Todas as unidades da rede").
--   · RLS por papel (admin_geral / gestor / financeiro escrevem; demais leem).
--   · Seeds idempotentes (só se a tabela estiver vazia para a empresa) espelhando
--     ANAMNESE / SESSAO / MENOR / IMAGEM / CANCEL / TRANSFER / CREDITO + DOCS_LIST.
--
-- SEGURANÇA / IDEMPOTÊNCIA
--   CREATE TABLE IF NOT EXISTS / DROP POLICY IF EXISTS / contagem antes de semear.
--   Rodar duas vezes não quebra.
--
-- COMO APLICAR (manual — NÃO é aplicada automaticamente):
--   psql "$DATABASE_URL" -f scripts/migrations/anamnese.sql
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) DOCUMENTOS / FICHAS DIGITAIS (DOCS_LIST + DOC_MODELS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documentos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid REFERENCES empresas(id) ON DELETE CASCADE,
  nome          text NOT NULL,
  tipo          text NOT NULL DEFAULT 'Anamnese',
  descricao     text,
  -- Preenchimento: legado select 'Obrigatório para todos' / 'Opcional' /
  -- 'Somente clientes de ultrassom'.
  preenchimento text NOT NULL DEFAULT 'Obrigatório para todos os clientes'
                CHECK (preenchimento IN (
                  'Obrigatório para todos os clientes','Opcional','Somente clientes de ultrassom')),
  obrigatorio   boolean NOT NULL DEFAULT false,
  -- Status: Ativo / Rascunho / Inativo (badge de 3 estados no legado).
  status        text NOT NULL DEFAULT 'Ativo'
                CHECK (status IN ('Ativo','Rascunho','Inativo')),
  -- Documento acumulativo de sessões (SESSAO.acumulativo=true).
  acumulativo   boolean NOT NULL DEFAULT false,
  -- Subconjunto de unidades com acesso. NULL/{} = todas as unidades da rede.
  unidades_ids  uuid[],
  -- Seções/campos do construtor (8 tipos de campo + flags obr/inv).
  -- Forma: [{ "titulo": "...", "campos": [{ "q":"...", "t":"simnao", "obr":true, "inv":false }] }]
  secoes        jsonb NOT NULL DEFAULT '[]'::jsonb,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documentos_empresa ON documentos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_documentos_status  ON documentos (status);

-- ----------------------------------------------------------------------------
-- 2) ORIGENS DE CLIENTE (buildOrigens / ORIGENS)
--    auto  = preenchido automaticamente (Geolocalizado via CRM/geolocalização)
--    campo = ao selecionar abre campo para especificar (Outros)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS origens_cliente (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid REFERENCES empresas(id) ON DELETE CASCADE,
  nome          text NOT NULL,
  ativo         boolean NOT NULL DEFAULT true,
  auto          boolean NOT NULL DEFAULT false,
  campo         boolean NOT NULL DEFAULT false,
  ordem         integer NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_origens_cliente_empresa ON origens_cliente (empresa_id);

-- ----------------------------------------------------------------------------
-- 3) MOTIVOS DE CANCELAMENTO (buildMotivos / MOTIVOS)
--    sistema = padrão do sistema (cadeado): só pode inativar, não excluir.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS motivos_cancelamento (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid REFERENCES empresas(id) ON DELETE CASCADE,
  nome          text NOT NULL,
  sistema       boolean NOT NULL DEFAULT false,
  ativo         boolean NOT NULL DEFAULT true,
  ordem         integer NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_motivos_cancelamento_empresa ON motivos_cancelamento (empresa_id);

-- ----------------------------------------------------------------------------
-- 4) AUTOMAÇÃO DE NÃO COMPARECIMENTO (WhatsApp) — bloco de config dos Motivos.
--    1 linha por empresa (config singleton). Espelha view-motivos (1762-1788).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS noshow_automacao (
  empresa_id        uuid PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
  ativa             boolean NOT NULL DEFAULT true,
  primeira_apos     text NOT NULL DEFAULT '2 horas',     -- 1ª mensagem após a sessão
  max_mensagens     integer NOT NULL DEFAULT 2,          -- máximo de mensagens no dia
  intervalo         text NOT NULL DEFAULT '2 horas',     -- intervalo entre mensagens
  mensagem          text NOT NULL DEFAULT 'Olá {cliente}! 💙 Notamos que você não compareceu à sua sessão de {serviço} hoje às {hora}. Aconteceu algo? Temos horários disponíveis e adoraríamos remarcar para você. É só responder aqui que reagendamos na hora! 😊',
  -- 3 toggles de regra de tratamento
  regra_reagenda    boolean NOT NULL DEFAULT true,       -- se responder, reagenda automaticamente
  regra_exclui      boolean NOT NULL DEFAULT true,       -- se não responder, exclui e computa no-show
  regra_oculta      boolean NOT NULL DEFAULT true,       -- não exibe no dia seguinte quem faltou
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 5) RLS — habilitar + policies por papel.
--    Leitura: qualquer perfil autenticado. Escrita: admin_geral / gestor.
-- ----------------------------------------------------------------------------
ALTER TABLE documentos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE origens_cliente     ENABLE ROW LEVEL SECURITY;
ALTER TABLE motivos_cancelamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE noshow_automacao    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['documentos','origens_cliente','motivos_cancelamento','noshow_automacao'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_sel ON %I', t, t);
    EXECUTE format($p$
      CREATE POLICY %I_sel ON %I
      FOR SELECT
      USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()))
    $p$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_rw ON %I', t, t);
    EXECUTE format($p$
      CREATE POLICY %I_rw ON %I
      FOR ALL
      USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                     AND p.papel IN ('admin_geral','gestor')))
      WITH CHECK (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                     AND p.papel IN ('admin_geral','gestor')))
    $p$, t, t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 6) SEED — espelha ORIGENS, MOTIVOS, DOCS_LIST e DOC_MODELS do legado.
--    Idempotente: só insere se a tabela estiver vazia para a empresa.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_empresa uuid;
BEGIN
  SELECT id INTO v_empresa FROM empresas ORDER BY 1 LIMIT 1;
  IF v_empresa IS NULL THEN RETURN; END IF;

  -- Origens de cliente (ORIGENS)
  IF (SELECT count(*) FROM origens_cliente WHERE empresa_id = v_empresa) = 0 THEN
    INSERT INTO origens_cliente (empresa_id, nome, ativo, auto, campo, ordem) VALUES
      (v_empresa, 'Geolocalizado', true, true,  false, 1),
      (v_empresa, 'Passante',      true, false, false, 2),
      (v_empresa, 'Indicação',     true, false, false, 3),
      (v_empresa, 'Parcerias',     true, false, false, 4),
      (v_empresa, 'Outros',        true, false, true,  5);
  END IF;

  -- Motivos de cancelamento (MOTIVOS) — 3 do sistema + 3 personalizados
  IF (SELECT count(*) FROM motivos_cancelamento WHERE empresa_id = v_empresa) = 0 THEN
    INSERT INTO motivos_cancelamento (empresa_id, nome, sistema, ativo, ordem) VALUES
      (v_empresa, 'Cliente Cancelou (antecipadamente)',               true,  true, 1),
      (v_empresa, 'Cliente não compareceu (e não reagendou)',         true,  true, 2),
      (v_empresa, 'Cliente Reagendou (antes ou depois da sessão)',    true,  true, 3),
      (v_empresa, 'Problema de saúde',                                false, true, 4),
      (v_empresa, 'Gravidez',                                         false, true, 5),
      (v_empresa, 'Insatisfação com o serviço',                       false, true, 6);
  END IF;

  -- Config de automação de não comparecimento (singleton por empresa)
  INSERT INTO noshow_automacao (empresa_id) VALUES (v_empresa)
  ON CONFLICT (empresa_id) DO NOTHING;

  -- Documentos (DOCS_LIST + DOC_MODELS). Só se vazio para a empresa.
  IF (SELECT count(*) FROM documentos WHERE empresa_id = v_empresa) = 0 THEN

    -- Anamnese Digital (5 seções, ~44 perguntas, flags inv)
    INSERT INTO documentos (empresa_id, nome, tipo, descricao, preenchimento, obrigatorio, status, acumulativo, secoes) VALUES
    (v_empresa, 'Anamnese Digital', 'Anamnese',
     'Ficha clínica preenchida na sala de avaliação ou de aplicação',
     'Obrigatório para todos os clientes', true, 'Ativo', false,
     $json$[
       {"titulo":"Ficha clínica (preenchido na sala de avaliação ou na sala de aplicação)","campos":[
         {"q":"Você está usando ácido retinóico?","t":"simnao"},
         {"q":"Faz uso de Roacutan?","t":"simnao"},
         {"q":"Faz uso de antidepressivo?","t":"simnao"},
         {"q":"Você está realizando tratamento médico?","t":"simnao"},
         {"q":"Se sim, qual?","t":"textocurto"},
         {"q":"Você tem lúpus?","t":"simnao"},
         {"q":"Tem Psoríase?","t":"simnao"},
         {"q":"Você tem vitiligo?","t":"simnao"},
         {"q":"É epilético?","t":"simnao"},
         {"q":"Já teve alguma alergia?","t":"simnao"},
         {"q":"Você tem histórico de Herpes?","t":"simnao"},
         {"q":"Tem histórico de câncer?","t":"simnao"},
         {"q":"Se sim, aonde e a quanto tempo?","t":"textocurto"},
         {"q":"Possui alguma doença diagnosticada?","t":"simnao"},
         {"q":"Como é a sua cicatrização?","t":"selecao"},
         {"q":"Usa Protetor Solar diariamente?","t":"simnao"},
         {"q":"Usa clareador tópico?","t":"simnao"},
         {"q":"Usa hidratante?","t":"simnao"},
         {"q":"Mais alguma observação em relação à saúde do cliente?","t":"textolongo"}
       ]},
       {"titulo":"Perguntas que, se respondido positivamente, inviabiliza os serviços","campos":[
         {"q":"Você está grávida?","t":"simnao","inv":true},
         {"q":"Está amamentando?","t":"simnao","inv":true},
         {"q":"Se sim, tem quanto tempo?","t":"textocurto"},
         {"q":"Já realizou algum tipo de camuflagem?","t":"simnao"},
         {"q":"Se sim, onde?","t":"textocurto"},
         {"q":"Você possui alergia a algum anestésico?","t":"simnao","inv":true},
         {"q":"Se você respondeu sim à última pergunta, deseja realizar os serviços sem a utilização de anestésicos?","t":"simnao"}
       ]},
       {"titulo":"Exclusivo para clientes de ultrassom","campos":[
         {"q":"Tem PMMA?","t":"simnao"},
         {"q":"Possui Fio Russo?","t":"simnao"},
         {"q":"Tem marcapasso ou implante?","t":"simnao","inv":true},
         {"q":"Qual a prega de gordura do abdômen, flancos, papada, supra e infraescapular?","t":"textocurto"},
         {"q":"Possui doenças do colágeno? (artrite reumatoide, esclerose sistêmica progressiva, dermatomiosite)","t":"simnao"},
         {"q":"Se sim, qual delas?","t":"textocurto"},
         {"q":"O ULTRASSOM proporciona uma baixa quantidade de energia de ultrassom focado para a pele. Entendo que pode haver algum desconforto durante o tratamento, quando o ultrassom está sendo entregue.","t":"consent"},
         {"q":"Estou ciente que são possíveis alguns efeitos pós tratamento, podendo ser apresentada vermelhidão na pele, leve inchaço, hematomas, nódulos, leve sensibilidade ou formigamentos em áreas determinadas, que podem durar algumas horas ou mais.","t":"consent"}
       ]},
       {"titulo":"Avaliação estética","campos":[
         {"q":"Quais os cuidados diários com a pele, descrever aqui:","t":"textolongo"},
         {"q":"Qual o fototipo do cliente?","t":"selecao"},
         {"q":"Qual a sua principal queixa?","t":"textocurto"},
         {"q":"Quais serviços são recomendados? (Incluir número de sessões)","t":"textolongo"},
         {"q":"Estou ciente que, apesar de improváveis, alguns efeitos temporários podem ocorrer, como vermelhidão, hematomas, edemas, hiperpigmentação, hipopigmentação ou sensibilidade reduzida ao toque, herpes, bem como eventual risco de lesão em nervo e formação de cicatriz, de forma TEMPORÁRIA.","t":"consent"},
         {"q":"Estou de acordo que toda fotografia feita do meu caso será usada para fins de acompanhamento da evolução do tratamento, não servindo para outros fins exceto que previamente autorizado.","t":"consent"},
         {"q":"Estou ciente de que os meus dados somente serão utilizados para fins dos serviços contratados, nos termos da LGPD.","t":"consent"},
         {"q":"Autorizo o uso das imagens do meu caso para fins de divulgação da marca, sem a minha identificação.","t":"simnao"}
       ]},
       {"titulo":"Assinaturas","campos":[
         {"q":"Assinatura do cliente","t":"assinatura"},
         {"q":"Nome do profissional responsável e número do registro no Conselho","t":"textocurto"},
         {"q":"Assinatura do profissional de saúde","t":"assinatura"}
       ]}
     ]$json$::jsonb);

    -- Termo de Realização de Sessão (acumulativo, 2 seções)
    INSERT INTO documentos (empresa_id, nome, tipo, descricao, preenchimento, obrigatorio, status, acumulativo, secoes) VALUES
    (v_empresa, 'Termo de Realização de Sessão', 'Ficha de sessão',
     'Termo acumulativo: reabre o mesmo documento e registra cada nova sessão',
     'Obrigatório para todos os clientes', true, 'Ativo', true,
     $json$[
       {"titulo":"Declaração de manutenção das condições de saúde","campos":[
         {"q":"Declaro para os devidos fins que as informações prestadas na ficha de Anamnese quando do início do tratamento estão mantidas. Caso sua resposta seja negativa, deve ser refeita a Anamnese.","t":"simnao","inv":true},
         {"q":"Declaro para os devidos fins que não estou grávida.","t":"simnao","inv":true},
         {"q":"Declaro para os devidos fins que não estou tomando nenhum medicamento que não tenha sido declarado na ficha de Anamnese.","t":"simnao"},
         {"q":"Declaro para os devidos fins que estou ciente de que para a realização das sessões devo evitar exposição ao sol 10 dias antes e 10 dias depois da sessão.","t":"simnao"}
       ]},
       {"titulo":"Registro da sessão (preenchido a cada nova sessão)","campos":[
         {"q":"Data da sessão","t":"textocurto"},
         {"q":"Serviços realizados e parâmetros de potências utilizadas","t":"textolongo"},
         {"q":"O que foi feito na sessão","t":"textolongo"},
         {"q":"Evolução do cliente","t":"textolongo"},
         {"q":"Novas fotos da sessão","t":"imagem"},
         {"q":"Assinatura do cliente","t":"assinatura"},
         {"q":"Nome do profissional responsável e número do registro no Conselho","t":"textocurto"},
         {"q":"Assinatura do profissional de saúde","t":"assinatura"}
       ]}
     ]$json$::jsonb);

    -- Autorização para Menor (1 seção, 14 campos)
    INSERT INTO documentos (empresa_id, nome, tipo, descricao, preenchimento, obrigatorio, status, secoes) VALUES
    (v_empresa, 'Autorização para Menor', 'Termo', 'Termo de autorização de realização de sessão(ões) por menor',
     'Opcional', false, 'Ativo',
     $json$[
       {"titulo":"Termo de autorização de realização de sessão(ões) por menor","campos":[
         {"q":"Nome do responsável legal","t":"textocurto"},
         {"q":"Documento de identificação do responsável","t":"textocurto"},
         {"q":"Relação de parentesco com o menor","t":"textocurto"},
         {"q":"Nome do menor","t":"textocurto"},
         {"q":"Documento de identificação do menor","t":"textocurto"},
         {"q":"Data de nascimento do menor","t":"textocurto"},
         {"q":"Procedimento a ser realizado e número de sessões contratadas","t":"textolongo"},
         {"q":"Como responsável, fui informado claramente dos riscos, contraindicações, efeitos colaterais e advertências gerais sobre o procedimento a ser realizado.","t":"consent"},
         {"q":"Declaro que os termos técnicos foram explicados e todas as minhas dúvidas foram esclarecidas pela equipe.","t":"consent"},
         {"q":"Declaro que acompanhei presencialmente o(a) menor em todas as etapas, inclusive durante a realização do procedimento estético.","t":"consent"},
         {"q":"Comprometo-me a orientar o(a) menor a seguir corretamente todas as orientações pós-procedimento e a fazer uso dos produtos da prescrição domiciliar recomendada, isentando os profissionais envolvidos de responsabilidade por intercorrência decorrente de maus cuidados pós-procedimento.","t":"consent"},
         {"q":"Declaro minha anuência expressa com todos os termos contidos na ficha clínica que integra o presente termo, bem como me responsabilizo pelos pagamentos dos serviços contratados e aplicados ao menor.","t":"consent"},
         {"q":"Por fim, declaro que li e compreendi o presente termo e seus anexos, pelo que dou meu consentimento e autorizo o(a) menor a submeter-se ao referido procedimento estético, assumindo a responsabilidade pelo mesmo, por livre e espontânea vontade.","t":"consent"},
         {"q":"Assinatura do responsável","t":"assinatura"}
       ]}
     ]$json$::jsonb);

    -- Autorização de Uso de Imagem (regra de comissão 10% / 30 dias)
    INSERT INTO documentos (empresa_id, nome, tipo, descricao, preenchimento, obrigatorio, status, secoes) VALUES
    (v_empresa, 'Autorização de Uso de Imagem', 'Termo', 'Autorização de uso de imagem para divulgação da marca',
     'Opcional', false, 'Ativo',
     $json$[
       {"titulo":"Autorização de uso de imagem","campos":[
         {"q":"Procedimento a ser realizado na Declarante","t":"textocurto"},
         {"q":"A parte acima qualificada declara que expressa a sua vontade em autorizar que a empresa, ou qualquer de suas filiais, se utilize da imagem da declarante, seja fazendo procedimentos estéticos ou nas dependências de qualquer unidade da rede, para fins de divulgação.","t":"consent"},
         {"q":"Que, em troca, será ofertado um serviço estético a laser gratuito à declarante, estando ciente que possui obrigação de, sempre que realizar os serviços, fazer a divulgação do referido serviço em suas redes sociais (post e stories) e da marca e/ou suas filiais, bem como compartilhar os referidos materiais para uso; o não cumprimento da divulgação impede a Declarante de receber o serviço ofertado ou deverá pagar pelo serviço realizado.","t":"consent"},
         {"q":"Serviço ofertado e número de sessões","t":"textocurto"},
         {"q":"Estou ciente que não há prazo para a postagem das imagens feitas da Declarante, sendo permitido, inclusive, reposts das fotos, em qualquer rede social da marca.","t":"consent"},
         {"q":"Que a Declarante opta por fazer uma promoção aos seus seguidores ofertando um código com desconto a ser definido, sendo devida à Declarante uma comissão de 10% sobre as vendas realizadas nos 30 dias seguintes à primeira postagem, em serviços estéticos a laser (pacotes, sem desconto sobre o preço de tabela), mediante apresentação de relatório das Ordens de Serviço com o referido desconto.","t":"consent"},
         {"q":"Caso seja positiva a resposta anterior, indique o código de desconto da cliente","t":"textocurto"},
         {"q":"Assinatura da Declarante","t":"assinatura"}
       ]}
     ]$json$::jsonb);

    -- Formulário de Solicitação de Cancelamento (3 seções)
    INSERT INTO documentos (empresa_id, nome, tipo, descricao, preenchimento, obrigatorio, status, secoes) VALUES
    (v_empresa, 'Formulário de Solicitação de Cancelamento', 'Formulário', 'Formulário de solicitação de cancelamento de contrato',
     'Opcional', false, 'Ativo',
     $json$[
       {"titulo":"Formulário de solicitação de cancelamento de contrato","campos":[
         {"q":"Nome completo da solicitante","t":"textocurto"},
         {"q":"Número do CPF","t":"textocurto"},
         {"q":"Endereço de e-mail","t":"textocurto"},
         {"q":"Telefone celular com DDD","t":"textocurto"},
         {"q":"Unidade onde contratou o serviço","t":"textocurto"}
       ]},
       {"titulo":"Informações contratuais","campos":[
         {"q":"Quais os serviços que foram contratados?","t":"textolongo"},
         {"q":"Quantas sessões?","t":"textocurto"},
         {"q":"Qual o motivo do cancelamento do serviço?","t":"textolongo"},
         {"q":"Qual a data da contratação?","t":"textocurto"},
         {"q":"Qual o valor pago?","t":"textocurto"},
         {"q":"Qual a forma de pagamento e número de parcelas?","t":"textocurto"},
         {"q":"Quantas sessões foram realizadas?","t":"textocurto"},
         {"q":"Quantas parcelas foram pagas (e o total pago)?","t":"textocurto"}
       ]},
       {"titulo":"Assinatura","campos":[
         {"q":"Assinatura da solicitante","t":"assinatura"}
       ]}
     ]$json$::jsonb);

    -- Termo de Transferência de Pacotes (1 seção, 8 campos)
    INSERT INTO documentos (empresa_id, nome, tipo, descricao, preenchimento, obrigatorio, status, secoes) VALUES
    (v_empresa, 'Termo de Transferência de Pacotes', 'Termo', 'Termo de autorização para transferência de pacote',
     'Opcional', false, 'Ativo',
     $json$[
       {"titulo":"Termo de autorização para transferência de pacote","campos":[
         {"q":"De um lado, Cliente Titular e CPF","t":"textocurto"},
         {"q":"E, de outro lado: Beneficiário(a) e CPF","t":"textocurto"},
         {"q":"O(a) Cliente Titular declara que adquiriu junto à rede o pacote de procedimentos abaixo identificado.","t":"consent"},
         {"q":"Procedimento(s) e quantidade de sessões","t":"textolongo"},
         {"q":"O(a) Cliente Titular autoriza, de forma livre e consciente, a TRANSFERÊNCIA do referido pacote de procedimentos ao(à) Beneficiário(a) acima identificado(a).","t":"consent"},
         {"q":"A rede não se responsabiliza por quaisquer tratativas financeiras entre o(a) Cliente Titular e o(a) Beneficiário(a), sendo a transferência válida apenas quanto ao direito de uso dos serviços contratados.","t":"consent"},
         {"q":"Após a assinatura do presente termo, o(a) Beneficiário(a) passa a ser considerado(a) responsável único(a) pelo uso do pacote, não cabendo ao(à) Cliente Titular posteriores reclamações ou solicitações relacionadas a este contrato.","t":"consent"},
         {"q":"Assinatura do(a) Cliente Titular","t":"assinatura"}
       ]}
     ]$json$::jsonb);

    -- Termo de Troca de Procedimento para Crédito (1 seção)
    INSERT INTO documentos (empresa_id, nome, tipo, descricao, preenchimento, obrigatorio, status, secoes) VALUES
    (v_empresa, 'Termo de Troca de Procedimento para Crédito', 'Termo', 'Termo de troca de procedimento para crédito interno',
     'Opcional', false, 'Ativo',
     $json$[
       {"titulo":"Termo de troca de procedimento para crédito","campos":[
         {"q":"Nome","t":"textocurto"},
         {"q":"CPF","t":"textocurto"},
         {"q":"Procedimento","t":"textocurto"},
         {"q":"Quantas sessões","t":"textocurto"},
         {"q":"Valor da troca","t":"textocurto"},
         {"q":"Por meio do presente TERMO declaro estar ciente da substituição, por mim solicitada, de troca de procedimento(s) a laser contratado(s), conforme pacote originalmente adquirido. Declaro estar ciente de que: a) o valor referente ao(s) procedimento(s) já realizado(s) será descontado do total do pacote adquirido, conforme tabela vigente da unidade; b) o saldo remanescente será convertido em crédito interno, exclusivo para aquisição de outros procedimentos oferecidos pela unidade; c) não haverá devolução em dinheiro, sendo a utilização restrita aos serviços da unidade; d) a troca está sujeita à disponibilidade e às condições técnicas indicadas pelos profissionais da unidade; e) os resultados podem variar conforme o perfil individual de cada pessoa, histórico clínico e adesão às recomendações fornecidas.","t":"consent"},
         {"q":"Assinatura do cliente","t":"assinatura"}
       ]}
     ]$json$::jsonb);

    -- Orientações Pós-Laser (Rascunho, subconjunto de unidades — demonstra status)
    INSERT INTO documentos (empresa_id, nome, tipo, descricao, preenchimento, obrigatorio, status, secoes) VALUES
    (v_empresa, 'Orientações Pós-Laser', 'Termo', 'Orientações de cuidados pós-procedimento a laser',
     'Opcional', false, 'Rascunho',
     $json$[
       {"titulo":"Orientações pós-laser","campos":[
         {"q":"Evite exposição solar por 10 dias antes e depois da sessão","t":"consent"},
         {"q":"Aplique protetor solar diariamente na área tratada","t":"consent"},
         {"q":"Assinatura do cliente","t":"assinatura"}
       ]}
     ]$json$::jsonb);

  END IF;
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK (manual, se necessário):
--   DROP TABLE IF EXISTS documentos, origens_cliente, motivos_cancelamento,
--                        noshow_automacao CASCADE;
-- =============================================================================
