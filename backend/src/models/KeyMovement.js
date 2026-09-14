import { createModel } from '../db/model.js';

export const KeyMovement = createModel({
  table: 'key_movements',
  fields: [
    'id',
    'tenantId',
    'roomId',
    'roomNumber',
    'occupantId',
    'studentName',
    'studentIndex',
    'action',
    'staffId',
    'staffName',
    'shift',
    'note',
    'createdAt',
    'updatedAt',
  ],
  uuidFields: ['roomId', 'occupantId', 'staffId'],
  dateFields: ['createdAt', 'updatedAt'],
});
