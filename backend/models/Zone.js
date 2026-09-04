// backend/models/Zone.js
// Replaces the old hardcoded 4-zone steel-plant setup. Every zone now belongs
// to exactly one company and is created by that company's admin — works for
// any industry because the metrics being tracked are admin-defined, not fixed.
const mongoose = require('mongoose');

// One tracked metric for a zone, e.g. { key: 'gasPpm', label: 'Gas (ppm)', warningThreshold: 40 }
// Admin decides what's relevant: a warehouse might track 'temp' + 'humidity',
// a construction site might track 'noiseDb' + 'dustPpm', a hospital ward might
// track 'occupancy' + 'oxygenLevel' — the schema doesn't assume any of it.
const metricConfigSchema = new mongoose.Schema(
  {
    key:   { type: String, required: true, trim: true },   // internal id, e.g. 'gasPpm'
    label: { type: String, required: true, trim: true },   // display name, e.g. 'Gas (ppm)'
    unit:  { type: String, default: '' },                  // e.g. 'ppm', '°C', 'dB'
    min:   { type: Number, default: null },
    max:   { type: Number, default: null },
    warningThreshold:  { type: Number, default: null },
    criticalThreshold: { type: Number, default: null },
  },
  { _id: false }
);

const zoneSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name:      { type: String, required: true, trim: true }, // any name — no longer restricted to plant zones
    mode: {
      type: String,
      enum: ['simulated', 'manual'], // simulated = simulator.js auto-generates readings; manual = only team member submissions
      default: 'manual',
    },
    metricConfig: { type: [metricConfigSchema], default: [] },
    createdBy:    { type: String, required: true }, // admin email
    active:       { type: Boolean, default: true },  // soft-delete flag so history isn't orphaned
  },
  { timestamps: true }
);

// A company can't have two zones with the same name, but different companies
// can reuse names freely (e.g. two orgs both having a zone called "Main Floor").
zoneSchema.index({ companyId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Zone', zoneSchema);
