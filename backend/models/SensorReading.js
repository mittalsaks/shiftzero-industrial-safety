const mongoose = require('mongoose');

// Mirrors the exact shape returned by simulator.js generateSensorReading(),
// plus a flexible `metrics` map so any admin-defined metric (not just
// gas/temp) can be stored regardless of industry.
const SensorReadingSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', required: true, index: true },
  zone: { type: String, required: true, index: true }, // display name
  source: { type: String, enum: ['simulated', 'manual'], default: 'simulated' },
  submittedBy: { type: String, default: null }, // team member email, when source = 'manual'
  metrics: { type: mongoose.Schema.Types.Mixed, default: {} }, // { [metricConfig.key]: value }
  // Legacy fixed fields — kept so old readings and any code still reading
  // these directly keep working; simulator.js also mirrors metrics.gasPpm
  // etc. into these for simulated steel-plant-style zones.
  gasPpm: Number,
  tempC: Number,
  trendVelocity: Number,
  riskLevel: Number,
  timestamp: { type: String, required: true }, // stored as ISO string to match simulator output exactly
  // Optional note + attachments on manual status updates (Update Status tab),
  // carried through to the next shift the same way a handover note is.
  note: { type: String, default: null },
  attachments: {
    type: [{ name: String, type: String, dataUrl: String, _id: false }],
    default: [],
  },
}, { versionKey: false });

SensorReadingSchema.index({ zoneId: 1, timestamp: -1 });

module.exports = mongoose.model('SensorReading', SensorReadingSchema);