import { createModel } from '../db/model.js';

export const Occupant = createModel({
  table: 'occupants',
  fields: [
    'id',
    'tenantId',
    'roomId',
    'roomNumber',
    'fullName',
    'studentIndex',
    'phone',
    'cohort',
    'searchText',
    'isActive',
    'createdAt',
    'updatedAt',
  ],
  uuidFields: ['roomId'],
  dateFields: ['createdAt', 'updatedAt'],
  prepare(doc) {
    if (doc.roomNumber) doc.roomNumber = String(doc.roomNumber).trim().toUpperCase();
    if (doc.studentIndex) doc.studentIndex = String(doc.studentIndex).trim().toUpperCase();
    if (doc.fullName) doc.fullName = String(doc.fullName).trim();
    if (doc.cohort && !['fresher', 'continuing'].includes(doc.cohort)) doc.cohort = 'continuing';
  },
});
