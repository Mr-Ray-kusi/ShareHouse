import { createModel } from '../db/model.js';

export const PorterInvite = createModel({
  table: 'porter_invites',
  fields: [
    'id',
    'tenantId',
    'code',
    'label',
    'passwordHash',
    'passwordPlain',
    'createdBy',
    'porterId',
    'porterName',
    'isActive',
    'lastUsedAt',
    'createdAt',
    'updatedAt',
  ],
  uuidFields: ['createdBy', 'porterId'],
  dateFields: ['lastUsedAt', 'createdAt', 'updatedAt'],
  prepare(doc) {
    if (doc.code) doc.code = String(doc.code).toUpperCase().trim();
  },
});
