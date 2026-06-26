const mongoose = require('mongoose');

const HandoverLogSchema = new mongoose.Schema({
  zone:              { type: String, required: true, index: true },
  text:              { type: String, required: true },
  riskLanguageScore: { type: Number, required: true },
  mismatchScore:     { type: Number, default: 0 },
  timestamp:         { type: String, required: true },
  submittedBy:       { type: String, default: null },
  submittedByName:   { type: String, default: null },
  userId:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { versionKey: false });

module.exports = mongoose.model('HandoverLog', HandoverLogSchema);