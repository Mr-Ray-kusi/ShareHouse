import bcrypt from 'bcryptjs';
import { createModel } from '../db/model.js';

export const User = createModel({
  table: 'users',
  fields: [
    'id',
    'tenantId',
    'name',
    'email',
    'phone',
    'passwordHash',
    'role',
    'isActive',
    'inviteId',
    'refreshTokens',
    'lastLogin',
    'createdAt',
    'updatedAt',
  ],
  uuidFields: ['inviteId'],
  dateFields: ['lastLogin', 'createdAt', 'updatedAt'],
  jsonFields: ['refreshTokens'],
  prepare(doc) {
    if (doc.email) doc.email = String(doc.email).toLowerCase().trim();
    if (doc.email === '') doc.email = null;
    if (!doc.refreshTokens) doc.refreshTokens = [];
  },
  statics: {
    hashPassword(plain) {
      return bcrypt.hash(plain, 12);
    },
  },
  methods: {
    comparePassword(plain) {
      return bcrypt.compare(plain, this.passwordHash);
    },
    toSafeJSON() {
      return {
        id: String(this.id || this._id),
        tenantId: this.tenantId,
        name: this.name,
        email: this.email || null,
        phone: this.phone || '',
        role: this.role,
        isActive: this.isActive,
        lastLogin: this.lastLogin,
        createdAt: this.createdAt,
      };
    },
  },
});
