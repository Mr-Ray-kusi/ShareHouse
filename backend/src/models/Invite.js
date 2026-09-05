import { createModel } from '../db/model.js';

export const Invite = createModel({
  table: 'invites',
  fields: [
    'id',
    'tenantId',
    'code',
    'label',
    'passwordHash',
    'passwordPlain',
    'distributionId',
    'createdBy',
    'assistantId',
    'assistantName',
    'isActive',
    'lastUsedAt',
    'createdAt',
    'updatedAt',
  ],
  uuidFields: ['distributionId', 'createdBy', 'assistantId'],
  dateFields: ['lastUsedAt', 'createdAt', 'updatedAt'],
  prepare(doc) {
    if (doc.code) doc.code = String(doc.code).toUpperCase().trim();
  },
});
