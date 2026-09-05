import { createModel } from '../db/model.js';

export const Distribution = createModel({
  table: 'distributions',
  fields: [
    'id',
    'tenantId',
    'title',
    'description',
    'itemName',
    'status',
    'startDate',
    'endDate',
    'createdBy',
    'beneficiaryCount',
    'receivedCount',
    'sheetHeaders',
    'originalFileName',
    'storedFileName',
    'createdAt',
    'updatedAt',
  ],
  uuidFields: ['createdBy'],
  dateFields: ['startDate', 'endDate', 'createdAt', 'updatedAt'],
  arrayFields: ['sheetHeaders'],
  virtuals: {
    pendingCount() {
      return Math.max(0, (this.beneficiaryCount || 0) - (this.receivedCount || 0));
    },
    percentComplete() {
      if (!this.beneficiaryCount) return 0;
      return Math.round((this.receivedCount / this.beneficiaryCount) * 100);
    },
  },
});
