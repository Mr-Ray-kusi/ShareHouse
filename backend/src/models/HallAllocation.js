import { createModel } from '../db/model.js';

export const HallAllocation = createModel({
  table: 'hall_allocations',
  fields: [
    'id',
    'tenantId',
    'name',
    'assignmentColumn',
    'assignmentValue',
    'createdBy',
    'createdAt',
    'updatedAt',
  ],
  uuidFields: ['createdBy'],
  dateFields: ['createdAt', 'updatedAt'],
  prepare(doc) {
    if (doc.name) doc.name = String(doc.name).trim();
    if (doc.assignmentColumn) doc.assignmentColumn = String(doc.assignmentColumn).trim();
    if (doc.assignmentValue) doc.assignmentValue = String(doc.assignmentValue).trim();
  },
});
