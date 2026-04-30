-- Migration: auth_consumer (TC1-API-03)
-- Cria extensão citext para emails case-insensitive

CREATE EXTENSION IF NOT EXISTS citext;

-- Enums

CREATE TYPE "UserRole" AS ENUM ('consumer', 'company', 'admin');
CREATE TYPE "UserStatus" AS ENUM ('pending_otp', 'active', 'suspended', 'deleted');
CREATE TYPE "SsoProvider" AS ENUM ('google', 'apple');

-- Tabela users

CREATE TABLE "users" (
    "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
    "email"         CITEXT      NOT NULL,
    "password_hash" TEXT,
    "role"          "UserRole"  NOT NULL,
    "status"        "UserStatus" NOT NULL DEFAULT 'pending_otp',
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "deleted_at"    TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- Tabela consumer_profiles

CREATE TABLE "consumer_profiles" (
    "user_id"               UUID        NOT NULL,
    "full_name"             TEXT        NOT NULL,
    "phone"                 TEXT,
    "accepted_lgpd_at"      TIMESTAMPTZ NOT NULL,
    "accepted_lgpd_version" TEXT        NOT NULL,

    CONSTRAINT "consumer_profiles_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "consumer_profiles"
    ADD CONSTRAINT "consumer_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tabela sso_identities

CREATE TABLE "sso_identities" (
    "id"         UUID          NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    UUID          NOT NULL,
    "provider"   "SsoProvider" NOT NULL,
    "subject"    TEXT          NOT NULL,
    "created_at" TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT "sso_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sso_identities_provider_subject_key"
    ON "sso_identities"("provider", "subject");

ALTER TABLE "sso_identities"
    ADD CONSTRAINT "sso_identities_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
