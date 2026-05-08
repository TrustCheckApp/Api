import { ActorRole, CaseStatus } from '@prisma/client';

export const CASE_STREAM = 'cases';
export const CASE_STATUS_CHANGED_V1 = 'case.status.changed.v1';

export interface CaseStatusChangedPayload {
  caseId: string;
  fromStatus: CaseStatus;
  toStatus: CaseStatus;
  actorRole: ActorRole;
  transitionId: string;
  occurredAt: string;
}
