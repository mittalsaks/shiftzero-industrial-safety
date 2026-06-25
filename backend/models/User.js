const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    avatar: String,
    googleId: String,
    role: { type: String, default: 'Safety Officer' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);