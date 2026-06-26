// backend/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true },
    email:     { type: String, required: true, unique: true },
    avatar:    String,
    googleId:  String,
    role: {
      type:    String,
      enum:    ['super_admin', 'admin', 'safety_officer', 'operator'],
      default: 'operator',
    },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    isSuperAdmin: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);