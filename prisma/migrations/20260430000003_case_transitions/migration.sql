-- Migration: case_status_transitions (TC1-API-06)

CREATE TYPE "ActorRole" AS ENUM (
  'system',
  'admin',
  'company',
  'consumer'
);

CREATE TABLE "case_status_transitions" (
    "id"            UUID          NOT NULL DEFAULT gen_random_uuid(),
    "case_id"       UUID          NOT NULL,
    "from_status"   "CaseStatus"  NOT NULL,
    "to_status"     "CaseStatus"  NOT NULL,
    "actor_user_id" UUID,
    "actor_role"    "ActorRole"   NOT NULL,
    "reason"        TEXT,
    "payload"       JSONB,
    "ip"            TEXT,
    "occurred_at"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT "case_status_transitions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "case_status_transitions"
    ADD CONSTRAINT "case_status_transitions_case_id_fkey"
    FOREIGN KEY ("case_id") REFERENCES "cases"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "cst_case_occurred_idx"
    ON "case_status_transitions"("case_id", "occurred_at" DESC);
