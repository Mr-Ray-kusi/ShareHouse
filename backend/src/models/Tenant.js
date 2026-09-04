import mongoose from 'mongoose';

const tenantSchema = new mongoose.Schema(
  {
    tenantId: { type: String, unique: true, required: true },
    name: { type: String, required: true, trim: true },
    schoolName: { type: String, required: true, trim: true },
    adminName: { type: String, required: true, trim: true },
    adminEmail: { type: String, required: true, lowercase: true, trim: true },
    adminPhone: { type: String, required: true, trim: true },
    subscriptionPlan: { type: String, enum: ['hall', 'src'], required: true },
    subscriptionFee: { type: Number, required: true },
    isActive: { type: Boolean, default: false },
    expiryDate: { type: Date, required: true },
    paystackCustomerCode: { type: String, default: '' },
    paystackReference: { type: String, default: '' },
    lastPaymentAt: { type: Date },
    joinCode: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

tenantSchema.virtual('isExpired').get(function isExpired() {
  return this.expiryDate ? this.expiryDate.getTime() < Date.now() : true;
});

tenantSchema.methods.hasAccess = function hasAccess() {
  return this.isActive && this.expiryDate && this.expiryDate.getTime() > Date.now();
};

export const Tenant = mongoose.model('Tenant', tenantSchema);
