-- =============================================================================
-- SCRIPT DE VALIDAÇÃO MANUAL — HOTFIXES 01, 02, 03
-- TrustCheckApp API · Sprint 01
--
-- Como usar:
--   psql $DATABASE_URL -f docs/validate-hotfixes.sql
-- ou via Prisma Studio / DBeaver apontado para trustcheck_e2e
-- =============================================================================

-- ─── PRÉ-CONDIÇÃO ────────────────────────────────────────────────────────────
-- Garante que ao menos 1 login foi realizado para popular a tabela.
-- Execute um login real via API antes de rodar este script.
-- =============================================================================


-- =============================================================================
-- HOTFIX-01 · Sanitização de payload
-- Esperado: NENHUMA linha com palavras-chave sensíveis no payload JSON
-- =============================================================================

\echo ''
\echo '═══ HOTFIX-01: Auditando payloads por dados sensíveis ═══'

-- Deve retornar 0 linhas. Se retornar > 0, HOTFIX-01 está com bug.
SELECT
  id,
  action,
  payload
FROM module_audit_logs
WHERE
  payload::text ILIKE '%password%'
  OR payload::text ILIKE '%passwordhash%'
  OR payload::text ILIKE '%token%'
  OR payload::text ILIKE '%otp%'
  OR payload::text ILIKE '%secret%'
  OR payload::text ILIKE '%privatekey%'
  OR payload::text ILIKE '%refresh%'
LIMIT 20;

\echo 'Resultado acima deve ser vazio (0 linhas) para HOTFIX-01 passar.'


-- =============================================================================
-- HOTFIX-01 · Amostra de payloads sanitizados (inspeção visual)
-- Esperado: Apenas campos não-sensíveis como { method, role } ou {}
-- =============================================================================

\echo ''
\echo '─── Amostra de 10 payloads (inspeção visual) ───'

SELECT
  left(id, 8)   AS id_prefix,
  action,
  entity,
  payload,
  created_at
FROM module_audit_logs
ORDER BY created_at DESC
LIMIT 10;


-- =============================================================================
-- HOTFIX-02 · AUTH_LOGIN em module_audit_logs
-- Esperado: ao menos 1 registro por login executado
-- =============================================================================

\echo ''
\echo '═══ HOTFIX-02: AUTH_LOGIN em module_audit_logs ═══'

SELECT
  count(*)                    AS total_auth_login,
  count(*) FILTER (WHERE action = 'AUTH_LOGIN')         AS login_ok,
  count(*) FILTER (WHERE action = 'AUTH_LOGIN_FAILED')  AS login_failed,
  count(*) FILTER (WHERE action = 'AUTH_LOGOUT')        AS logout
FROM module_audit_logs
WHERE action IN ('AUTH_LOGIN', 'AUTH_LOGIN_FAILED', 'AUTH_LOGOUT');

\echo 'login_ok deve ser >= 1 se ao menos um login foi realizado.'

-- Detalhes do último AUTH_LOGIN
\echo ''
\echo '─── Último AUTH_LOGIN ───'

SELECT
  id,
  actor_user_id,
  action,
  entity,
  entity_id,
  payload,
  ip,
  user_agent,
  created_at
FROM module_audit_logs
WHERE action = 'AUTH_LOGIN'
ORDER BY created_at DESC
LIMIT 1;


-- =============================================================================
-- HOTFIX-03 · Tipo das colunas ip deve ser inet (não text)
-- =============================================================================

\echo ''
\echo '═══ HOTFIX-03: Tipo das colunas ip ═══'

-- Verifica tipo das 3 colunas
SELECT
  table_name,
  column_name,
  data_type,
  udt_name
FROM information_schema.columns
WHERE
  table_schema = 'public'
  AND column_name = 'ip'
  AND table_name IN (
    'module_audit_logs',
    'case_status_transitions',
    'case_term_acceptances'
  )
ORDER BY table_name;

\echo 'Todas as linhas acima devem ter data_type=''USER-DEFINED'' e udt_name=''inet''.'

-- Verifica que índices foram criados
\echo ''
\echo '─── Índices inet criados ───'

SELECT
  indexname,
  tablename,
  indexdef
FROM pg_indexes
WHERE
  tablename IN ('module_audit_logs', 'case_status_transitions')
  AND indexname IN ('mal_ip_idx', 'cst_ip_idx')
ORDER BY tablename;

\echo 'Deve listar 2 índices: mal_ip_idx e cst_ip_idx.'

-- Confirma que tipo inet funciona (cast e operações CIDR)
\echo ''
\echo '─── Teste operacional: SELECT ip FROM module_audit_logs ───'

SELECT
  ip,
  pg_typeof(ip) AS pg_type,
  family(ip)    AS ip_family   -- 4 = IPv4, 6 = IPv6
FROM module_audit_logs
WHERE ip IS NOT NULL
LIMIT 5;

\echo 'pg_type deve ser ''inet''. ip_family deve ser 4 ou 6.'

-- Registros com ip NULL (dados que eram inválidos antes da migration)
\echo ''
\echo '─── Registros com ip=NULL (eram inválidos antes do backfill) ───'

SELECT count(*) AS ip_null_count
FROM module_audit_logs
WHERE ip IS NULL;

\echo 'Número aceitável: 0 se nenhum IP inválido existia, ou > 0 se haviam strings lixo.'


-- =============================================================================
-- RESUMO FINAL
-- =============================================================================

\echo ''
\echo '═══════════════════════════════════════════════════════════'
\echo 'RESUMO — execute manualmente e marque cada item:'
\echo '  [ ] HOTFIX-01: payload sensível = 0 linhas'
\echo '  [ ] HOTFIX-02: auth_login >= 1 (após login realizado)'
\echo '  [ ] HOTFIX-03: udt_name=inet nas 3 tabelas + 2 índices'
\echo '═══════════════════════════════════════════════════════════'
