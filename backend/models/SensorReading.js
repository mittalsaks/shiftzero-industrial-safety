const mongoose = require('mongoose');

// Mirrors the exact shape returned by simulator.js generateSensorReading()
const SensorReadingSchema = new mongoose.Schema({
  zone: { type: String, required: true, index: true },
  gasPpm: Number,
  tempC: Number,
  trendVelocity: Number,
  riskLevel: Number,
  timestamp: { type: String, required: true } // stored as ISO string to match simulator output exactly
}, { versionKey: false });

SensorReadingSchema.index({ zone: 1, timestamp: -1 });

module.exports = mongoose.model('SensorReading', SensorReadingSchema);