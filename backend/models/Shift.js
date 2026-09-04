// backend/models/Shift.js
const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema(
  {
    zone:        { type: String, required: true }, // display name
    zoneId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', default: null },
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName:    { type: String, required: true },
    userEmail:   { type: String, required: true },
    companyId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    startTime:   { type: Date, required: true },
    endTime:     { type: Date, required: true },
    assignedBy:  { type: String, required: true },
    active:      { type: Boolean, default: true }, // false = ended early
  },
  { timestamps: true }
);

shiftSchema.index({ zone: 1, startTime: 1, endTime: 1 });

module.exports = mongoose.model('Shift', shiftSchema);
