import { createModel } from '../db/model.js';

export const Tenant = createModel({
  table: 'tenants',
  fields: [
    'id',
    'tenantId',
    'name',
    'schoolName',
    'adminName',
    'adminEmail',
    'adminPhone',
    'subscriptionPlan',
    'subscriptionFee',
    'isActive',
    'expiryDate',
    'paystackCustomerCode',
    'paystackReference',
    'lastPaymentAt',
    'joinCode',
    'createdAt',
    'updatedAt',
  ],
  dateFields: ['expiryDate', 'lastPaymentAt', 'createdAt', 'updatedAt'],
  prepare(doc) {
    if (doc.adminEmail) doc.adminEmail = String(doc.adminEmail).toLowerCase().trim();
    if (doc.joinCode) doc.joinCode = String(doc.joinCode).toUpperCase().trim();
  },
  virtuals: {
    isExpired() {
      return this.expiryDate ? new Date(this.expiryDate).getTime() < Date.now() : true;
    },
  },
  methods: {
    hasAccess() {
      return Boolean(this.isActive && this.expiryDate && new Date(this.expiryDate).getTime() > Date.now());
    },
  },
});
