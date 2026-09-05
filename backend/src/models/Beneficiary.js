import { createModel } from '../db/model.js';

export const Beneficiary = createModel({
  table: 'beneficiaries',
  fields: [
    'id',
    'tenantId',
    'distributionId',
    'studentIndex',
    'fullName',
    'level',
    'phone',
    'sheetRow',
    'searchText',
    'createdAt',
    'updatedAt',
  ],
  uuidFields: ['distributionId'],
  dateFields: ['createdAt', 'updatedAt'],
  jsonFields: ['sheetRow'],
  prepare(doc) {
    if (doc.studentIndex) doc.studentIndex = String(doc.studentIndex).trim().toUpperCase();
    if (!doc.sheetRow) doc.sheetRow = {};
  },
});
