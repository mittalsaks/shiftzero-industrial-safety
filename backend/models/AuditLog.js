// backend/models/AuditLog.js
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    companyId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    actorEmail: { type: String, required: true },   // who did it
    actorRole:  { type: String, required: true },
    action:     { type: String, required: true },   // 'ROLE_CHANGE', 'INVITE_CREATED', 'PERMIT_ISSUED', etc.
    targetEmail:{ type: String, default: null },    // who was affected (if applicable)
    details:    { type: mongoose.Schema.Types.Mixed, default: {} }, // extra context
  },
  { timestamps: true }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);