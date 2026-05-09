import { paths } from '../types';

export const casesMocks = {
  'POST /cases': {
    response: {
      status: 201,
      body: {
        id: 'mock-case-id-123',
        status: 'draft',
        createdAt: new Date().toISOString(),
      } as paths['/cases']['post']['responses'][201]['content']['application/json'],
    },
  },
  'GET /cases/{id}': {
    response: {
      status: 200,
      body: {
        id: 'mock-case-id-123',
        status: 'draft',
        createdAt: new Date().toISOString(),
      } as paths['/cases/{id}']['get']['responses'][200]['content']['application/json'],
    },
  },
  'GET /cases/{id}/audit': {
    response: {
      status: 200,
      body: [
        {
          id: 'mock-audit-event-1',
          action: 'created',
          actor: 'user-123',
          timestamp: new Date().toISOString(),
        },
      ] as paths['/cases/{id}/audit']['get']['responses'][200]['content']['application/json'],
    },
  },
  'POST /cases/{id}/moderation/start': {
    response: {
      status: 200,
      body: {
        id: 'mock-case-id-123',
        status: 'pending_moderation',
        createdAt: new Date().toISOString(),
      } as paths['/cases/{id}/moderation/start']['post']['responses'][200]['content']['application/json'],
    },
  },
  'POST /cases/{id}/moderation/approve': {
    response: {
      status: 200,
      body: {
        id: 'mock-case-id-123',
        status: 'published',
        createdAt: new Date().toISOString(),
      } as paths['/cases/{id}/moderation/approve']['post']['responses'][200]['content']['application/json'],
    },
  },
  'POST /cases/{id}/moderation/reject': {
    response: {
      status: 200,
      body: {
        id: 'mock-case-id-123',
        status: 'draft',
        createdAt: new Date().toISOString(),
      } as paths['/cases/{id}/moderation/reject']['post']['responses'][200]['content']['application/json'],
    },
  },
  'POST /cases/{id}/notify-company': {
    response: {
      status: 200,
      body: {
        id: 'mock-case-id-123',
        status: 'notified',
        createdAt: new Date().toISOString(),
      } as paths['/cases/{id}/notify-company']['post']['responses'][200]['content']['application/json'],
    },
  },
  'POST /cases/{id}/company/respond': {
    response: {
      status: 200,
      body: {
        id: 'mock-case-id-123',
        status: 'responded',
        createdAt: new Date().toISOString(),
      } as paths['/cases/{id}/company/respond']['post']['responses'][200]['content']['application/json'],
    },
  },
  'POST /cases/{id}/resolve': {
    response: {
      status: 200,
      body: {
        id: 'mock-case-id-123',
        status: 'resolved',
        createdAt: new Date().toISOString(),
      } as paths['/cases/{id}/resolve']['post']['responses'][200]['content']['application/json'],
    },
  },
  'POST /cases/{id}/close-unresolved': {
    response: {
      status: 200,
      body: {
        id: 'mock-case-id-123',
        status: 'closed_unresolved',
        createdAt: new Date().toISOString(),
      } as paths['/cases/{id}/close-unresolved']['post']['responses'][200]['content']['application/json'],
    },
  },
};
