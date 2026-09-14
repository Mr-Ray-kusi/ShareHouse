import { createModel } from '../db/model.js';

export const Room = createModel({
  table: 'rooms',
  fields: [
    'id',
    'tenantId',
    'roomNumber',
    'keyStatus',
    'outOccupantId',
    'outOccupantName',
    'outStudentIndex',
    'outStaffId',
    'outStaffName',
    'outShift',
    'outAt',
    'createdAt',
    'updatedAt',
  ],
  uuidFields: ['outOccupantId', 'outStaffId'],
  dateFields: ['outAt', 'createdAt', 'updatedAt'],
  prepare(doc) {
    if (doc.roomNumber) doc.roomNumber = String(doc.roomNumber).trim().toUpperCase();
  },
});
