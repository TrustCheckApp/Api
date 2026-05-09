import { authMocks } from './auth';
import { casesMocks } from './cases';

export { authMocks } from './auth';
export { casesMocks } from './cases';

export const allMocks = {
  ...authMocks,
  ...casesMocks,
};
