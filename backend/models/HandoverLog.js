const mongoose = require('mongoose');

const HandoverLogSchema = new mongoose.Schema({
  zone: { type: String, required: true, index: true },
  text: { type: String, required: true },
  riskLanguageScore: { type: Number, required: true },
  mismatchScore: { type: Number, default: 0 },
  timestamp: { type: String, required: true }
}, { versionKey: false });

module.exports = mongoose.model('HandoverLog', HandoverLogSchema);