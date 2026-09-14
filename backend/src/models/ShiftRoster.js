import { createModel } from '../db/model.js';

export const ShiftRoster = createModel({
  table: 'shift_rosters',
  fields: [
    'id',
    'tenantId',
    'rosterDate',
    'morningPorterIds',
    'eveningPorterIds',
    'createdBy',
    'createdAt',
    'updatedAt',
  ],
  uuidFields: ['createdBy'],
  dateFields: ['createdAt', 'updatedAt'],
  jsonFields: ['morningPorterIds', 'eveningPorterIds'],
  prepare(doc) {
    if (!Array.isArray(doc.morningPorterIds)) doc.morningPorterIds = [];
    if (!Array.isArray(doc.eveningPorterIds)) doc.eveningPorterIds = [];
  },
});
