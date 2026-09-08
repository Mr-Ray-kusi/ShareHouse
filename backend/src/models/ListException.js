import { createModel } from '../db/model.js';

export const ListException = createModel({
  table: 'list_exceptions',
  fields: [
    'id',
    'tenantId',
    'distributionId',
    'status',
    'studentIndex',
    'fullName',
    'level',
    'phone',
    'reason',
    'photoFileName',
    'photoMimeType',
    'requestedBy',
    'requestedByName',
    'reviewedBy',
    'reviewedByName',
    'reviewNote',
    'beneficiaryId',
    'markedOnApprove',
    'createdAt',
    'updatedAt',
  ],
  uuidFields: ['distributionId', 'requestedBy', 'reviewedBy', 'beneficiaryId'],
  dateFields: ['createdAt', 'updatedAt'],
  prepare(doc) {
    if (doc.studentIndex) doc.studentIndex = String(doc.studentIndex).trim().toUpperCase();
    if (doc.fullName) doc.fullName = String(doc.fullName).trim();
  },
});
