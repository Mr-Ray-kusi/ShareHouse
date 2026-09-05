import { createModel } from '../db/model.js';

export const Collection = createModel({
  table: 'collections',
  fields: [
    'id',
    'tenantId',
    'distributionId',
    'beneficiaryId',
    'assistantId',
    'studentIndex',
    'beneficiaryName',
    'assistantName',
    'collectedAt',
    'createdAt',
    'updatedAt',
  ],
  uuidFields: ['distributionId', 'beneficiaryId', 'assistantId'],
  dateFields: ['collectedAt', 'createdAt', 'updatedAt'],
});
