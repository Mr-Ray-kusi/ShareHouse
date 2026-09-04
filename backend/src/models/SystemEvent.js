import mongoose from 'mongoose';

const systemEventSchema = new mongoose.Schema(
  {
    pillar: {
      type: String,
      enum: ['health', 'behavior', 'funnel', 'audience'],
      default: 'health',
      index: true,
    },
    name: { type: String, required: true, index: true },
    path: { type: String, default: '' },
    method: { type: String, default: '' },
    status: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    value: { type: Number, default: 0 },
    message: { type: String, default: '' },
    metric: { type: String, default: '' },
    term: { type: String, default: '' },
    tenantId: { type: String, default: '', index: true },
    role: { type: String, default: '' },
    device: { type: String, default: '' },
    browser: { type: String, default: '' },
    channel: { type: String, default: '' },
    country: { type: String, default: '' },
  },
  { timestamps: true }
);

systemEventSchema.index({ createdAt: -1 });
systemEventSchema.index({ name: 1, createdAt: -1 });

export const SystemEvent = mongoose.model('SystemEvent', systemEventSchema);
