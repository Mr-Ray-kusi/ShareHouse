import mongoose from 'mongoose';

const distributionSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    itemName: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['draft', 'active', 'completed', 'cancelled'],
      default: 'draft',
      index: true,
    },
    startDate: { type: Date },
    endDate: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    beneficiaryCount: { type: Number, default: 0 },
    receivedCount: { type: Number, default: 0 },
    sheetHeaders: { type: [String], default: [] },
    originalFileName: { type: String, default: '' },
    storedFileName: { type: String, default: '' },
  },
  { timestamps: true }
);

distributionSchema.index({ tenantId: 1, status: 1 });
distributionSchema.index({ tenantId: 1, createdAt: -1 });

distributionSchema.virtual('pendingCount').get(function pendingCount() {
  return Math.max(0, (this.beneficiaryCount || 0) - (this.receivedCount || 0));
});

distributionSchema.virtual('percentComplete').get(function percentComplete() {
  if (!this.beneficiaryCount) return 0;
  return Math.round((this.receivedCount / this.beneficiaryCount) * 100);
});

distributionSchema.set('toJSON', { virtuals: true });
distributionSchema.set('toObject', { virtuals: true });

export const Distribution = mongoose.model('Distribution', distributionSchema);
