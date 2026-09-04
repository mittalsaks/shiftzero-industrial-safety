// backend/simulator.js
//
// PART 4 — zone/metric-aware simulation engine.
// Generates synthetic sensor readings only for zones an admin has set to
// mode: 'simulated'. Zones set to 'manual' never get auto-generated data —
// their readings only ever come from team members via
// POST /api/zones/:id/status (see routes/zoneRoutes.js).
//
// This replaces the old hardcoded 4-zone, gas/temp-only steel-plant engine:
// an admin can now define whatever metrics matter for their industry
// (gas ppm, temperature, noise dB, occupancy, humidity, anything) through
// Zone.metricConfig, and this file generates a plausible value for each one.

const Zone = require('./models/Zone');
const SensorReading = require('./models/SensorReading');

const DEFAULT_RANGE = { min: 0, max: 100 };

function randomInRange(min, max) {
  return +(min + Math.random() * (max - min)).toFixed(2);
}

// Generates one value for a single metric definition. `escalating` biases the
// value toward/above its warning-critical band, to simulate a worsening
// trend for demos — the old code special-cased this for CokeOvenBattery-3
// only; now any zone/metric can be escalated the same way.
function generateMetricValue(metric, escalating) {
  const min = metric.min ?? DEFAULT_RANGE.min;
  const max = metric.max ?? DEFAULT_RANGE.max;
  const warn = metric.warningThreshold ?? (min + (max - min) * 0.6);
  const crit = metric.criticalThreshold ?? (min + (max - min) * 0.85);

  if (escalating) {
    const low = warn;
    const high = Math.min(max, Math.max(low + 0.1, crit + (crit - warn) * 0.5));
    return randomInRange(low, high);
  }
  const calmHigh = Math.min(max, warn > min ? warn : max);
  return randomInRange(min, Math.max(min + 0.1, calmHigh));
}

// Derives an overall 0–1 riskLevel + trendVelocity from however many metrics
// a zone tracks, so existing alert/prediction logic (which expects
// { riskLevel, trendVelocity }) keeps working no matter the industry.
// Exported so routes/zoneRoutes.js can reuse the same scoring for manual
// team-member submissions.
function deriveRiskFromMetrics(metricConfig, values, escalating = false) {
  if (!metricConfig || metricConfig.length === 0) {
    return {
      riskLevel: escalating ? +(0.55 + Math.random() * 0.35).toFixed(2) : +(Math.random() * 0.25).toFixed(2),
      trendVelocity: escalating ? +(0.6 + Math.random() * 0.3).toFixed(2) : +(Math.random() * 0.2).toFixed(2),
    };
  }
  let worst = 0;
  metricConfig.forEach(m => {
    const v = values[m.key];
    if (v === undefined || v === null) return;
    const min = m.min ?? DEFAULT_RANGE.min;
    const max = m.max ?? DEFAULT_RANGE.max;
    const warn = m.warningThreshold ?? (min + (max - min) * 0.6);
    const crit = m.criticalThreshold ?? (min + (max - min) * 0.85);
    const ratio = crit > warn ? Math.max(0, Math.min(1, (v - warn) / (crit - warn))) : 0;
    worst = Math.max(worst, ratio);
  });
  return {
    riskLevel: +Math.min(1, worst).toFixed(2),
    trendVelocity: escalating ? +(0.5 + Math.random() * 0.35).toFixed(2) : +(Math.random() * 0.2).toFixed(2),
  };
}

// Generates one synthetic reading for a single Zone document.
function generateReadingForZone(zone, escalating = false) {
  const metrics = {};
  (zone.metricConfig || []).forEach(m => {
    metrics[m.key] = generateMetricValue(m, escalating);
  });
  const { riskLevel, trendVelocity } = deriveRiskFromMetrics(zone.metricConfig || [], metrics, escalating);

  return {
    companyId: zone.companyId,
    zoneId: zone._id,
    zone: zone.name,
    source: 'simulated',
    metrics,
    // Legacy fixed fields — mirrored only if the zone happens to track these
    // exact keys, so any old report/UI code reading them directly still works.
    gasPpm: metrics.gasPpm ?? null,
    tempC: metrics.tempC ?? null,
    trendVelocity,
    riskLevel,
    timestamp: new Date().toISOString(),
  };
}

// Runs one simulation tick across every 'simulated' zone (optionally scoped
// to one company), saves each reading, and returns them. This is the
// zone-aware replacement for the old fixed-interval, 4-zone loop.
async function simulateTick(companyId = null) {
  const filter = { mode: 'simulated', active: true, ...(companyId ? { companyId } : {}) };
  const simulatedZones = await Zone.find(filter).lean();

  const readings = [];
  for (const zone of simulatedZones) {
    const reading = generateReadingForZone(zone, false);
    readings.push(reading);
    await SensorReading.create(reading).catch(err =>
      console.error(`SensorReading save failed (${zone.name}):`, err.message)
    );
  }
  return readings;
}

// ─────────────────────────────────────────────────────────────────────────
// LEGACY (pre-multi-tenant) API — server.js now runs entirely on the
// zone-aware engine above (Part 6 rewired it to per-company Zone docs +
// simulateTick() on an interval). These two exports are kept only in case
// anything external still imports them; nothing new should use them.
// ─────────────────────────────────────────────────────────────────────────
const LEGACY_ZONES = ['CokeOvenBattery-3', 'BlastFurnace-1', 'RollingMill-2', 'GasStorage-Yard'];

function generateSensorReading(zoneName, mode = 'normal') {
  const baseGas = 18;
  const baseTemp = 45;
  let gasPpm, tempC, trendVelocity, riskLevel;

  if (mode === 'escalating') {
    gasPpm = +(baseGas + Math.random() * 25 + 10).toFixed(1);
    tempC = +(baseTemp + Math.random() * 8 + 4).toFixed(1);
    trendVelocity = +(0.6 + Math.random() * 0.3).toFixed(2);
    riskLevel = Math.min(1, 0.55 + Math.random() * 0.35);
  } else {
    gasPpm = +(baseGas + Math.random() * 6 - 3).toFixed(1);
    tempC = +(baseTemp + Math.random() * 4 - 2).toFixed(1);
    trendVelocity = +(Math.random() * 0.2).toFixed(2);
    riskLevel = +(Math.random() * 0.25).toFixed(2);
  }

  return { zoneName, gasPpm, tempC, trendVelocity, riskLevel, timestamp: new Date().toISOString() };
}

module.exports = {
  // Part 4 — zone/metric-aware engine
  generateReadingForZone,
  simulateTick,
  deriveRiskFromMetrics,
  // Legacy — still used by server.js until Part 6
  generateSensorReading,
  zones: LEGACY_ZONES,
};
