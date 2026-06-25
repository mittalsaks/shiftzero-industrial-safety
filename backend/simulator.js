// Generates realistic synthetic sensor readings for demo purposes,
// since real plant SCADA access isn't available during the hackathon.

const zones = ['CokeOvenBattery-3', 'BlastFurnace-1', 'RollingMill-2', 'GasStorage-Yard'];

function generateSensorReading(zoneName, mode = 'normal') {
  const baseGas = 18; // ppm baseline
  const baseTemp = 45; // celsius baseline

  let gasPpm, tempC, trendVelocity, riskLevel;

  if (mode === 'escalating') {
    // Simulates a slow-building dangerous trend, like the Vizag gas accumulation pattern
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

module.exports = { generateSensorReading, zones };
