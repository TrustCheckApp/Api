-- Migration: ip_to_inet
-- Migra colunas `ip` TEXT → INET nas tabelas:
--   case_status_transitions, module_audit_logs, case_term_acceptances
--
-- Estratégia:
--   1. Cria coluna temporária `ip_inet inet null`
--   2. Backfill: converte valores TEXT válidos para inet; inválidos viram NULL
--   3. Drop da coluna original TEXT
--   4. Rename da coluna temporária para `ip`
--   5. Adiciona índices em case_status_transitions e module_audit_logs
--
-- ROLLBACK SEGURO: não há DROP destrutivo sem backfill prévio.
-- IPs inválidos (ex: "unknown", concatenações de XFF) viram NULL e
-- podem ser investigados via: SELECT * FROM ... WHERE ip IS NULL AND created_at > ...

-- ─── case_status_transitions ─────────────────────────────────────────────────

ALTER TABLE case_status_transitions
  ADD COLUMN ip_inet inet;

UPDATE case_status_transitions
SET ip_inet = CASE
  WHEN ip IS NULL THEN NULL
  -- IPv4 simples: 4 octetos numéricos
  WHEN ip ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' THEN
    (CASE WHEN ip::text ~ '^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$'
          THEN ip::inet
          ELSE NULL END)
  -- IPv4-mapped IPv6 (::ffff:x.x.x.x) — extrai a parte IPv4
  WHEN ip ILIKE '::ffff:%' THEN
    (SELECT CASE WHEN net.isip IS NOT NULL THEN (substring(ip from 8))::inet ELSE NULL END
     FROM (SELECT inet(substring(ip from 8)) AS isip) sub)
  -- IPv6 puro: contém ':' e sem espaços nem vírgulas (indica lista XFF)
  WHEN ip ~ ':' AND ip !~ '[, ]' THEN
    (SELECT CASE WHEN net IS NOT NULL THEN net ELSE NULL END
     FROM (SELECT (ip::inet) AS net) sub)
  ELSE NULL
END
WHERE ip IS NOT NULL;

ALTER TABLE case_status_transitions
  DROP COLUMN ip;

ALTER TABLE case_status_transitions
  RENAME COLUMN ip_inet TO ip;

CREATE INDEX IF NOT EXISTS cst_ip_idx
  ON case_status_transitions (ip);

-- ─── module_audit_logs ───────────────────────────────────────────────────────

ALTER TABLE module_audit_logs
  ADD COLUMN ip_inet inet;

UPDATE module_audit_logs
SET ip_inet = CASE
  WHEN ip IS NULL THEN NULL
  WHEN ip ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' THEN
    (CASE WHEN ip::text ~ '^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$'
          THEN ip::inet
          ELSE NULL END)
  WHEN ip ILIKE '::ffff:%' THEN
    (SELECT CASE WHEN net.isip IS NOT NULL THEN (substring(ip from 8))::inet ELSE NULL END
     FROM (SELECT inet(substring(ip from 8)) AS isip) sub)
  WHEN ip ~ ':' AND ip !~ '[, ]' THEN
    (SELECT CASE WHEN net IS NOT NULL THEN net ELSE NULL END
     FROM (SELECT (ip::inet) AS net) sub)
  ELSE NULL
END
WHERE ip IS NOT NULL;

ALTER TABLE module_audit_logs
  DROP COLUMN ip;

ALTER TABLE module_audit_logs
  RENAME COLUMN ip_inet TO ip;

CREATE INDEX IF NOT EXISTS mal_ip_idx
  ON module_audit_logs (ip);

-- ─── case_term_acceptances ───────────────────────────────────────────────────

ALTER TABLE case_term_acceptances
  ADD COLUMN ip_inet inet;

UPDATE case_term_acceptances
SET ip_inet = CASE
  WHEN ip IS NULL THEN NULL
  WHEN ip ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' THEN
    (CASE WHEN ip::text ~ '^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$'
          THEN ip::inet
          ELSE NULL END)
  WHEN ip ILIKE '::ffff:%' THEN
    (SELECT CASE WHEN net.isip IS NOT NULL THEN (substring(ip from 8))::inet ELSE NULL END
     FROM (SELECT inet(substring(ip from 8)) AS isip) sub)
  WHEN ip ~ ':' AND ip !~ '[, ]' THEN
    (SELECT CASE WHEN net IS NOT NULL THEN net ELSE NULL END
     FROM (SELECT (ip::inet) AS net) sub)
  ELSE NULL
END
WHERE ip IS NOT NULL;

ALTER TABLE case_term_acceptances
  DROP COLUMN ip;

ALTER TABLE case_term_acceptances
  RENAME COLUMN ip_inet TO ip;
