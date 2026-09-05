import { createModel } from '../db/model.js';

export const SheetUpload = createModel({
  table: 'sheet_uploads',
  fields: [
    'id',
    'tenantId',
    'tenantName',
    'schoolName',
    'distributionId',
    'distributionTitle',
    'originalFileName',
    'storedFileName',
    'mimeType',
    'size',
    'uploadedBy',
    'createdAt',
    'updatedAt',
  ],
  uuidFields: ['distributionId', 'uploadedBy'],
  dateFields: ['createdAt', 'updatedAt'],
});
