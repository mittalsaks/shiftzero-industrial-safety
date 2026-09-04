const mongoose = require('mongoose');

// Mirrors the exact zoneState.alert object built in server.js
const AlertSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', required: true, index: true },
  zone: { type: String, required: true, index: true }, // display name, kept for back-compat / fast reads
  level: { type: String, default: 'HIGH' },
  message: { type: String, required: true },
  evidence: { type: mongoose.Schema.Types.Mixed, default: {} }, // { quote, sensorTrend }
  matchedIncidents: { type: [mongoose.Schema.Types.Mixed], default: [] },
  recommendation: { type: String, default: '' },
  permitConflicts: { type: [mongoose.Schema.Types.Mixed], default: [] },
  timestamp: { type: String, required: true }
}, { versionKey: false });

module.exports = mongoose.model('Alert', AlertSchema);