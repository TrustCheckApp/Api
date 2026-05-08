export const MAX_EVIDENCE_SIZE_BYTES = 20 * 1024 * 1024;

export const ALLOWED_EVIDENCE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'audio/mpeg',
  'audio/aac',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export type EvidenceMimeType = (typeof ALLOWED_EVIDENCE_MIME_TYPES)[number];

export const ALLOWED_EVIDENCE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'mp4',
  'mov',
  'mp3',
  'aac',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
] as const;
