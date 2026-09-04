// backend/routes/zoneRoutes.js
//
// PART 3 — Zone management API.
//   Admin:        create / edit / delete zones, any name, any industry.
//   Team member:  POST /api/zones/:id/status — update their zone's status
//                 (label + optional numeric readings) during their shift.
//
// Every route is scoped to req.user.companyId, so one org can never see or
// touch another org's zones — same isolation pattern as teamRoutes.js.

const express = require('express');
const mongoose = require('mongoose');
const Zone = require('../models/Zone');
const Shift = require('../models/Shift');
const SensorReading = require('../models/SensorReading');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const { deriveRiskFromMetrics } = require('../simulator');

const router = express.Router();

// Optional Socket.IO hookup — server.js can call zoneRoutes.attachIO(io)
// after it creates the io instance, so status updates broadcast live. If
// never attached, the routes still work fine, just without the push.
let ioRef = null;
function attachIO(io) {
  ioRef = io;
}

const STATUS_LABELS = ['NORMAL', 'WARNING', 'CRITICAL'];
const STATUS_RISK = { NORMAL: 0.1, WARNING: 0.5, CRITICAL: 0.9 };

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// GET /api/zones — every active zone in MY organization. Any authenticated
// team member can list zones (they need this to pick which one to update).
router.get('/', requireAuth, async (req, res) => {
  try {
    const zones = await Zone.find({ companyId: req.user.companyId, active: true })
      .sort({ name: 1 })
      .lean();
    res.json(zones);
  } catch (err) {
    console.error('List zones error:', err);
    res.status(500).json({ message: 'Failed to fetch zones' });
  }
});

// POST /api/zones — admin creates a zone. Works for any industry: name is
// free text, mode picks simulated vs manual, metricConfig is whatever the
// admin wants tracked (or empty, for a purely label-based status zone).
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, mode = 'manual', metricConfig = [] } = req.body;
    if (!name || typeof name !== 'string' || !name.trim())
      return res.status(400).json({ message: 'Zone name is required' });
    if (!['simulated', 'manual'].includes(mode))
      return res.status(400).json({ message: "mode must be 'simulated' or 'manual'" });
    if (!Array.isArray(metricConfig))
      return res.status(400).json({ message: 'metricConfig must be an array' });
    for (const m of metricConfig) {
      if (!m.key || !m.label)
        return res.status(400).json({ message: 'Each metric needs a key and a label' });
    }

    const existing = await Zone.findOne({
      companyId: req.user.companyId,
      name: name.trim(),
      active: true,
    });
    if (existing) return res.status(400).json({ message: 'A zone with this name already exists' });

    const zone = await Zone.create({
      companyId: req.user.companyId,
      name: name.trim(),
      mode,
      metricConfig,
      createdBy: req.user.email,
    });

    await AuditLog.create({
      companyId: req.user.companyId, actorEmail: req.user.email, actorRole: req.user.role,
      action: 'ZONE_CREATED', details: { zoneId: zone._id, name: zone.name, mode: zone.mode },
    });

    res.status(201).json(zone);
  } catch (err) {
    console.error('Create zone error:', err);
    res.status(500).json({ message: 'Failed to create zone' });
  }
});

// PATCH /api/zones/:id — admin edits name / mode / metricConfig.
router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id))
      return res.status(400).json({ message: 'Invalid zone id' });

    const zone = await Zone.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!zone) return res.status(404).json({ message: 'Zone not found' });

    const { name, mode, metricConfig } = req.body;
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ message: 'Zone name cannot be empty' });
      zone.name = name.trim();
    }
    if (mode !== undefined) {
      if (!['simulated', 'manual'].includes(mode))
        return res.status(400).json({ message: "mode must be 'simulated' or 'manual'" });
      zone.mode = mode;
    }
    if (metricConfig !== undefined) {
      if (!Array.isArray(metricConfig))
        return res.status(400).json({ message: 'metricConfig must be an array' });
      for (const m of metricConfig) {
        if (!m.key || !m.label)
          return res.status(400).json({ message: 'Each metric needs a key and a label' });
      }
      zone.metricConfig = metricConfig;
    }

    await zone.save();

    await AuditLog.create({
      companyId: req.user.companyId, actorEmail: req.user.email, actorRole: req.user.role,
      action: 'ZONE_UPDATED', details: { zoneId: zone._id, name: zone.name, mode: zone.mode },
    });

    res.json(zone);
  } catch (err) {
    if (err.code === 11000)
      return res.status(400).json({ message: 'A zone with this name already exists' });
    console.error('Update zone error:', err);
    res.status(500).json({ message: 'Failed to update zone' });
  }
});

// DELETE /api/zones/:id — admin soft-deletes a zone (keeps history intact
// instead of orphaning past readings/alerts/permits tied to it).
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id))
      return res.status(400).json({ message: 'Invalid zone id' });

    const zone = await Zone.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!zone) return res.status(404).json({ message: 'Zone not found' });

    zone.active = false;
    await zone.save();

    await AuditLog.create({
      companyId: req.user.companyId, actorEmail: req.user.email, actorRole: req.user.role,
      action: 'ZONE_DELETED', details: { zoneId: zone._id, name: zone.name },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Delete zone error:', err);
    res.status(500).json({ message: 'Failed to delete zone' });
  }
});

// Checks whether this user currently has an active, in-progress shift
// covering this zone (matches by zoneId if the shift has one, else falls
// back to matching the zone's display name — so this keeps working both
// before and after Part 6 updates shift creation to store zoneId).
async function hasActiveShiftForZone(userId, zone) {
  const now = new Date();
  return Shift.exists({
    userId,
    active: true,
    startTime: { $lte: now },
    endTime: { $gte: now },
    $or: [{ zoneId: zone._id }, { zone: zone.name }],
  });
}

// POST /api/zones/:id/status — team member updates their zone's status
// during their shift. Body: { statusLabel: 'NORMAL'|'WARNING'|'CRITICAL',
// metrics?: { [metricKey]: number }, note?: string }
// Admins can also post (e.g. to correct/override), even off-shift.
router.post('/:id/status', requireAuth, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id))
      return res.status(400).json({ message: 'Invalid zone id' });

    const zone = await Zone.findOne({ _id: req.params.id, companyId: req.user.companyId, active: true });
    if (!zone) return res.status(404).json({ message: 'Zone not found' });

    const { statusLabel, metrics = {}, note, attachments } = req.body;
    if (!statusLabel || !STATUS_LABELS.includes(statusLabel))
      return res.status(400).json({ message: `statusLabel must be one of: ${STATUS_LABELS.join(', ')}` });
    if (typeof metrics !== 'object' || Array.isArray(metrics))
      return res.status(400).json({ message: 'metrics must be an object of { key: number }' });
    const cleanAttachments = Array.isArray(attachments)
      ? attachments
          .filter(a => a && a.dataUrl)
          .slice(0, 5)
          .map(a => ({ name: String(a.name || 'attachment'), type: String(a.type || ''), dataUrl: String(a.dataUrl) }))
      : [];

    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    if (!isAdmin) {
      const onShift = await hasActiveShiftForZone(req.user._id, zone);
      if (!onShift)
        return res.status(403).json({ message: 'You can only update this zone during your assigned shift.' });
    }

    // Validate submitted metric keys against this zone's configured metrics.
    const knownKeys = new Set((zone.metricConfig || []).map(m => m.key));
    const cleanMetrics = {};
    for (const [key, value] of Object.entries(metrics)) {
      if (!knownKeys.has(key)) continue; // silently ignore unknown keys rather than hard-fail
      const num = Number(value);
      if (!Number.isNaN(num)) cleanMetrics[key] = num;
    }

    // Numeric readings (if any) refine the risk score beyond the label alone;
    // otherwise fall back to a flat score for the chosen label.
    const hasNumericReadings = Object.keys(cleanMetrics).length > 0;
    const { riskLevel, trendVelocity } = hasNumericReadings
      ? deriveRiskFromMetrics(zone.metricConfig, cleanMetrics, statusLabel === 'CRITICAL')
      : { riskLevel: STATUS_RISK[statusLabel], trendVelocity: 0 };

    const reading = await SensorReading.create({
      companyId: req.user.companyId,
      zoneId: zone._id,
      zone: zone.name,
      source: 'manual',
      submittedBy: req.user.email,
      metrics: cleanMetrics,
      gasPpm: cleanMetrics.gasPpm ?? null,
      tempC: cleanMetrics.tempC ?? null,
      trendVelocity,
      riskLevel,
      timestamp: new Date().toISOString(),
      note: note || null,
      attachments: cleanAttachments,
    });

    await AuditLog.create({
      companyId: req.user.companyId, actorEmail: req.user.email, actorRole: req.user.role,
      action: 'ZONE_STATUS_UPDATED',
      details: { zoneId: zone._id, zone: zone.name, statusLabel, metrics: cleanMetrics, note: note || null },
    });

    const payload = { zone: zone.name, zoneId: zone._id, statusLabel, reading, submittedBy: req.user.name };
    // Scoped to this company's Socket.IO room only (see server.js Part 6) —
    // never a global broadcast, so other orgs never see this update.
    if (ioRef) ioRef.to(String(req.user.companyId)).emit('zoneStatusUpdate', payload);

    res.status(201).json(payload);
  } catch (err) {
    console.error('Zone status update error:', err);
    res.status(500).json({ message: 'Failed to update zone status' });
  }
});

module.exports = router;
module.exports.attachIO = attachIO;
