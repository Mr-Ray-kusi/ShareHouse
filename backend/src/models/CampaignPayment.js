import { createModel } from '../db/model.js';

export const CampaignPayment = createModel({
  table: 'campaign_payments',
  fields: [
    'id',
    'tenantId',
    'distributionId',
    'reference',
    'studentCount',
    'amount',
    'currency',
    'paidAt',
    'createdAt',
    'updatedAt',
  ],
  uuidFields: ['distributionId'],
  dateFields: ['paidAt', 'createdAt', 'updatedAt'],
});
