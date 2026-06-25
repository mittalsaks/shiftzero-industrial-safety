require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { generateSensorReading, zones } = require('./simulator');
const { scoreHandoverText } = require('./nlpRiskScorer');
const { getIncidentBackedRecommendation } = require('./ragEngine');

const { connectDB } = require('./db');
const SensorReadingModel = require('./models/SensorReading');
const HandoverLogModel = require('./models/HandoverLog');
const AlertModel = require('./models/Alert');
const PermitModel = require('./models/Permit');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ── Sensor history ring buffer (last 20 readings per zone) ──
const HISTORY_SIZE = 20;
const sensorHistory = {};
zones.forEach(z => { sensorHistory[z] = []; });

function pushHistory(zoneName, reading) {
  sensorHistory[zoneName].push(reading);
  if (sensorHistory[zoneName].length > HISTORY_SIZE)
    sensorHistory[zoneName].shift();

  // persist async, never blocks the in-memory path
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
      .sort({ timestamp: 1 })
      .limit(excess)
      .select('_id');
    await SensorReadingModel.deleteMany({ _id: { $in: oldest.map(d => d._id) } });
  }
}

// ── Permit-to-Work store (in-memory cache, DB-backed) ──
// Each permit: { id, zone, type, issuedAt, issuedBy, description, active }
let permits = [];
let permitCounter = 0; // highest numeric suffix seen so far, set during hydration

const DEFAULT_PERMITS = [
  {
    id: 'PTW-001',
    zone: 'CokeOvenBattery-3',
    type: 'HOT_WORK',
    issuedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    issuedBy: 'Shift Supervisor A. Rao',
    description: 'Welding repair on battery door frame #7',
    active: true
  },
  {
    id: 'PTW-002',
    zone: 'BlastFurnace-1',
    type: 'CONFINED_SPACE',
    issuedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    issuedBy: 'Shift Supervisor R. Mehta',
    description: 'Routine tuyere inspection, 2 workers inside',
    active: true
  },
  {
    id: 'PTW-003',
    zone: 'RollingMill-2',
    type: 'ELECTRICAL',
    issuedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    issuedBy: 'Shift Supervisor K. Das',
    description: 'Panel maintenance, LOTO applied',
    active: false
  }
];

function nextPermitId() {
  permitCounter += 1;
  return `PTW-${String(permitCounter).padStart(3, '0')}`;
}

// ── Risk prediction: time-to-critical estimate from trend velocity ──
function predictTimeToCritical(zoneState) {
  const { riskLevel, trendVelocity } = zoneState.sensor;
  if (riskLevel >= 1) return { minutesToCritical: 0, confident: true };
  if (trendVelocity <= 0.02) return { minutesToCritical: null, confident: false };
  const remaining = 1.0 - riskLevel;
  const ticksNeeded = remaining / trendVelocity;
  const secondsNeeded = ticksNeeded * 5;
  const minutesNeeded = Math.round(secondsNeeded / 60);
  return { minutesToCritical: Math.max(1, minutesNeeded), confident: trendVelocity > 0.1 };
}

// ── Permit conflict checker ──
function checkPermitConflicts(zoneState) {
  const activePermits = permits.filter(p => p.zone === zoneState.zone && p.active);
  if (activePermits.length === 0) return [];

  const conflicts = [];
  activePermits.forEach(permit => {
    if (permit.type === 'HOT_WORK' && zoneState.sensor.riskLevel > 0.4) {
      conflicts.push({
        permitId: permit.id,
        permitType: permit.type,
        description: permit.description,
        reason: `Hot work permit active while gas risk level is ${(zoneState.sensor.riskLevel * 100).toFixed(0)}% — ignition risk. Ref: OISD-STD-105.`,
        severity: zoneState.sensor.riskLevel > 0.7 ? 'CRITICAL' : 'HIGH'
      });
    }
    if (permit.type === 'CONFINED_SPACE' && zoneState.sensor.trendVelocity > 0.3) {
      conflicts.push({
        permitId: permit.id,
        permitType: permit.type,
        description: permit.description,
        reason: `Confined space entry active while sensor trend is escalating (velocity: ${zoneState.sensor.trendVelocity}). Ref: OISD-STD-222.`,
        severity: 'HIGH'
      });
    }
  });
  return conflicts;
}

// ── Build enriched state for a zone ──
function enrichZone(z) {
  const prediction = predictTimeToCritical(z);
  const permitConflicts = checkPermitConflicts(z);
  const activePermits = permits.filter(p => p.zone === z.zone && p.active);
  return {
    ...z,
    prediction,
    permitConflicts,
    activePermits,
    history: sensorHistory[z.zone] || []
  };
}

// ── In-memory live state ──
let liveState = zones.map(z => ({
  zone: z,
  sensor: generateSensorReading(z, 'normal'),
  lastHandover: null,
  mismatchScore: 0,
  alert: null
}));

// ── POST /api/handover ──
app.post('/api/handover', async (req, res) => {
  const { zone, text } = req.body;
  if (!zone || !text) return res.status(400).json({ error: 'zone and text required' });

  const zoneState = liveState.find(z => z.zone === zone);
  if (!zoneState) return res.status(404).json({ error: 'unknown zone' });

  const riskLanguageScore = await scoreHandoverText(text);
  const sensorRiskLevel = zoneState.sensor.riskLevel;
  const mismatch = Math.max(0, sensorRiskLevel - riskLanguageScore);

  const timestamp = new Date().toISOString();
  zoneState.lastHandover = { text, riskLanguageScore, timestamp };
  zoneState.mismatchScore = Math.round(mismatch * 100);

  // persist handover log async
  HandoverLogModel.create({
    zone, text, riskLanguageScore, mismatchScore: zoneState.mismatchScore, timestamp
  }).catch(err => console.error('HandoverLog save failed:', err.message));

  const permitConflicts = checkPermitConflicts(zoneState);

  if (zoneState.mismatchScore >= 60 || permitConflicts.some(c => c.severity === 'CRITICAL')) {
    const { matchedIncidents, recommendation } = await getIncidentBackedRecommendation(zone, text);
    zoneState.alert = {
      level: 'HIGH',
      message: `Verbal-Sensor Mismatch detected in ${zone}: handover note suggests calm conditions, but sensor trend shows escalating risk.`,
      evidence: { quote: text, sensorTrend: zoneState.sensor },
      matchedIncidents,
      recommendation,
      permitConflicts,
      timestamp: new Date().toISOString()
    };
    io.emit('alert', { zone, alert: zoneState.alert });

    // persist alert async — only when one is actually raised
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

// ── GET /api/state ──
app.get('/api/state', (req, res) => {
  res.json(liveState.map(enrichZone));
});

// ── GET /api/history/:zone ──
app.get('/api/history/:zone', (req, res) => {
  const h = sensorHistory[req.params.zone];
  if (!h) return res.status(404).json({ error: 'unknown zone' });
  res.json(h);
});

// ── GET /api/alerts (new — recent alerts, optional ?zone=) ──
app.get('/api/alerts', async (req, res) => {
  try {
    const filter = req.query.zone ? { zone: req.query.zone } : {};
    const alerts = await AlertModel.find(filter).sort({ timestamp: -1 }).limit(50).lean();
    res.json(alerts);
  } catch (err) {
    console.error('GET /api/alerts failed:', err.message);
    res.status(500).json({ error: 'failed to fetch alerts' });
  }
});

// ── GET /api/handover (new — recent handover logs, optional ?zone=) ──
app.get('/api/handover', async (req, res) => {
  try {
    const filter = req.query.zone ? { zone: req.query.zone } : {};
    const logs = await HandoverLogModel.find(filter).sort({ timestamp: -1 }).limit(50).lean();
    res.json(logs);
  } catch (err) {
    console.error('GET /api/handover failed:', err.message);
    res.status(500).json({ error: 'failed to fetch handover logs' });
  }
});

// ── GET /api/permits ──
app.get('/api/permits', (req, res) => res.json(permits));

// ── POST /api/permits ──
app.post('/api/permits', async (req, res) => {
  const { zone, type, issuedBy, description } = req.body;
  if (!zone || !type || !issuedBy || !description)
    return res.status(400).json({ error: 'zone, type, issuedBy, description required' });

  const permit = {
    id: nextPermitId(),
    zone, type, issuedBy, description,
    issuedAt: new Date().toISOString(),
    active: true
  };
  permits.push(permit);
  io.emit('permitsUpdate', permits);

  try {
    await PermitModel.create(permit);
  } catch (err) {
    console.error('Permit save failed:', err.message);
  }

  res.json(permit);
});

// ── PATCH /api/permits/:id/close ──
app.patch('/api/permits/:id/close', async (req, res) => {
  const permit = permits.find(p => p.id === req.params.id);
  if (!permit) return res.status(404).json({ error: 'permit not found' });
  permit.active = false;
  io.emit('permitsUpdate', permits);

  try {
    await PermitModel.updateOne({ id: permit.id }, { active: false });
  } catch (err) {
    console.error('Permit close-persist failed:', err.message);
  }

  res.json(permit);
});

// ── GET /api/health ──
app.get('/api/health', (req, res) => {
  const mongoose = require('mongoose');
  res.json({ status: 'ok', dbConnected: mongoose.connection.readyState === 1 });
});

// ── Sensor simulation loop every 5s ──
setInterval(() => {
  liveState = liveState.map(z => {
    const mode = z.zone === 'CokeOvenBattery-3' ? 'escalating' : 'normal';
    const newSensor = generateSensorReading(z.zone, mode);
    pushHistory(z.zone, newSensor);
    return { ...z, sensor: newSensor };
  });
  io.emit('stateUpdate', liveState.map(enrichZone));
}, 5000);

// ── Startup: connect DB, hydrate permits + history, then listen ──
async function hydrateFromDB() {
  // Permits: seed defaults only if collection is empty, else load real data
  const existingCount = await PermitModel.countDocuments();
  if (existingCount === 0) {
    await PermitModel.insertMany(DEFAULT_PERMITS);
    permits = DEFAULT_PERMITS.map(p => ({ ...p }));
    console.log('🌱 Seeded default permits (DB was empty)');
  } else {
    const docs = await PermitModel.find().lean();
    permits = docs.map(({ _id, ...rest }) => rest);
    console.log(`✅ Loaded ${permits.length} permits from DB`);
  }

  // permit counter continues from highest existing numeric suffix
  permitCounter = permits.reduce((max, p) => {
    const n = parseInt(p.id.replace('PTW-', ''), 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);

  // Sensor history: only seed synthetic data for zones with zero DB history.
  // Real history (if any) is loaded into the in-memory ring buffer; zones
  // with no prior data get the synthetic ramp like before, so the demo
  // never opens to empty charts but real runs are never overwritten.
  for (const zoneName of zones) {
    const existing = await SensorReadingModel.find({ zone: zoneName })
      .sort({ timestamp: -1 })
      .limit(HISTORY_SIZE)
      .lean();

    if (existing.length > 0) {
      sensorHistory[zoneName] = existing.reverse().map(({ zone, gasPpm, tempC, trendVelocity, riskLevel, timestamp }) => (
        { zoneName: zone, gasPpm, tempC, trendVelocity, riskLevel, timestamp }
      ));
      console.log(`✅ Loaded ${existing.length} sensor readings for ${zoneName} from DB`);
    } else {
      const mode = zoneName === 'CokeOvenBattery-3' ? 'escalating' : 'normal';
      for (let i = 0; i < 10; i++) {
        pushHistory(zoneName, generateSensorReading(zoneName, mode));
      }
      console.log(`🌱 Seeded synthetic history for ${zoneName} (DB was empty)`);
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