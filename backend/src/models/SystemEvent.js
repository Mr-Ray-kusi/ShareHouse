import { createModel } from '../db/model.js';

export const SystemEvent = createModel({
  table: 'system_events',
  fields: [
    'id',
    'pillar',
    'name',
    'path',
    'method',
    'status',
    'durationMs',
    'value',
    'message',
    'metric',
    'term',
    'tenantId',
    'role',
    'device',
    'browser',
    'channel',
    'country',
    'createdAt',
    'updatedAt',
  ],
  dateFields: ['createdAt', 'updatedAt'],
});
