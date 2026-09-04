import mongoose from 'mongoose';

const inviteSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    code: { type: String, required: true, uppercase: true, trim: true, index: true },
    label: { type: String, default: '', trim: true },
    passwordHash: { type: String, required: true },
    passwordPlain: { type: String, default: '' },
    distributionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Distribution',
      default: null,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assistantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assistantName: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    lastUsedAt: { type: Date },
  },
  { timestamps: true }
);

inviteSchema.index({ tenantId: 1, isActive: 1 });

export const Invite = mongoose.model('Invite', inviteSchema);
