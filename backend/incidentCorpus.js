// Synthetic incident corpus for RAG retrieval.
// Records are modeled on the PATTERN STRUCTURE of real, publicly reported
// Indian industrial incidents (DGFASLI fatal accident statistics, OISD
// incident bulletins, and the publicly reported investigation findings on
// the Jan 2025 Visakhapatnam Steel Plant coke oven battery explosion).
// Specific identifying details have been generalized — this is a synthetic
// training/demo corpus, not a copy of any single confidential report.

const incidents = [
  {
    id: 'INC-001',
    title: 'Coke oven gas accumulation preceded by downplayed handover note',
    summary: 'Gas pressure sensors at a coke oven battery showed a rising trend over several hours. Shift handover notes described the readings as routine and within normal variation. No escalation was raised until a sudden explosion occurred during confined maintenance work. Post-incident review found the verbal characterization of the readings did not match the sensor trend at handover time.',
    regulatoryReference: 'OISD-STD-222 (Coke Oven Safety), Factory Act Section 7A (Safety Officer duties)',
    recommendedAction: 'Immediately escalate to safety officer and halt any permit-to-work activity in the zone; cross-verify the most recent sensor trend against the handover language before accepting the shift; do not rely on verbal reassurance alone when sensor trend velocity exceeds baseline.',
    tags: ['gas accumulation', 'coke oven', 'handover mismatch', 'confined space', 'explosion']
  },
  {
    id: 'INC-002',
    title: 'Hot work permit issued near elevated gas reading zone',
    summary: 'A hot work permit was approved for an area within close proximity to a zone showing elevated combustible gas readings. The permit approval process did not cross-check live gas sensor data against the work location. The combination of an active ignition source and elevated gas concentration created a high-risk condition that went undetected until a near-miss was reported by a worker.',
    regulatoryReference: 'OISD-STD-105 (Permit to Work), PESO guidelines on hot work near hazardous areas',
    recommendedAction: 'Suspend the hot work permit immediately; require a fresh gas test before work resumes; flag the permit-issuing process for review since no geofencing/cross-check exists against live gas readings.',
    tags: ['permit conflict', 'hot work', 'gas reading', 'near miss']
  },
  {
    id: 'INC-003',
    title: 'Shift changeover communication gap before equipment failure',
    summary: 'A piece of rotating equipment showed early vibration anomalies noted informally by the outgoing shift but not formally logged or flagged as urgent. The incoming shift treated the verbal mention as low priority. The equipment failed catastrophically six hours later, causing a partial production stoppage and a minor injury.',
    regulatoryReference: 'Factory Act Section 7A, ISO 55000 Asset Management principles',
    recommendedAction: 'Treat informal verbal mentions of equipment anomalies as triggers for formal inspection, not just discussion; require vibration/thermal baseline comparison before shift sign-off.',
    tags: ['equipment failure', 'shift handover', 'vibration anomaly', 'informal communication']
  },
  {
    id: 'INC-004',
    title: 'Confined space entry during abnormal process conditions',
    summary: 'Workers entered a confined space for routine inspection while upstream process conditions were in an abnormal state (elevated temperature and pressure). The entry permit was approved based on standard checklist completion without verifying real-time process telemetry. No injury occurred, but a CAPA (corrective and preventive action) was raised after the deviation was discovered in a routine audit.',
    regulatoryReference: 'OISD-STD-222, DGMS confined space entry norms',
    recommendedAction: 'Block confined space entry approval when upstream process telemetry shows abnormal deviation; require a live telemetry check as a mandatory permit gate, not just a checklist item.',
    tags: ['confined space', 'abnormal process condition', 'permit approval', 'CAPA']
  },
  {
    id: 'INC-005',
    title: 'Near-miss pattern across multiple shifts not aggregated',
    summary: 'Three separate near-miss reports across different shifts over two weeks each individually appeared minor, but together described an escalating equipment degradation pattern. Because near-miss reports were filed independently without cross-shift aggregation, the pattern was not recognized until a fourth, more serious incident occurred.',
    regulatoryReference: 'OISD-GDN-206 (Near-Miss Reporting and Analysis)',
    recommendedAction: 'Aggregate near-miss reports across shifts for the same equipment/zone within a rolling time window; flag clusters of 3+ related near-misses for proactive inspection rather than waiting for a major incident.',
    tags: ['near miss', 'pattern recognition', 'cross-shift', 'equipment degradation']
  },
  {
    id: 'INC-006',
    title: 'Sensor data present but not connected to operational decision',
    summary: 'A facility with functioning gas detectors, SCADA, and permit-to-work systems experienced a fatal incident. Post-incident review found that all relevant sensor data existed and had in fact crossed informal concern thresholds, but no system or process connected that data to an operational decision (e.g. evacuation, work stoppage) before the incident occurred.',
    regulatoryReference: 'DGFASLI annual fatal accident review findings, Factory Act Section 7A',
    recommendedAction: 'This is the precise failure mode Shift Zero is built to close: route any sensor trend that exceeds informal concern thresholds directly into an operational alert, regardless of whether a human has verbally flagged it yet.',
    tags: ['data unacted upon', 'fatal incident', 'sensor SCADA gap', 'systemic failure']
  }
];

module.exports = { incidents };
