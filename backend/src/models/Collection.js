import mongoose from 'mongoose';

const collectionSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    distributionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distribution',
      required: true,
      index: true,
    },
    beneficiaryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Beneficiary',
      required: true,
    },
    assistantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    studentIndex: { type: String, required: true },
    beneficiaryName: { type: String, required: true },
    assistantName: { type: String, required: true },
    collectedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

collectionSchema.index({ distributionId: 1, beneficiaryId: 1 }, { unique: true });
collectionSchema.index({ tenantId: 1, collectedAt: -1 });
collectionSchema.index({ tenantId: 1, distributionId: 1, collectedAt: -1 });

export const Collection = mongoose.model('Collection', collectionSchema);
