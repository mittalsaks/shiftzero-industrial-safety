// backend/models/Invite.js
const mongoose = require('mongoose');

const inviteSchema = new mongoose.Schema(
  {
    token:     { type: String, required: true, unique: true },
    role:      { type: String, enum: ['admin', 'safety_officer', 'operator'], default: 'operator' },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    createdBy: { type: String, required: true }, // email
    forEmail:  { type: String, required: true, lowercase: true, trim: true },
    expiresAt: { type: Date, required: true },
    usedBy:    { type: String, default: null },
    usedAt:    { type: Date,   default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invite', inviteSchema);