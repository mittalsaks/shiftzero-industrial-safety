require('dotenv').config();
const Company = require('./models/Company');
const AuditLog = require('./models/AuditLog');
const express = require('express');
const cors    = require('cors');
const http    = require('http');
const { Server } = require('socket.io');
const { generateSensorReading, zones } = require('./simulator');
const { scoreHandoverText }            = require('./nlpRiskScorer');
const { getIncidentBackedRecommendation } = require('./ragEngine');
const authRoutes  = require('./routes/authRoutes');
const { connectDB } = require('./db');
const SensorReadingModel = require('./models/SensorReading');
const HandoverLogModel   = require('./models/HandoverLog');
const AlertModel         = require('./models/Alert');
const PermitModel        = require('./models/Permit');
const User               = require('./models/User');
const { requireAuth, requireAdmin } = require('./middleware/authMiddleware');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');

const mailer = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

async function sendCriticalAlert(zone, alert, user) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
  try {
    const admins = await User.find({ role: { $in: ['super_admin', 'admin'] } }).select('email').lean();
    const toEmails = admins.map(a => a.email).join(', ');
    if (!toEmails) return;
    await mailer.sendMail({
      from: `"ShiftZero Safety" <${process.env.EMAIL_USER}>`,
      to: toEmails,
      subject: `🚨 CRITICAL MISMATCH — ${zone}`,
      html: `
        <div style="font-family:monospace;background:#020b14;color:#00ffb4;padding:24px;border-radius:8px">
          <h2 style="color:#ff3a3a">⚠️ VERBAL-SENSOR MISMATCH DETECTED</h2>
          <p><b>Zone:</b> ${zone}</p>
          <p><b>Submitted by:</b> ${user?.name || 'Unknown'} (${user?.email || ''})</p>
          <p><b>Handover Note:</b> "${alert.evidence?.quote}"</p>
          <p><b>AI Recommendation:</b> ${alert.recommendation}</p>
          ${alert.permitConflicts?.length > 0 ? `<p style="color:#ffaa00"><b>⚠️ Permit Conflicts:</b> ${alert.permitConflicts.map(c => c.permitId).join(', ')}</p>` : ''}
          <p style="color:rgba(255,255,255,0.4);font-size:11px">ShiftZero — Vizag Steel Plant · ${new Date().toLocaleString('en-IN')}</p>
        </div>
      `,
    });
    console.log(`📧 Alert email sent for ${zone}`);
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
}

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ── Sensor history ring buffer ────────────────────────────────────────────────
const HISTORY_SIZE = 20;
const sensorHistory = {};
zones.forEach(z => { sensorHistory[z] = []; });

function pushHistory(zoneName, reading) {
  sensorHistory[zoneName].push(reading);
  if (sensorHistory[zoneName].length > HISTORY_SIZE)
    sensorHistory[zoneName].shift();
  SensorReadingModel.create({ zone: zoneName, ...reading }).catch(err =>
    console.error(`SensorReading save failed (${zoneName}):`, err.message)
  );
  trimSensorHistoryDB(zoneName).catch(err =>
    console.error(`SensorReading trim failed (${zoneName}):`, err.message)
  );
}

async function trimSensorHistoryDB(zoneName) {
  const count = await SensorReadingModel.countDocuments({ zone: zoneName });
  if (count > HISTORY_SIZE) {
    const excess = count - HISTORY_SIZE;
    const oldest = await SensorReadingModel.find({ zone: zoneName })
      .sort({ timestamp: 1 }).limit(excess).select('_id');
    await SensorReadingModel.deleteMany({ _id: { $in: oldest.map(d => d._id) } });
  }
}

// ── Permit store ──────────────────────────────────────────────────────────────
let permits = [];
let permitCounter = 0;

const DEFAULT_PERMITS = [
  {
    id: 'PTW-001', zone: 'CokeOvenBattery-3', type: 'HOT_WORK',
    issuedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    issuedBy: 'Shift Supervisor A. Rao',
    description: 'Welding repair on battery door frame #7', active: true
  },
  {
    id: 'PTW-002', zone: 'BlastFurnace-1', type: 'CONFINED_SPACE',
    issuedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    issuedBy: 'Shift Supervisor R. Mehta',
    description: 'Routine tuyere inspection, 2 workers inside', active: true
  },
  {
    id: 'PTW-003', zone: 'RollingMill-2', type: 'ELECTRICAL',
    issuedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    issuedBy: 'Shift Supervisor K. Das',
    description: 'Panel maintenance, LOTO applied', active: false
  }
];

function nextPermitId() {
  permitCounter += 1;
  return `PTW-${String(permitCounter).padStart(3, '0')}`;
}

function predictTimeToCritical(zoneState) {
  const { riskLevel, trendVelocity } = zoneState.sensor;
  if (riskLevel >= 1) return { minutesToCritical: 0, confident: true };
  if (trendVelocity <= 0.02) return { minutesToCritical: null, confident: false };
  const remaining = 1.0 - riskLevel;
  const minutesNeeded = Math.round((remaining / trendVelocity * 5) / 60);
  return { minutesToCritical: Math.max(1, minutesNeeded), confident: trendVelocity > 0.1 };
}

function checkPermitConflicts(zoneState) {
  const activePermits = permits.filter(p => p.zone === zoneState.zone && p.active);
  if (activePermits.length === 0) return [];
  const conflicts = [];
  activePermits.forEach(permit => {
    if (permit.type === 'HOT_WORK' && zoneState.sensor.riskLevel > 0.4) {
      conflicts.push({
        permitId: permit.id, permitType: permit.type, description: permit.description,
        reason: `Hot work permit active while gas risk level is ${(zoneState.sensor.riskLevel * 100).toFixed(0)}% — ignition risk. Ref: OISD-STD-105.`,
        severity: zoneState.sensor.riskLevel > 0.7 ? 'CRITICAL' : 'HIGH'
      });
    }
    if (permit.type === 'CONFINED_SPACE' && zoneState.sensor.trendVelocity > 0.3) {
      conflicts.push({
        permitId: permit.id, permitType: permit.type, description: permit.description,
        reason: `Confined space entry active while sensor trend is escalating (velocity: ${zoneState.sensor.trendVelocity}). Ref: OISD-STD-222.`,
        severity: 'HIGH'
      });
    }
  });
  return conflicts;
}

function enrichZone(z) {
  return {
    ...z,
    prediction:      predictTimeToCritical(z),
    permitConflicts: checkPermitConflicts(z),
    activePermits:   permits.filter(p => p.zone === z.zone && p.active),
    history:         sensorHistory[z.zone] || []
  };
}

let liveState = zones.map(z => ({
  zone: z,
  sensor: generateSensorReading(z, 'normal'),
  lastHandover: null, mismatchScore: 0, alert: null
}));

// ── POST /api/handover ────────────────────────────────────────────────────────
app.post('/api/handover', requireAuth, async (req, res) => {
  const { zone, text } = req.body;
  if (!zone || !text) return res.status(400).json({ error: 'zone and text required' });
  const zoneState = liveState.find(z => z.zone === zone);
  if (!zoneState) return res.status(404).json({ error: 'unknown zone' });

  const riskLanguageScore = await scoreHandoverText(text);
  const mismatch  = Math.max(0, zoneState.sensor.riskLevel - riskLanguageScore);
  const timestamp = new Date().toISOString();
  // REPLACE karo with:
  zoneState.lastHandover = {
    text, riskLanguageScore, timestamp,
    submittedBy: req.user.email,
    submittedByName: req.user.name,
  };
  zoneState.mismatchScore = Math.round(mismatch * 100);

  HandoverLogModel.create({
    zone, text, riskLanguageScore,
    mismatchScore: zoneState.mismatchScore,
    timestamp,
    submittedBy:     req.user.email,
    submittedByName: req.user.name,
    userId:          req.user._id,
  }).catch(err => console.error('HandoverLog save failed:', err.message));

  const permitConflicts = checkPermitConflicts(zoneState);
  if (zoneState.mismatchScore >= 60 || permitConflicts.some(c => c.severity === 'CRITICAL')) {
    const { matchedIncidents, recommendation } = await getIncidentBackedRecommendation(zone, text);
    zoneState.alert = {
      level: 'HIGH',
      message: `Verbal-Sensor Mismatch detected in ${zone}: handover note suggests calm conditions, but sensor trend shows escalating risk.`,
      evidence: { quote: text, sensorTrend: zoneState.sensor },
      matchedIncidents, recommendation, permitConflicts,
      timestamp: new Date().toISOString()
    };
    io.emit('alert', { zone, alert: zoneState.alert });
    sendCriticalAlert(zone, zoneState.alert, req.user); // ✅ email
    AlertModel.create({ zone, ...zoneState.alert }).catch(err =>
      console.error('Alert save failed:', err.message)
    );
  } else {
    zoneState.alert = null;
  }
  const enriched = liveState.map(enrichZone);
  io.emit('stateUpdate', enriched);
  res.json(enrichZone(zoneState));
});

app.get('/api/state',         (req, res) => res.json(liveState.map(enrichZone)));
app.get('/api/history/:zone', (req, res) => {
  const h = sensorHistory[req.params.zone];
  if (!h) return res.status(404).json({ error: 'unknown zone' });
  res.json(h);
});

app.get('/api/alerts', async (req, res) => {
  try {
    const filter = req.query.zone ? { zone: req.query.zone } : {};
    const alerts = await AlertModel.find(filter).sort({ timestamp: -1 }).limit(50).lean();
    res.json(alerts);
  } catch (err) { res.status(500).json({ error: 'failed to fetch alerts' }); }
});

app.get('/api/handover', async (req, res) => {
  try {
    const filter = req.query.zone ? { zone: req.query.zone } : {};
    const logs = await HandoverLogModel.find(filter).sort({ timestamp: -1 }).limit(50).lean();
    res.json(logs);
  } catch (err) { res.status(500).json({ error: 'failed to fetch handover logs' }); }
});

app.get('/api/permits', (req, res) => res.json(permits));

app.post('/api/permits', requireAuth, requireAdmin, async (req, res) => {
  const { zone, type, issuedBy, description } = req.body;
  if (!zone || !type || !issuedBy || !description)
    return res.status(400).json({ error: 'zone, type, issuedBy, description required' });
  const permit = {
    id: nextPermitId(), zone, type, issuedBy, description,
    issuedAt: new Date().toISOString(), active: true
  };
  permits.push(permit);
  io.emit('permitsUpdate', permits);
  PermitModel.create(permit).catch(err => console.error('Permit save failed:', err.message));
  res.json(permit);
});

app.patch('/api/permits/:id/close', requireAuth, requireAdmin, async (req, res) => {
  const permit = permits.find(p => p.id === req.params.id);
  if (!permit) return res.status(404).json({ error: 'permit not found' });
  permit.active = false;
  io.emit('permitsUpdate', permits);
  PermitModel.updateOne({ id: permit.id }, { active: false }).catch(err =>
    console.error('Permit close-persist failed:', err.message)
  );
  res.json(permit);
});

// ── Users ─────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// ADD THESE ROUTES to your existing server.js
// Replace the existing "── Users ──" block with this complete block
// Also add Company + AuditLog requires at the top with other requires
// ─────────────────────────────────────────────────────────────────────────────

// At top of server.js, add these two requires alongside existing ones:
// const Company  = require('./models/Company');
// const AuditLog = require('./models/AuditLog');

// ── Users (company-scoped) ────────────────────────────────────────────────────
// GET /api/users — admin sees own company users, super_admin sees all
app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const filter = req.user.role === 'super_admin'
      ? {}
      : { companyId: req.user.companyId };

    const users = await User.find(filter).select('-googleId').sort({ createdAt: -1 }).lean();
    res.json(users);
  } catch (err) { res.status(500).json({ error: 'failed to fetch users' }); }
});

// PATCH /api/users/:id/role — change role (company-scoped)
app.patch('/api/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const allowedRoles = req.user.role === 'super_admin'
      ? ['super_admin', 'admin', 'safety_officer', 'operator']
      : ['admin', 'safety_officer', 'operator'];

    if (!allowedRoles.includes(role))
      return res.status(400).json({ message: 'Invalid role' });

    // Non-super-admin can only change users in their own company
    const targetUser = await User.findById(req.params.id).lean();
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    if (req.user.role !== 'super_admin' &&
        String(targetUser.companyId) !== String(req.user.companyId))
      return res.status(403).json({ message: 'Cannot modify users from another company' });

    const updated = await User.findByIdAndUpdate(req.params.id, { role }, { new: true })
      .select('-googleId').lean();

    // Audit log
    await AuditLog.create({
      companyId:   req.user.companyId,
      actorEmail:  req.user.email,
      actorRole:   req.user.role,
      action:      'ROLE_CHANGE',
      targetEmail: targetUser.email,
      details:     { from: targetUser.role, to: role },
    });

    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'failed to update role' }); }
});

// ── Companies (super_admin only) ──────────────────────────────────────────────
app.get('/api/companies', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin')
      return res.status(403).json({ message: 'Super admin only' });

    const companies = await Company.find().sort({ createdAt: -1 }).lean();

    // Attach user count per company
    const withCounts = await Promise.all(companies.map(async c => ({
      ...c,
      userCount: await User.countDocuments({ companyId: c._id }),
    })));

    res.json(withCounts);
  } catch (err) { res.status(500).json({ error: 'failed to fetch companies' }); }
});
// ── Invite routes (protected) ─────────────────────────────────────────────────
// NOTE: The actual handlers live in authRoutes.js
// We add middleware here so they are protected:
const Invite = require('./models/Invite');
const crypto = require('crypto');
app.get('/api/report/pdf', requireAuth, async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [handovers, alerts, permitDocs] = await Promise.all([
      HandoverLogModel.find({ timestamp: { $gte: since.toISOString() } }).sort({ timestamp: -1 }).lean(),
      AlertModel.find({ timestamp: { $gte: since.toISOString() } }).sort({ timestamp: -1 }).lean(),
      PermitModel.find().lean(),
    ]);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ShiftZero-Report-${new Date().toISOString().split('T')[0]}.pdf"`);
    doc.pipe(res);

    doc.fontSize(20).fillColor('#00cc88').text('SHIFTZERO SHIFT REPORT', { align: 'center' });
    doc.fontSize(10).fillColor('#888').text('Vizag Steel Plant · CokeOven Division', { align: 'center' });
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleString('en-IN')}`, { align: 'center' });
    doc.moveDown();

    doc.fontSize(12).fillColor('#ff4444').text(`ALERTS: ${alerts.length}  |  `, { continued: true });
    doc.fillColor('#ffaa00').text(`HANDOVERS: ${handovers.length}  |  `, { continued: true });
    doc.fillColor('#00cc88').text(`PERMITS: ${permitDocs.length}`);
    doc.moveDown();

    if (alerts.length > 0) {
      doc.fontSize(13).fillColor('#ff4444').text('MISMATCH ALERTS');
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#ff4444');
      doc.moveDown(0.5);
      alerts.forEach((a, i) => {
        doc.fontSize(11).fillColor('#000').text(`${i+1}. Zone: ${a.zone}`);
        doc.fontSize(9).fillColor('#555').text(`Time: ${new Date(a.timestamp).toLocaleString('en-IN')}`);
        doc.fontSize(9).fillColor('#333').text(`Note: "${a.evidence?.quote || 'N/A'}"`);
        if (a.recommendation) doc.fontSize(9).fillColor('#886600').text(`AI: ${a.recommendation.slice(0, 200)}`);
        doc.moveDown(0.5);
      });
      doc.moveDown();
    }

    if (handovers.length > 0) {
      doc.fontSize(13).fillColor('#006644').text('HANDOVER LOG');
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#006644');
      doc.moveDown(0.5);
      handovers.forEach((h, i) => {
        doc.fontSize(10).fillColor('#000').text(`${i+1}. [${h.zone}] ${h.submittedByName || 'Unknown'} (${h.submittedBy || ''})`);
        doc.fontSize(9).fillColor('#555').text(`Time: ${new Date(h.timestamp).toLocaleString('en-IN')} | Mismatch: ${h.mismatchScore}%`);
        doc.fontSize(9).fillColor('#333').text(`"${h.text.slice(0, 150)}${h.text.length > 150 ? '...' : ''}"`);
        doc.moveDown(0.5);
      });
      doc.moveDown();
    }

    doc.fontSize(13).fillColor('#886600').text('PERMIT STATUS');
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#886600');
    doc.moveDown(0.5);
    permitDocs.forEach(p => {
      doc.fontSize(10).fillColor(p.active ? '#cc0000' : '#555')
        .text(`${p.id} — ${p.type} — ${p.zone} — ${p.active ? 'ACTIVE' : 'CLOSED'}`);
      doc.fontSize(9).fillColor('#555').text(`${p.description} | ${p.issuedBy}`);
      doc.moveDown(0.3);
    });

    doc.end();
  } catch (err) {
    console.error('PDF error:', err);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});
app.get('/api/health', (req, res) => {
  const mongoose = require('mongoose');
  res.json({ status: 'ok', dbConnected: mongoose.connection.readyState === 1 });
});

// ── Sensor simulation ─────────────────────────────────────────────────────────
setInterval(() => {
  liveState = liveState.map(z => {
    const mode = z.zone === 'CokeOvenBattery-3' ? 'escalating' : 'normal';
    const newSensor = generateSensorReading(z.zone, mode);
    pushHistory(z.zone, newSensor);
    return { ...z, sensor: newSensor };
  });
  io.emit('stateUpdate', liveState.map(enrichZone));
}, 5000);

async function hydrateFromDB() {
  const existingCount = await PermitModel.countDocuments();
  if (existingCount === 0) {
    await PermitModel.insertMany(DEFAULT_PERMITS);
    permits = DEFAULT_PERMITS.map(p => ({ ...p }));
    console.log('🌱 Seeded default permits');
  } else {
    const docs = await PermitModel.find().lean();
    permits = docs.map(({ _id, ...rest }) => rest);
    console.log(`✅ Loaded ${permits.length} permits from DB`);
  }
  permitCounter = permits.reduce((max, p) => {
    const n = parseInt(p.id.replace('PTW-', ''), 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
  for (const zoneName of zones) {
    const existing = await SensorReadingModel.find({ zone: zoneName })
      .sort({ timestamp: -1 }).limit(HISTORY_SIZE).lean();
    if (existing.length > 0) {
      sensorHistory[zoneName] = existing.reverse().map(
        ({ zone, gasPpm, tempC, trendVelocity, riskLevel, timestamp }) =>
          ({ zoneName: zone, gasPpm, tempC, trendVelocity, riskLevel, timestamp })
      );
      console.log(`✅ Loaded ${existing.length} readings for ${zoneName}`);
    } else {
      const mode = zoneName === 'CokeOvenBattery-3' ? 'escalating' : 'normal';
      for (let i = 0; i < 10; i++)
        pushHistory(zoneName, generateSensorReading(zoneName, mode));
      console.log(`🌱 Seeded synthetic history for ${zoneName}`);
    }
  }
}

const PORT = process.env.PORT || 5000;
async function start() {
  await connectDB();
  await hydrateFromDB();
  server.listen(PORT, () => console.log(`🚀 Shift Zero backend running on port ${PORT}`));
}
start().catch(err => {
  console.error('❌ Fatal startup error:', err);
  process.exit(1);
});