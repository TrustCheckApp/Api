-- Migration: legal_terms_v2 + case_term_acceptances (TC1-API-07)
-- Nota: o modelo LegalTerm legado da Sprint 1 (tabela legal_terms, campos em PT)
-- é preservado. Esta migration cria uma nova tabela legal_terms_v2 para o módulo
-- src/modules/legal-terms com estrutura conforme TC1-API-07.

CREATE TYPE "TermKind" AS ENUM (
  'denuncia',
  'lgpd',
  'termos_uso'
);

CREATE TABLE "legal_terms_v2" (
    "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
    "version"        TEXT        NOT NULL,
    "kind"           "TermKind"  NOT NULL,
    "content"        TEXT        NOT NULL,
    "content_hash"   CHAR(64)    NOT NULL,
    "published_by"   UUID,
    "published_at"   TIMESTAMPTZ,
    "active"         BOOLEAN     NOT NULL DEFAULT TRUE,

    CONSTRAINT "legal_terms_v2_pkey"    PRIMARY KEY ("id"),
    CONSTRAINT "legal_terms_v2_version_kind_unique" UNIQUE ("version", "kind")
);

ALTER TABLE "legal_terms_v2"
    ADD CONSTRAINT "legal_terms_v2_published_by_fkey"
    FOREIGN KEY ("published_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ltv2_kind_active_idx" ON "legal_terms_v2"("kind", "active");

CREATE TABLE "case_term_acceptances" (
    "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
    "case_id"      UUID        NOT NULL,
    "user_id"      UUID        NOT NULL,
    "term_id"      UUID        NOT NULL,
    "term_version" TEXT        NOT NULL,
    "content_hash" CHAR(64)    NOT NULL,
    "accepted_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "ip"           TEXT,
    "user_agent"   TEXT,

    CONSTRAINT "case_term_acceptances_pkey"    PRIMARY KEY ("id"),
    CONSTRAINT "case_term_acceptances_case_id_unique" UNIQUE ("case_id")
);

ALTER TABLE "case_term_acceptances"
    ADD CONSTRAINT "case_term_acceptances_case_id_fkey"
    FOREIGN KEY ("case_id") REFERENCES "cases"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_term_acceptances"
    ADD CONSTRAINT "case_term_acceptances_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "case_term_acceptances"
    ADD CONSTRAINT "case_term_acceptances_term_id_fkey"
    FOREIGN KEY ("term_id") REFERENCES "legal_terms_v2"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "cta_term_accepted_idx"
    ON "case_term_acceptances"("term_id", "accepted_at" DESC);
