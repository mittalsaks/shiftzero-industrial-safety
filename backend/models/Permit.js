const mongoose = require('mongoose');

// `id` is the custom PTW-00X string your frontend already expects.
// Mongo still generates its own _id internally, but routes/UI never see it.
const PermitSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true }, // e.g. 'PTW-001'
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', required: true, index: true },
  zone: { type: String, required: true, index: true }, // display name
  type: { type: String, required: true },
  issuedAt: { type: String, required: true },
  issuedBy: { type: String, required: true },
  description: { type: String, required: true },
  active: { type: Boolean, default: true }
}, { versionKey: false });

module.exports = mongoose.model('Permit', PermitSchema);