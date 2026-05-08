/**
 * @file audit-actions.const.ts
 * @description Constantes de action para module_audit_logs.
 *
 * ## Regra para adicionar novas actions
 * - PR separado com label `security` ou `audit`.
 * - Revisão de segundo engenheiro.
 * - Atualizar testes relevantes.
 * - Referenciar o ticket no commit.
 */
export const AuditAction = {
  AUTH_LOGIN: 'AUTH_LOGIN',
  AUTH_LOGIN_FAILED: 'AUTH_LOGIN_FAILED',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  CONSUMER_REGISTER_INITIATED: 'CONSUMER_REGISTER_INITIATED',
  COMPANY_REGISTER_INITIATED: 'COMPANY_REGISTER_INITIATED',
  COMPANY_CLAIM_SUBMITTED: 'COMPANY_CLAIM_SUBMITTED',
  COMPANY_CLAIM_APPROVED: 'COMPANY_CLAIM_APPROVED',
  COMPANY_CLAIM_REJECTED: 'COMPANY_CLAIM_REJECTED',
  CASE_STATUS_TRANSITION: 'CASE_STATUS_TRANSITION',
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];
