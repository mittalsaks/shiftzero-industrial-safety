// backend/models/Company.js
const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
  {
    name:      { type: String, required: true },       // "Vizag Steel" or "acme"
    domain:    { type: String, required: true, unique: true }, // "vizagsteel.in" or "gmail.com:sakshi"
    createdBy: { type: String, required: true },       // email of first user
  },
  { timestamps: true }
);

module.exports = mongoose.model('Company', companySchema);