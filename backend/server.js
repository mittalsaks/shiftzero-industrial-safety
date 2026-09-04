require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const http       = require('http');
const jwt        = require('jsonwebtoken');
const { Server } = require('socket.io');
const PDFDocument = require('pdfkit');

const { connectDB } = require('./db');
const { requireAuth, requireAdmin } = require('./middleware/authMiddleware');
const { sendMail } = require('./mailer');

const Company        = require('./models/Company');
const User            = require('./models/User');
const Zone            = require('./models/Zone');
const SensorReading   = require('./models/SensorReading');
const HandoverLog     = require('./models/HandoverLog');
const AlertModel      = require('./models/Alert');
const PermitModel     = require('./models/Permit');
const ShiftModel      = require('./models/Shift');
const AuditLog        = require('./models/AuditLog');

const { simulateTick }                   = require('./simulator');       // Part 4 — zone/metric-aware engine
const { scoreHandoverText }              = require('./nlpRiskScorer');
const { getIncidentBackedRecommendation } = require('./ragEngine');       // Part 5 — genericized

const authRoutes = require('./routes/authRoutes');
const teamRoutes = require('./routes/teamRoutes');
const zoneRoutes = require('./routes/zoneRoutes'); // Part 3 — admin zone CRUD + team status updates

// ─────────────────────────────────────────────────────────────────────────
// PART 6 — everything below replaces the old single-tenant, hardcoded
// 4-zone ("CokeOvenBattery-3", "BlastFurnace-1", ...) design. There is no
// more global `liveState`/`zones`/`shifts`/`permits` in-memory array shared
// by every visitor. Every read and write below is scoped to
// req.user.companyId, and "current zone state" is computed on demand from
// the DB (Zone + latest SensorReading/HandoverLog/Alert/Permit/Shift docs)
// instead of a shared in-memory object — so one org's data can never leak
// into another org's dashboard, history, alerts, permits, or exports.
// ─────────────────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/zones', zoneRoutes);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
zoneRoutes.attachIO(io);

// ── Socket.IO auth + per-company rooms ──────────────────────────────────────
// A socket that connects with a valid JWT (sent as `auth: { token }` on the
// client) is placed into a room named after its companyId. Every live event
// below is emitted with `emitToCompany(companyId, ...)`, which targets only
// that room — so real-time pushes are isolated the same way REST responses
// are. A socket with no/invalid token still connects (so the app doesn't
// hard-fail), it just never joins a company room and therefore never
// receives any company-scoped event.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('companyId').lean();
      if (user?.companyId) socket.companyId = String(user.companyId);
    }
  } catch (err) {
    // invalid/expired token -> connect anonymously, no room, no scoped events
  }
  next();
});
io.on('connection', (socket) => {
  if (socket.companyId) socket.join(socket.companyId);
});

function emitToCompany(companyId, event, payload) {
  if (!companyId) return;
  io.to(String(companyId)).emit(event, payload);
}

const HISTORY_SIZE = 20;

// ── Risk / prediction helpers (industry-agnostic — operate on whatever
// riskLevel/trendVelocity a zone's metrics produced, from any industry) ────
function predictTimeToCritical(sensor) {
  if (!sensor) return { minutesToCritical: null, confident: false };
  const { riskLevel = 0, trendVelocity = 0 } = sensor;
  if (riskLevel >= 1) return { minutesToCritical: 0, confident: true };
  if (trendVelocity <= 0.02) return { minutesToCritical: null, confident: false };
  const remaining = 1.0 - riskLevel;
  const minutesNeeded = Math.round((remaining / trendVelocity * 5) / 60);
  const confident = trendVelocity > 0.15 && riskLevel > 0.3;
  return { minutesToCritical: Math.max(1, minutesNeeded), confident };
}

// Generic permit/risk conflict check — any permit type, in any industry,
// active on a zone whose current risk is elevated gets flagged. Replaces the
// old hardcoded HOT_WORK/CONFINED_SPACE-only, OISD-cited logic, which only
// made sense for the steel-plant demo.
function checkPermitConflicts(activePermits, sensor) {
  const risk = sensor?.riskLevel ?? 0;
  if (!activePermits.length || risk <= 0.4) return [];
  return activePermits.map(p => ({
    permitId: p.id,
    permitType: p.type,
    description: p.description,
    reason: `Active permit "${p.type}" in this zone while risk level is at ${(risk * 100).toFixed(0)}% — review before proceeding or continuing work.`,
    severity: risk > 0.7 ? 'CRITICAL' : 'HIGH',
  }));
}

// Builds the full "live" view of one zone purely from persisted data —
// no shared in-memory state, so it's correct across restarts and safe
// across companies.
async function buildEnrichedZone(zoneDoc) {
  const zoneId = zoneDoc._id;
  const now = new Date();

  const [latestReading, historyDocs, lastHandover, activePermits, onDuty, latestAlert] = await Promise.all([
    SensorReading.findOne({ zoneId }).sort({ timestamp: -1 }).lean(),
    SensorReading.find({ zoneId }).sort({ timestamp: -1 }).limit(HISTORY_SIZE).lean(),
    HandoverLog.findOne({ zoneId }).sort({ timestamp: -1 }).lean(),
    PermitModel.find({ zoneId, active: true }).lean(),
    ShiftModel.find({ zoneId, active: true, startTime: { $lte: now }, endTime: { $gte: now } }).lean(),
    AlertModel.findOne({ zoneId }).sort({ timestamp: -1 }).lean(),
  ]);

  const sensor = latestReading || { riskLevel: 0, trendVelocity: 0, metrics: {}, timestamp: null };
  const permitConflicts = checkPermitConflicts(activePermits, sensor);

  // Only surface the latest alert while it's still "current" — i.e. no
  // newer handover note has come in since (mirrors the old in-memory
  // liveState.alert reset-on-next-handover behavior).
  const alert = (latestAlert && lastHandover && latestAlert.timestamp >= lastHandover.timestamp)
    ? latestAlert
    : null;

  return {
    zoneId, zone: zoneDoc.name, mode: zoneDoc.mode, metricConfig: zoneDoc.metricConfig || [],
    sensor,
    history: historyDocs.reverse(),
    lastHandover: lastHandover ? {
      text: lastHandover.text,
      riskLanguageScore: lastHandover.riskLanguageScore,
      timestamp: lastHandover.timestamp,
      submittedBy: lastHandover.submittedBy,
      submittedByName: lastHandover.submittedByName,
      attachments: lastHandover.attachments || [],
    } : null,
    mismatchScore: lastHandover?.mismatchScore || 0,
    alert,
    prediction: predictTimeToCritical(sensor),
    permitConflicts,
    activePermits,
    onDuty,
  };
}

async function buildEnrichedZonesForCompany(companyId) {
  const zoneDocs = await Zone.find({ companyId, active: true }).sort({ name: 1 }).lean();
  return Promise.all(zoneDocs.map(buildEnrichedZone));
}

async function sendCriticalAlert(zoneDoc, alert, user) {
  try {
    const companyId = zoneDoc.companyId;
    const [admins, onDuty, company] = await Promise.all([
      User.find({ companyId, role: { $in: ['admin', 'super_admin'] } }).select('email').lean(),
      ShiftModel.find({
        zoneId: zoneDoc._id, active: true,
        startTime: { $lte: new Date() }, endTime: { $gte: new Date() },
      }).lean(),
      Company.findById(companyId).lean(),
    ]);
    const emailSet = new Set([
      ...admins.map(a => a.email),
      ...onDuty.map(s => s.userEmail),
    ].filter(Boolean));
    const toEmails = [...emailSet].join(', ');
    if (!toEmails) return;
    const onDutyLine = onDuty.length > 0
      ? `<p style="color:#66ccff"><b>On-duty this zone:</b> ${onDuty.map(s => s.userName).join(', ')} (directly alerted)</p>`
      : `<p style="color:#888"><b>On-duty this zone:</b> no shift currently rostered — alerting admins only</p>`;
    await sendMail({
      to: toEmails,
      subject: `🚨 CRITICAL MISMATCH — ${zoneDoc.name}`,
      html: `
        <div style="font-family:monospace;background:#020b14;color:#00ffb4;padding:24px;border-radius:8px">
          <h2 style="color:#ff3a3a">⚠️ VERBAL-STATUS MISMATCH DETECTED</h2>
          <p><b>Zone:</b> ${zoneDoc.name}</p>
          <p><b>Submitted by:</b> ${user?.name || 'Unknown'} (${user?.email || ''})</p>
          <p><b>Handover Note:</b> "${alert.evidence?.quote}"</p>
          <p><b>AI Recommendation:</b> ${alert.recommendation}</p>
          ${onDutyLine}
          ${alert.permitConflicts?.length > 0 ? `<p style="color:#ffaa00"><b>⚠️ Permit Conflicts:</b> ${alert.permitConflicts.map(c => c.permitId).join(', ')}</p>` : ''}
          <p style="color:rgba(255,255,255,0.4);font-size:11px">ShiftZero — ${company?.name || 'Your Organization'} · ${new Date().toLocaleString('en-IN')}</p>
        </div>
      `,
    });
    console.log(`📧 Alert email sent for ${zoneDoc.name} (${onDuty.length} on-duty + ${admins.length} admins)`);
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
}

// ── POST /api/handover ──────────────────────────────────────────────────────
// Accepts either `zone` (display name) or `zoneId`, resolved strictly within
// req.user.companyId — a member can never trigger/read a handover for a
// zone belonging to another organization.
app.post('/api/handover', requireAuth, async (req, res) => {
  try {
    const { zone, zoneId, text, attachments } = req.body;
    if (!text || (!zone && !zoneId))
      return res.status(400).json({ error: 'zone (or zoneId) and text required' });
    const cleanAttachments = Array.isArray(attachments)
      ? attachments
          .filter(a => a && a.dataUrl)
          .slice(0, 5)
          .map(a => ({ name: String(a.name || 'attachment'), type: String(a.type || ''), dataUrl: String(a.dataUrl) }))
      : [];

    const zoneDoc = await Zone.findOne({
      companyId: req.user.companyId,
      active: true,
      ...(zoneId ? { _id: zoneId } : { name: zone }),
    });
    if (!zoneDoc) return res.status(404).json({ error: 'unknown zone' });

    const latestReading = await SensorReading.findOne({ zoneId: zoneDoc._id }).sort({ timestamp: -1 }).lean();
    const currentRisk = latestReading?.riskLevel ?? 0;

    const riskLanguageScore = await scoreHandoverText(text);
    const mismatchScore = Math.round(Math.max(0, currentRisk - riskLanguageScore) * 100);
    const timestamp = new Date().toISOString();

    await HandoverLog.create({
      companyId: req.user.companyId, zoneId: zoneDoc._id, zone: zoneDoc.name,
      text, riskLanguageScore, mismatchScore, timestamp,
      submittedBy: req.user.email, submittedByName: req.user.name, userId: req.user._id,
      attachments: cleanAttachments,
    });

    const activePermits = await PermitModel.find({ zoneId: zoneDoc._id, active: true }).lean();
    const permitConflicts = checkPermitConflicts(activePermits, latestReading || { riskLevel: currentRisk });

    let alert = null;
    if (mismatchScore >= 60 || permitConflicts.some(c => c.severity === 'CRITICAL')) {
      const zoneContext = (zoneDoc.metricConfig || []).length
        ? `tracked metrics: ${zoneDoc.metricConfig.map(m => m.label).join(', ')}`
        : '';
      const { matchedIncidents, recommendation } =
        await getIncidentBackedRecommendation(zoneDoc.name, text, zoneContext);

      alert = {
        companyId: req.user.companyId, zoneId: zoneDoc._id, zone: zoneDoc.name,
        level: 'HIGH',
        message: `Verbal-Status Mismatch detected in ${zoneDoc.name}: handover note suggests calm conditions, but the latest reading shows escalating risk.`,
        evidence: { quote: text, sensorTrend: latestReading || null },
        matchedIncidents, recommendation, permitConflicts,
        timestamp: new Date().toISOString(),
      };
      await AlertModel.create(alert);
      emitToCompany(req.user.companyId, 'alert', { zone: zoneDoc.name, zoneId: zoneDoc._id, alert });
      const isDemoUser = (req.user.email || '').endsWith('@demo.shiftzero.local');
      if (!isDemoUser) sendCriticalAlert(zoneDoc, alert, req.user);
    }

    const enriched = await buildEnrichedZonesForCompany(req.user.companyId);
    emitToCompany(req.user.companyId, 'stateUpdate', enriched);
    res.json(enriched.find(z => String(z.zoneId) === String(zoneDoc._id)));
  } catch (err) {
    console.error('Handover error:', err);
    res.status(500).json({ error: 'failed to process handover' });
  }
});

// ── Dashboard state / history / alerts / handover log (all company-scoped,
// all now require auth — previously several of these were public) ─────────
app.get('/api/state', requireAuth, async (req, res) => {
  try {
    res.json(await buildEnrichedZonesForCompany(req.user.companyId));
  } catch (err) {
    console.error('State fetch error:', err);
    res.status(500).json({ error: 'failed to fetch state' });
  }
});

app.get('/api/history/:zone', requireAuth, async (req, res) => {
  try {
    const zoneDoc = await Zone.findOne({
      companyId: req.user.companyId, name: req.params.zone, active: true,
    }).lean();
    if (!zoneDoc) return res.status(404).json({ error: 'unknown zone' });
    const history = await SensorReading.find({ zoneId: zoneDoc._id })
      .sort({ timestamp: -1 }).limit(HISTORY_SIZE).lean();
    res.json(history.reverse());
  } catch (err) {
    res.status(500).json({ error: 'failed to fetch history' });
  }
});

app.get('/api/alerts', requireAuth, async (req, res) => {
  try {
    const filter = { companyId: req.user.companyId };
    if (req.query.zone) filter.zone = req.query.zone;
    const alerts = await AlertModel.find(filter).sort({ timestamp: -1 }).limit(50).lean();
    res.json(alerts);
  } catch (err) { res.status(500).json({ error: 'failed to fetch alerts' }); }
});

app.get('/api/handover', requireAuth, async (req, res) => {
  try {
    const filter = { companyId: req.user.companyId };
    if (req.query.zone) filter.zone = req.query.zone;
    const logs = await HandoverLog.find(filter).sort({ timestamp: -1 }).limit(50).lean();
    res.json(logs);
  } catch (err) { res.status(500).json({ error: 'failed to fetch handover logs' }); }
});

// ── Permits (company + zone scoped; any permit `type` — free text, works
// for any industry — HOT_WORK, ACCESS_GRANT, ISOLATION, whatever an org
// uses) ──────────────────────────────────────────────────────────────────
let permitCounter = 0; // global counter -> Permit.id stays globally unique across all companies
function nextPermitId() {
  permitCounter += 1;
  return `PTW-${String(permitCounter).padStart(3, '0')}`;
}

app.get('/api/permits', requireAuth, async (req, res) => {
  try {
    const permits = await PermitModel.find({ companyId: req.user.companyId }).sort({ issuedAt: -1 }).lean();
    res.json(permits);
  } catch (err) { res.status(500).json({ error: 'failed to fetch permits' }); }
});

app.post('/api/permits', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { zone, type, issuedBy, description } = req.body;
    if (!zone || !type || !issuedBy || !description)
      return res.status(400).json({ error: 'zone, type, issuedBy, description required' });

    const zoneDoc = await Zone.findOne({ companyId: req.user.companyId, name: zone, active: true });
    if (!zoneDoc) return res.status(400).json({ error: 'unknown zone' });

    const permit = await PermitModel.create({
      id: nextPermitId(), companyId: req.user.companyId, zoneId: zoneDoc._id, zone: zoneDoc.name,
      type, issuedBy, description, issuedAt: new Date().toISOString(), active: true,
    });
    emitToCompany(req.user.companyId, 'permitsUpdate',
      await PermitModel.find({ companyId: req.user.companyId }).lean());
    res.json(permit);
  } catch (err) {
    console.error('Create permit error:', err);
    res.status(500).json({ error: 'failed to create permit' });
  }
});

app.patch('/api/permits/:id/close', requireAuth, requireAdmin, async (req, res) => {
  try {
    const permit = await PermitModel.findOne({ id: req.params.id, companyId: req.user.companyId });
    if (!permit) return res.status(404).json({ error: 'permit not found' });
    permit.active = false;
    await permit.save();
    emitToCompany(req.user.companyId, 'permitsUpdate',
      await PermitModel.find({ companyId: req.user.companyId }).lean());
    res.json(permit);
  } catch (err) { res.status(500).json({ error: 'failed to close permit' }); }
});

// ── Shift roster (company + zone scoped) ────────────────────────────────────
app.get('/api/shifts', requireAuth, async (req, res) => {
  try {
    const filter = { companyId: req.user.companyId };
    if (req.query.zone) filter.zone = req.query.zone;
    const shifts = await ShiftModel.find(filter).sort({ startTime: -1 }).lean();
    res.json(shifts);
  } catch (err) { res.status(500).json({ error: 'failed to fetch shifts' }); }
});

app.get('/api/shifts/on-duty', requireAuth, async (req, res) => {
  try {
    const zones = await Zone.find({ companyId: req.user.companyId, active: true }).lean();
    const now = new Date();
    const byZone = {};
    for (const z of zones) {
      byZone[z.name] = await ShiftModel.find({
        zoneId: z._id, companyId: req.user.companyId, active: true,
        startTime: { $lte: now }, endTime: { $gte: now },
      }).lean();
    }
    res.json(byZone);
  } catch (err) { res.status(500).json({ error: 'failed to fetch on-duty roster' }); }
});

app.post('/api/shifts', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { zone, userId, startTime, endTime } = req.body;
    if (!zone || !userId || !startTime || !endTime)
      return res.status(400).json({ error: 'zone, userId, startTime, endTime required' });

    const zoneDoc = await Zone.findOne({ companyId: req.user.companyId, name: zone, active: true });
    if (!zoneDoc) return res.status(400).json({ error: 'unknown zone' });
    if (new Date(endTime) <= new Date(startTime))
      return res.status(400).json({ error: 'endTime must be after startTime' });

    const targetUser = await User.findOne({ _id: userId, companyId: req.user.companyId }).lean();
    if (!targetUser) return res.status(404).json({ error: 'user not found in your organization' });

    const shift = await ShiftModel.create({
      zone: zoneDoc.name, zoneId: zoneDoc._id, userId, userName: targetUser.name, userEmail: targetUser.email,
      companyId: req.user.companyId,
      startTime: new Date(startTime).toISOString(), endTime: new Date(endTime).toISOString(),
      assignedBy: req.user.email, active: true,
    });
    emitToCompany(req.user.companyId, 'shiftsUpdate',
      await ShiftModel.find({ companyId: req.user.companyId }).lean());
    res.json(shift);
  } catch (err) {
    console.error('Create shift error:', err);
    res.status(500).json({ error: 'failed to create shift' });
  }
});

app.patch('/api/shifts/:id/end', requireAuth, requireAdmin, async (req, res) => {
  try {
    const shift = await ShiftModel.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!shift) return res.status(404).json({ error: 'shift not found' });
    shift.active = false;
    await shift.save();
    emitToCompany(req.user.companyId, 'shiftsUpdate',
      await ShiftModel.find({ companyId: req.user.companyId }).lean());
    res.json(shift);
  } catch (err) { res.status(500).json({ error: 'failed to end shift' }); }
});

// ── Users (company-scoped; super_admin sees across all companies) ──────────
app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const filter = req.user.role === 'super_admin' ? {} : { companyId: req.user.companyId };
    const users = await User.find(filter).select('-googleId').sort({ createdAt: -1 }).lean();
    res.json(users);
  } catch (err) { res.status(500).json({ error: 'failed to fetch users' }); }
});

app.patch('/api/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const allowedRoles = req.user.role === 'super_admin'
      ? ['super_admin', 'admin', 'safety_officer', 'operator']
      : ['admin', 'safety_officer', 'operator'];
    if (!allowedRoles.includes(role)) return res.status(400).json({ message: 'Invalid role' });

    const targetUser = await User.findById(req.params.id).lean();
    if (!targetUser) return res.status(404).json({ message: 'User not found' });
    if (req.user.role !== 'super_admin' && String(targetUser.companyId) !== String(req.user.companyId))
      return res.status(403).json({ message: 'Cannot modify users from another company' });

    const updated = await User.findByIdAndUpdate(req.params.id, { role }, { new: true })
      .select('-googleId').lean();

    await AuditLog.create({
      companyId: req.user.companyId, actorEmail: req.user.email, actorRole: req.user.role,
      action: 'ROLE_CHANGE', targetEmail: targetUser.email, details: { from: targetUser.role, to: role },
    });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: 'failed to update role' }); }
});

// ── Companies (super_admin only — cross-org platform management view, not
// a per-org data leak: normal admins/members never hit this route) ────────
app.get('/api/companies', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ message: 'Super admin only' });
    const companies = await Company.find().sort({ createdAt: -1 }).lean();
    const withCounts = await Promise.all(companies.map(async c => ({
      ...c, userCount: await User.countDocuments({ companyId: c._id }),
    })));
    res.json(withCounts);
  } catch (err) { res.status(500).json({ error: 'failed to fetch companies' }); }
});

// ── Reports (company-scoped exports; company name is looked up dynamically
// instead of a hardcoded "Vizag Steel Plant" header) ────────────────────────
app.get('/api/report/pdf', requireAuth, async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [handovers, alerts, permitDocs, company] = await Promise.all([
      HandoverLog.find({ companyId, timestamp: { $gte: since } }).sort({ timestamp: -1 }).lean(),
      AlertModel.find({ companyId, timestamp: { $gte: since } }).sort({ timestamp: -1 }).lean(),
      PermitModel.find({ companyId }).lean(),
      Company.findById(companyId).lean(),
    ]);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ShiftZero-Report-${new Date().toISOString().split('T')[0]}.pdf"`);
    doc.pipe(res);

    doc.fontSize(20).fillColor('#00cc88').text('SHIFTZERO SHIFT REPORT', { align: 'center' });
    doc.fontSize(10).fillColor('#888').text(company?.name || 'Your Organization', { align: 'center' });
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
        doc.fontSize(11).fillColor('#000').text(`${i + 1}. Zone: ${a.zone}`);
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
        doc.fontSize(10).fillColor('#000').text(`${i + 1}. [${h.zone}] ${h.submittedByName || 'Unknown'} (${h.submittedBy || ''})`);
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

app.get('/api/report/csv', requireAuth, requireAdmin, async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const days = Math.min(parseInt(req.query.days) || 7, 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const [handovers, alertDocs] = await Promise.all([
      HandoverLog.find({ companyId, timestamp: { $gte: since } }).sort({ timestamp: 1 }).lean(),
      AlertModel.find({ companyId, timestamp: { $gte: since } }).sort({ timestamp: 1 }).lean(),
    ]);

    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['record_type', 'timestamp', 'zone', 'submitted_by', 'submitted_by_email',
        'mismatch_score', 'risk_language_score', 'note_text', 'permit_conflicts', 'ai_recommendation'].map(esc).join(','),
    ];
    handovers.forEach(h => rows.push([
      'HANDOVER', h.timestamp, h.zone, h.submittedByName, h.submittedBy,
      h.mismatchScore, h.riskLanguageScore, h.text, '', '',
    ].map(esc).join(',')));
    alertDocs.forEach(a => rows.push([
      'ALERT', a.timestamp, a.zone, '', '',
      '', '', a.evidence?.quote || '',
      (a.permitConflicts || []).map(c => c.permitId).join('; '),
      a.recommendation || '',
    ].map(esc).join(',')));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="ShiftZero-Audit-${days}d-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(rows.join('\n'));
  } catch (err) {
    console.error('CSV export error:', err);
    res.status(500).json({ error: 'CSV export failed' });
  }
});

app.get('/api/health', (req, res) => {
  const mongoose = require('mongoose');
  res.json({ status: 'ok', dbConnected: mongoose.connection.readyState === 1 });
});

// ── Sensor simulation ────────────────────────────────────────────────────
// Replaces the old fixed 5s loop over 4 hardcoded zones. simulateTick()
// (Part 4) generates a new reading for every zone across every company
// whose mode is 'simulated'; we then push a company-scoped 'stateUpdate'
// to each company that has zones, so no company sees another's tick.
setInterval(async () => {
  try {
    await simulateTick();
    const companyIds = await Zone.distinct('companyId', { active: true });
    for (const companyId of companyIds) {
      emitToCompany(companyId, 'stateUpdate', await buildEnrichedZonesForCompany(companyId));
    }
  } catch (err) {
    console.error('Simulation tick failed:', err.message);
  }
}, 5000);

// permitCounter must stay globally unique across all companies (Permit.id
// has a global unique index), so it's seeded once at startup from every
// existing permit regardless of company.
async function initPermitCounter() {
  const docs = await PermitModel.find().select('id').lean();
  permitCounter = docs.reduce((max, p) => {
    const n = parseInt(String(p.id).replace('PTW-', ''), 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
  console.log(`✅ Permit counter initialized at ${permitCounter}`);
}

const PORT = process.env.PORT || 5000;
async function start() {
  await connectDB();
  await initPermitCounter();
  server.listen(PORT, () => console.log(`🚀 Shift Zero backend running on port ${PORT}`));
}
start().catch(err => {
  console.error('❌ Fatal startup error:', err);
  process.exit(1);
});
