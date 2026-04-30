-- Migration: cases (TC1-API-05)
-- Entidade Caso com public_id TC-YYYY-NNNNNN, sequência Postgres e trigger

-- ─── Sequence para public_id ──────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS "case_sequence" START 1;

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "CaseStatus" AS ENUM (
  'ENVIADO',
  'EM_MODERACAO',
  'PUBLICADO',
  'AGUARDANDO_RESPOSTA_EMPRESA',
  'EM_NEGOCIACAO',
  'RESOLVIDO',
  'NAO_RESOLVIDO'
);

CREATE TYPE "ExperienceType" AS ENUM (
  'reclamacao',
  'denuncia',
  'elogio',
  'duvida_resolvida'
);

CREATE TYPE "CaseCategory" AS ENUM (
  'imoveis',
  'servicos',
  'ecommerce',
  'financeiro',
  'saude',
  'educacao',
  'outro'
);

-- ─── cases ────────────────────────────────────────────────────────────────────

CREATE TABLE "cases" (
    "id"               UUID             NOT NULL DEFAULT gen_random_uuid(),
    "public_id"        TEXT             UNIQUE,
    "status"           "CaseStatus"     NOT NULL DEFAULT 'ENVIADO',
    "consumer_user_id" UUID             NOT NULL,
    "company_id"       UUID             NOT NULL,
    "experience_type"  "ExperienceType" NOT NULL,
    "category"         "CaseCategory"   NOT NULL,
    "description"      TEXT             NOT NULL,
    "monetary_value"   NUMERIC(12, 2),
    "occurred_at"      DATE             NOT NULL,
    "submitted_at"     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    "published_at"     TIMESTAMPTZ,
    "closed_at"        TIMESTAMPTZ,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "cases"
    ADD CONSTRAINT "cases_consumer_user_id_fkey"
    FOREIGN KEY ("consumer_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cases"
    ADD CONSTRAINT "cases_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Índices ──────────────────────────────────────────────────────────────────

CREATE INDEX "cases_consumer_submitted_idx"
    ON "cases"("consumer_user_id", "submitted_at" DESC);

CREATE INDEX "cases_company_status_idx"
    ON "cases"("company_id", "status");

CREATE INDEX "cases_status_submitted_idx"
    ON "cases"("status", "submitted_at" DESC);

-- ─── Trigger: auto-gerar public_id ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_case_public_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.public_id IS NULL THEN
    NEW.public_id := format(
      'TC-%s-%s',
      EXTRACT(YEAR FROM NOW())::TEXT,
      LPAD(NEXTVAL('case_sequence')::TEXT, 6, '0')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "cases_public_id_trigger"
BEFORE INSERT ON "cases"
FOR EACH ROW EXECUTE FUNCTION generate_case_public_id();
