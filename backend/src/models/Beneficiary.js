import mongoose from 'mongoose';

const beneficiarySchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    distributionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distribution',
      required: true,
      index: true,
    },
    studentIndex: { type: String, required: true, trim: true, uppercase: true },
    fullName: { type: String, required: true, trim: true },
    level: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    sheetRow: { type: mongoose.Schema.Types.Mixed, default: {} },
    searchText: { type: String, default: '', index: true },
  },
  { timestamps: true }
);

beneficiarySchema.index(
  { tenantId: 1, distributionId: 1, studentIndex: 1 },
  { unique: true }
);
beneficiarySchema.index({ tenantId: 1, distributionId: 1, searchText: 1 });

export const Beneficiary = mongoose.model('Beneficiary', beneficiarySchema);
