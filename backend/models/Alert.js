const mongoose = require('mongoose');

// Mirrors the exact zoneState.alert object built in server.js
const AlertSchema = new mongoose.Schema({
  zone: { type: String, required: true, index: true },
  level: { type: String, default: 'HIGH' },
  message: { type: String, required: true },
  evidence: { type: mongoose.Schema.Types.Mixed, default: {} }, // { quote, sensorTrend }
  matchedIncidents: { type: [mongoose.Schema.Types.Mixed], default: [] },
  recommendation: { type: String, default: '' },
  permitConflicts: { type: [mongoose.Schema.Types.Mixed], default: [] },
  timestamp: { type: String, required: true }
}, { versionKey: false });

module.exports = mongoose.model('Alert', AlertSchema);