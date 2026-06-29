-- SAC J.02 — Tempo médio de resolução: grava o timestamp de conclusão do chamado.
-- Aditivo e idempotente. Preenchido por moverTicketFase/atualizarChamado ao cair em "Concluído".
ALTER TABLE sac_tickets ADD COLUMN IF NOT EXISTS concluido_em timestamptz;
