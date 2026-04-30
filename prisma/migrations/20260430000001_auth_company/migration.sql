-- Migration: auth_company (TC1-API-04)
-- Cadastro empresarial, claim de perfil e audit log

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "CompanyStatus" AS ENUM ('unclaimed', 'pending_review', 'active', 'suspended');
CREATE TYPE "CompanyProfileRole" AS ENUM ('owner', 'operator');
CREATE TYPE "ClaimStatus" AS ENUM ('pending_review', 'approved', 'rejected');

-- ─── companies ────────────────────────────────────────────────────────────────

CREATE TABLE "companies" (
    "id"          UUID            NOT NULL DEFAULT gen_random_uuid(),
    "cnpj"        CHAR(14)        NOT NULL,
    "legal_name"  TEXT            NOT NULL,
    "trade_name"  TEXT,
    "status"      "CompanyStatus" NOT NULL DEFAULT 'unclaimed',
    "created_at"  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    "updated_at"  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "companies_cnpj_key" ON "companies"("cnpj");

-- ─── company_profiles ─────────────────────────────────────────────────────────

CREATE TABLE "company_profiles" (
    "user_id"    UUID                 NOT NULL,
    "company_id" UUID                 NOT NULL,
    "role"       "CompanyProfileRole" NOT NULL DEFAULT 'owner',
    "created_at" TIMESTAMPTZ          NOT NULL DEFAULT NOW(),

    CONSTRAINT "company_profiles_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "company_profiles"
    ADD CONSTRAINT "company_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "company_profiles"
    ADD CONSTRAINT "company_profiles_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── company_claims ───────────────────────────────────────────────────────────

CREATE TABLE "company_claims" (
    "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
    "company_id"       UUID          NOT NULL,
    "requester_user_id" UUID         NOT NULL,
    "status"           "ClaimStatus" NOT NULL DEFAULT 'pending_review',
    "submitted_at"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "reviewed_at"      TIMESTAMPTZ,
    "reviewed_by"      UUID,
    "rejection_reason" TEXT,

    CONSTRAINT "company_claims_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "company_claims"
    ADD CONSTRAINT "company_claims_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "company_claims"
    ADD CONSTRAINT "company_claims_requester_user_id_fkey"
    FOREIGN KEY ("requester_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── company_claim_documents ──────────────────────────────────────────────────

CREATE TABLE "company_claim_documents" (
    "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
    "claim_id"    UUID        NOT NULL,
    "url"         TEXT        NOT NULL,
    "file_name"   TEXT        NOT NULL,
    "mime_type"   TEXT        NOT NULL,
    "size_bytes"  INTEGER     NOT NULL,
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "company_claim_documents_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "company_claim_documents"
    ADD CONSTRAINT "company_claim_documents_claim_id_fkey"
    FOREIGN KEY ("claim_id") REFERENCES "company_claims"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── audit_logs ───────────────────────────────────────────────────────────────

CREATE TABLE "audit_logs" (
    "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID,
    "action"        TEXT        NOT NULL,
    "entity"        TEXT        NOT NULL,
    "entity_id"     UUID,
    "payload"       JSONB       NOT NULL DEFAULT '{}',
    "ip"            INET,
    "user_agent"    TEXT,
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
