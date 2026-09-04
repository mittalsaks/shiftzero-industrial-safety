const mongoose = require('mongoose');

const HandoverLogSchema = new mongoose.Schema({
  companyId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  zoneId:            { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', required: true, index: true },
  zone:              { type: String, required: true, index: true }, // display name
  text:              { type: String, required: true },
  riskLanguageScore: { type: Number, required: true },
  mismatchScore:     { type: Number, default: 0 },
  timestamp:         { type: String, required: true },
  submittedBy:       { type: String, default: null },
  submittedByName:   { type: String, default: null },
  userId:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Optional photos/documents the outgoing shift attaches to a handover note
  // (e.g. a photo of a leak, an inspection PDF) so the incoming shift has
  // them on hand. Stored inline as base64 data URLs — fine at this scale,
  // no separate object storage needed.
  attachments: {
    type: [{ name: String, type: String, dataUrl: String, _id: false }],
    default: [],
  },
}, { versionKey: false });

module.exports = mongoose.model('HandoverLog', HandoverLogSchema);