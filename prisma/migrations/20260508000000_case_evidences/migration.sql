-- TC-S1-API-06: camada inicial de MIDIA para evidências de casos

CREATE TABLE IF NOT EXISTS case_evidences (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  uploaded_by_user_id UUID NOT NULL REFERENCES users(id),
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  checksum_sha256 CHAR(64),
  description TEXT,
  storage_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending_upload' CHECK (status IN ('pending_upload', 'uploaded', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS case_evidences_case_created_idx
  ON case_evidences(case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS case_evidences_uploaded_by_idx
  ON case_evidences(uploaded_by_user_id);
