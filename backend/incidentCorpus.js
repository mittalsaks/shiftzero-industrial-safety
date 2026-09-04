// Synthetic incident corpus for RAG retrieval.
//
// PART 5 — genericized. The original corpus was modeled tightly on steel-plant
// incidents (coke ovens, blast furnaces). Shift Zero now serves any industry
// an admin defines zones for — a warehouse, a hospital ward, a construction
// site, a data center, a retail floor — so the corpus is rewritten around
// FAILURE PATTERNS that recur across industries, not one industry's
// equipment. `industryExamples` shows how the same pattern shows up in
// different settings so the AI recommendation stays concrete regardless of
// what the admin named their zones or which metrics they track.

const incidents = [
  {
    id: 'INC-001',
    title: 'Rising risk trend described as routine in handover notes',
    summary: 'A monitored condition (a gas/temperature reading, a queue length, a patient vital, an equipment vibration) climbed steadily over several hours. Shift handover notes described it as normal variation each time. No escalation was raised until the condition crossed a critical threshold, at which point the gap between what was logged and what was actually trending was discovered.',
    regulatoryReference: "Applicable industry safety/quality SOP on trend-based escalation — check your organization's own policy",
    recommendedAction: 'Escalate to the on-duty supervisor and pause activity in the zone until the reading is independently re-checked; cross-verify the most recent numeric trend against the handover language before accepting the shift.',
    tags: ['rising trend', 'handover mismatch', 'downplayed risk', 'shift changeover'],
    industryExamples: ['manufacturing gas/temp sensor', 'hospital vital-signs monitor', 'warehouse conveyor vibration', 'data center rack temperature']
  },
  {
    id: 'INC-002',
    title: 'Work authorized near a zone already showing elevated risk',
    summary: 'A work permit, access grant, or task assignment was approved for a zone (or one adjacent to it) that was already showing an elevated reading, without cross-checking the zone\'s live status at approval time. The combination of active work and elevated risk created a hazardous condition that went undetected until a near-miss was reported.',
    regulatoryReference: "Your organization's permit-to-work / access-control policy",
    recommendedAction: 'Suspend the permit or access grant immediately; require a fresh status check on the zone before work resumes; flag the approval process for review since no automatic check exists against the zone\'s live status.',
    tags: ['permit conflict', 'access conflict', 'elevated risk', 'near miss']
  },
  {
    id: 'INC-003',
    title: 'Shift changeover communication gap before a failure',
    summary: 'An early anomaly (unusual noise, a minor error-rate uptick, an odd smell, a small delay) was mentioned informally by the outgoing shift but not formally logged or flagged as urgent. The incoming shift treated the verbal mention as low priority, and the underlying issue escalated into a more serious failure hours later.',
    regulatoryReference: 'Shift handover / changeover documentation policy',
    recommendedAction: 'Treat informal verbal mentions of anomalies as triggers for a formal check, not just discussion; require a baseline comparison (readings, logs, or inspection) before shift sign-off rather than accepting a verbal "it\'s fine."',
    tags: ['equipment failure', 'shift handover', 'informal communication', 'anomaly']
  },
  {
    id: 'INC-004',
    title: 'Entry or access approved during an abnormal condition',
    summary: 'Personnel entered or accessed a zone for routine work while an upstream or related condition was in an abnormal state, because approval was based on a standard checklist rather than the zone\'s real-time status. No injury or loss occurred, but the deviation was flagged in a later audit.',
    regulatoryReference: 'Restricted-access / confined-entry norms applicable to your industry',
    recommendedAction: 'Block entry or access approval when the zone\'s live status shows an abnormal deviation; require a real-time status check as a mandatory approval gate, not just a checklist item.',
    tags: ['abnormal condition', 'access approval', 'checklist gap']
  },
  {
    id: 'INC-005',
    title: 'Recurring minor incidents not connected across shifts',
    summary: 'Several separate minor incident or near-miss reports across different shifts over a short period each individually appeared low priority, but together described an escalating pattern in the same zone. Because reports were filed independently without cross-shift aggregation, the pattern was not recognized until a more serious incident occurred.',
    regulatoryReference: 'Near-miss / incident aggregation and trend-review policy',
    recommendedAction: 'Aggregate minor incident/near-miss reports for the same zone within a rolling time window; flag clusters of 3 or more related reports for proactive review rather than waiting for a major incident.',
    tags: ['near miss', 'pattern recognition', 'cross-shift', 'recurring issue']
  },
  {
    id: 'INC-006',
    title: 'Monitoring data existed but was never connected to a decision',
    summary: 'A team had functioning monitoring in place (sensors, dashboards, status logs), and a post-incident review found the relevant data had crossed an informal concern threshold well before the incident — but no process connected that data to an operational decision (stopping work, escalating, reassigning staff) before it happened.',
    regulatoryReference: 'General duty of care / operational risk-management principles applicable to your industry',
    recommendedAction: 'This is the precise failure mode a verbal-status mismatch alert is built to close: route any status or reading that crosses a concern threshold directly into an operational alert, regardless of whether a person has verbally flagged it yet.',
    tags: ['data unacted upon', 'systemic failure', 'monitoring gap']
  }
];

module.exports = { incidents };
