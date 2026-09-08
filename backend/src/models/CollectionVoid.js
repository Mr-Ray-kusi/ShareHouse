import { createModel } from '../db/model.js';

export const CollectionVoid = createModel({
  table: 'collection_voids',
  fields: [
    'id',
    'tenantId',
    'distributionId',
    'beneficiaryId',
    'collectionId',
    'studentIndex',
    'beneficiaryName',
    'originalAssistantId',
    'originalAssistantName',
    'originalCollectedAt',
    'voidedBy',
    'voidedByName',
    'reason',
    'createdAt',
    'updatedAt',
  ],
  uuidFields: ['distributionId', 'beneficiaryId', 'collectionId', 'originalAssistantId', 'voidedBy'],
  dateFields: ['originalCollectedAt', 'createdAt', 'updatedAt'],
});
