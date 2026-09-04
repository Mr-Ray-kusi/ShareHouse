import mongoose from 'mongoose';

const sheetUploadSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    tenantName: { type: String, default: '' },
    schoolName: { type: String, default: '' },
    distributionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distribution',
      required: true,
      index: true,
    },
    distributionTitle: { type: String, default: '' },
    originalFileName: { type: String, required: true },
    storedFileName: { type: String, required: true },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

sheetUploadSchema.index({ createdAt: -1 });

export const SheetUpload = mongoose.model('SheetUpload', sheetUploadSchema);
