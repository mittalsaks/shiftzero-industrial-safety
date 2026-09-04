import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import PlantGeospatialView from './PlantGeospatialView';
import LandingPage from './LandingPage';
import './App.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

// ── Keep-alive ping so Render free tier doesn't sleep ────────────────────────
const PING_INTERVAL_MS = 14 * 60 * 1000;
setInterval(() => {
  fetch(`${BACKEND_URL}/api/state`).catch(() => {});
}, PING_INTERVAL_MS);

// PART 6 — backend now scopes every Socket.IO event to a per-company room
// and only joins that room if a valid JWT is sent at connect time, so this
// must send the current authToken (see server.js `io.use(...)`).
const socket = io(BACKEND_URL, { auth: { token: localStorage.getItem('authToken') } });
// Re-authenticate the socket after login (authToken wasn't set yet on first
// connect if the page loaded before the user logged in).
function reconnectSocketWithAuth() {
  socket.auth = { token: localStorage.getItem('authToken') };
  socket.disconnect().connect();
}

// ── Auth header helper — token har protected request pe bhejo ─────────────────
const authHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
});

function riskColor(score) {
  if (score >= 60) return '#ff3a3a';
  if (score >= 30) return '#ffaa00';
  return '#00ffb4';
}

function riskLabel(score) {
  if (score >= 60) return 'CRITICAL';
  if (score >= 30) return 'ELEVATED';
  return 'NOMINAL';
}

// ── Generic metric readout ────────────────────────────────────────────────────
// Zones are now admin-defined per organization (Part 3/7) — a zone can track
// any metrics or none at all. This replaces the old hardcoded gasPpm/tempC
// reads so the UI works for any industry instead of just the steel-plant demo.
function zoneMetricEntries(z) {
  const cfg = z.metricConfig || [];
  return cfg
    .map(m => ({ key: m.key, label: m.label, unit: m.unit || '', value: z.sensor?.metrics?.[m.key] }))
    .filter(m => m.value !== undefined && m.value !== null);
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ history, field = 'riskLevel', accessor, color }) {
  if (!history || history.length < 2) return <div className="sparkline-empty">--</div>;
  const getVal = accessor || (h => h[field]);
  const vals = history.map(h => Number(getVal(h)) || 0);
  const min = Math.min(...vals);
  const max = Math.max(...vals) || 1;
  const W = 80, H = 28;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - ((v - min) / (max - min + 0.001)) * (H - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  const lastPt = pts.split(' ').at(-1).split(',');
  return (
    <svg width={W} height={H} className="sparkline-svg">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" opacity="0.8" />
      <circle cx={lastPt[0]} cy={lastPt[1]} r="2.5" fill={color} />
    </svg>
  );
}

// ── Risk Arc gauge ────────────────────────────────────────────────────────────

function RiskArc({ score }) {
  const r = 28, cx = 36, cy = 36;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(score / 100, 1);
  const dash = circ * pct;
  const color = riskColor(score);
  return (
    <svg width="72" height="72" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dasharray 0.6s ease' }} />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        style={{ transform: 'rotate(90deg)', transformOrigin: `${cx}px ${cy}px` }}
        fill={color} fontSize="11" fontWeight="700" fontFamily="monospace">{score}</text>
    </svg>
  );
}

// ── Time-to-Critical pill ─────────────────────────────────────────────────────

function TimeToCritical({ prediction }) {
  if (!prediction || !prediction.confident || prediction.minutesToCritical === null) return null;
  if (prediction.minutesToCritical === 0) return (
    <div className="ttc-pill ttc-now">!! CRITICAL NOW</div>
  );
  return (
    <div className={`ttc-pill ${prediction.minutesToCritical <= 5 ? 'ttc-urgent' : 'ttc-warn'}`}>
      CRITICAL IN ~{prediction.minutesToCritical}min
    </div>
  );
}

// ── Permit conflict badge ─────────────────────────────────────────────────────

function PermitConflictBadge({ conflicts }) {
  if (!conflicts || conflicts.length === 0) return null;
  const worst = conflicts.find(c => c.severity === 'CRITICAL') || conflicts[0];
  return (
    <div className={`permit-conflict-badge ${worst.severity === 'CRITICAL' ? 'perm-critical' : 'perm-high'}`}>
      [!] PTW CONFLICT: {worst.permitType}
    </div>
  );
}

// ── Sidebar nav icons (minimal line icons, replace old [x]-style text glyphs) ──
const iconProps = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
const IconDashboard = () => (<svg {...iconProps}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>);
const IconHandover = () => (<svg {...iconProps}><path d="M4 7h11l-3-3" /><path d="M20 17H9l3 3" /></svg>);
const IconStatus = () => (<svg {...iconProps}><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>);
const IconAlerts = () => (<svg {...iconProps}><path d="M12 3l9 16H3z" /><path d="M12 10v4" /><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" /></svg>);
const IconPermits = () => (<svg {...iconProps}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>);
const IconShifts = () => (<svg {...iconProps}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>);
const IconTeam = () => (<svg {...iconProps}><circle cx="9" cy="8" r="3" /><path d="M2 20c0-3.3 3-6 7-6s7 2.7 7 6" /><circle cx="17" cy="7" r="2.3" /><path d="M15.5 13.2c2.6.4 4.5 2.4 4.5 4.8" /></svg>);
const IconMap = () => (<svg {...iconProps}><path d="M9 4v16M15 4v16" /><path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2z" /></svg>);
const IconZones = () => (<svg {...iconProps}><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>);
const IconUsers = () => (<svg {...iconProps}><circle cx="8" cy="8" r="3.2" /><path d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M15 5.5a3 3 0 010 6" /><path d="M17 14c2.4.5 4 2.6 4 5" /></svg>);

// ── Zone Card ─────────────────────────────────────────────────────────────────

function ZoneCard({ z, onClick }) {
  const color = riskColor(z.mismatchScore);
  const isCritical = z.mismatchScore >= 60;
  const metrics = zoneMetricEntries(z).slice(0, 2);
  const sparkMetric = metrics[0];
  return (
    <div
      className={`zone-card ${isCritical ? 'zone-critical' : ''}`}
      style={{ '--zone-color': color }}
      onClick={() => onClick(z)}
      title="Click for details"
    >
      {isCritical && <div className="critical-pulse" />}
      <div className="zone-header">
        <div style={{ minWidth: 0 }}>
          <div className="zone-name">{z.zone}</div>
          <div className="zone-status" style={{ color }}>{riskLabel(z.mismatchScore)}</div>
        </div>
        <RiskArc score={z.mismatchScore} />
      </div>

      <div className="zone-sensors">
        {metrics.map(m => (
          <div className="sensor-item" key={m.key}>
            <span className="sensor-label">{m.label.length > 10 ? m.label.slice(0, 9) + '…' : m.label.toUpperCase()}</span>
            <span className="sensor-value">{m.value} {m.unit && <span className="sensor-unit">{m.unit}</span>}</span>
          </div>
        ))}
        <div className="sensor-item">
          <span className="sensor-label">RISK</span>
          <span className="sensor-value">{(z.sensor.riskLevel * 100).toFixed(0)}<span className="sensor-unit">%</span></span>
        </div>
        {metrics.length === 0 && (
          <div className="sensor-item">
            <span className="sensor-label">MODE</span>
            <span className="sensor-value" style={{ fontSize: 12 }}>{z.mode === 'simulated' ? 'SIM' : 'MANUAL'}</span>
          </div>
        )}
      </div>

      <div className="risk-track">
        <div className="risk-fill" style={{ width: `${z.sensor.riskLevel * 100}%`, background: color, boxShadow: `0 0 8px ${color}` }} />
      </div>

      <div className="zone-spark-row">
        {sparkMetric && (
          <div className="spark-item">
            <span className="spark-label">{sparkMetric.label.slice(0, 10).toUpperCase()} TREND</span>
            <Sparkline history={z.history} accessor={h => h.metrics?.[sparkMetric.key]} color={color} />
          </div>
        )}
        <div className="spark-item">
          <span className="spark-label">RISK TREND</span>
          <Sparkline history={z.history} field="riskLevel" color={color} />
        </div>
      </div>

      <div className="zone-badges">
        <TimeToCritical prediction={z.prediction} />
        <PermitConflictBadge conflicts={z.permitConflicts} />
        {z.activePermits?.length > 0 && (
          <div className="active-permit-badge">
            [P] {z.activePermits.length} ACTIVE PERMIT{z.activePermits.length > 1 ? 'S' : ''}
          </div>
        )}
        {isCritical && <div className="zone-alert-badge">[!] VERBAL-SENSOR MISMATCH</div>}
        {z.onDuty?.length > 0 ? (
          <div className="active-permit-badge" title={z.onDuty.map(s => s.userEmail).join(', ')}>
            [S] {z.onDuty.map(s => s.userName).join(', ')} on duty
          </div>
        ) : (
          <div className="active-permit-badge" style={{ opacity: 0.4 }}>[S] no one rostered</div>
        )}
      </div>
    </div>
  );
}

// ── Zone Detail Modal ─────────────────────────────────────────────────────────

function ZoneModal({ z, onClose }) {
  if (!z) return null;
  const color = riskColor(z.mismatchScore);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-zone-name">{z.zone}</div>
            <div className="modal-zone-status" style={{ color }}>{riskLabel(z.mismatchScore)}</div>
          </div>
          <button className="modal-close" onClick={onClose}>X</button>
        </div>

        <div className="modal-body">
          <div className="modal-section-label">LIVE SENSORS</div>
          <div className="modal-sensor-grid">
            {[
              ...(z.metricConfig || []).map(m => {
                const val = z.sensor?.metrics?.[m.key];
                return {
                  label: m.label,
                  value: val != null ? `${val}${m.unit ? ' ' + m.unit : ''}` : '—',
                  warn: m.warningThreshold != null && val != null && val >= m.warningThreshold,
                };
              }),
              { label: 'Risk Level', value: `${(z.sensor.riskLevel * 100).toFixed(0)}%`, warn: z.sensor.riskLevel > 0.5 },
              { label: 'Trend Velocity', value: z.sensor.trendVelocity, warn: z.sensor.trendVelocity > 0.4 },
            ].map(s => (
              <div key={s.label} className={`modal-sensor-cell ${s.warn ? 'modal-sensor-warn' : ''}`}>
                <div className="modal-sensor-lbl">{s.label}</div>
                <div className="modal-sensor-val" style={{ color: s.warn ? color : undefined }}>{s.value}</div>
              </div>
            ))}
          </div>

          {z.prediction?.confident && z.prediction.minutesToCritical !== null && (
            <div className="modal-prediction">
              <div className="modal-section-label">RISK PREDICTION</div>
              <div className="prediction-box" style={{ borderColor: color }}>
                <span className="pred-icon">[~]</span>
                {z.prediction.minutesToCritical === 0
                  ? 'Zone is at CRITICAL level now — immediate action required'
                  : `At current escalation rate, ${z.zone} will reach CRITICAL in ~${z.prediction.minutesToCritical} minutes`
                }
              </div>
            </div>
          )}

          <div className="modal-section-label">SENSOR HISTORY ({z.history?.length || 0} readings)</div>
          <div className="modal-charts">
            <div className="modal-chart-block">
              <div className="chart-label">Risk Level</div>
              <MiniChart history={z.history} field="riskLevel" color="#ffaa00" />
            </div>
            {(z.metricConfig || []).slice(0, 2).map(m => (
              <div className="modal-chart-block" key={m.key}>
                <div className="chart-label">{m.label}{m.unit ? ` (${m.unit})` : ''}</div>
                <MiniChart history={z.history} accessor={h => h.metrics?.[m.key]} color="#4dd8c0" />
              </div>
            ))}
          </div>

          {z.activePermits?.length > 0 && (
            <>
              <div className="modal-section-label">ACTIVE PERMITS</div>
              <div className="modal-permits">
                {z.activePermits.map(p => (
                  <div key={p.id} className="modal-permit-row">
                    <span className={`permit-type-tag pt-${p.type}`}>{p.type.replace('_', ' ')}</span>
                    <span className="permit-id">{p.id}</span>
                    <span className="permit-desc">{p.description}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {z.permitConflicts?.length > 0 && (
            <>
              <div className="modal-section-label">[!] PERMIT CONFLICTS</div>
              {z.permitConflicts.map(c => (
                <div key={c.permitId} className={`conflict-card ${c.severity === 'CRITICAL' ? 'conf-critical' : 'conf-high'}`}>
                  <div className="conflict-header">
                    <span className="conf-permit">{c.permitId} · {c.permitType}</span>
                    <span className={`conf-sev sev-${c.severity}`}>{c.severity}</span>
                  </div>
                  <div className="conflict-reason">{c.reason}</div>
                </div>
              ))}
            </>
          )}

          {z.lastHandover && (
            <>
              <div className="modal-section-label">LAST HANDOVER NOTE</div>
              <div className="modal-handover-note">
                <div className="hov-quote">"{z.lastHandover.text}"</div>
                <div className="hov-meta">
                  Risk language score: <strong>{(z.lastHandover.riskLanguageScore * 100).toFixed(0)}%</strong>
                  &nbsp;· Submitted {new Date(z.lastHandover.timestamp).toLocaleTimeString('en-IN')}
                </div>
                <AttachmentGallery attachments={z.lastHandover.attachments} />
              </div>
            </>
          )}

          {z.sensor?.source === 'manual' && z.sensor?.note && (
            <>
              <div className="modal-section-label">LAST STATUS UPDATE NOTE</div>
              <div className="modal-handover-note">
                <div className="hov-quote">"{z.sensor.note}"</div>
                <div className="hov-meta">
                  Submitted by <strong>{z.sensor.submittedBy || 'team member'}</strong>
                  &nbsp;· {new Date(z.sensor.timestamp).toLocaleTimeString('en-IN')}
                </div>
                <AttachmentGallery attachments={z.sensor.attachments} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Full mini-chart for modal ─────────────────────────────────────────────────

function MiniChart({ history, field, accessor, color }) {
  if (!history || history.length < 2) return <div className="minichart-empty">No data yet</div>;
  const getVal = accessor || (h => h[field]);
  const vals = history.map(h => Number(getVal(h)) || 0);
  const min = Math.min(...vals);
  const max = Math.max(...vals) || 1;
  const W = 200, H = 48;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - ((v - min) / (max - min + 0.001)) * (H - 6) - 3;
    return `${x},${y}`;
  }).join(' ');
  const fillPts = `0,${H} ` + pts + ` ${W},${H}`;
  const gradId = `grad-${field || Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="minichart-svg">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      {vals.map((v, i) => {
        const x = (i / (vals.length - 1)) * W;
        const y = H - ((v - min) / (max - min + 0.001)) * (H - 6) - 3;
        return <circle key={i} cx={x} cy={y} r="1.5" fill={color} opacity="0.5" />;
      })}
    </svg>
  );
}

// ── Permits Tab ───────────────────────────────────────────────────────────────

function PermitsTab({ liveState, userRole }) {
  const isAdmin = ['admin', 'super_admin'].includes(userRole);
  const [permits, setPermits] = useState([]);
  const [newPermit, setNewPermit] = useState({ zone: '', type: 'HOT_WORK', issuedBy: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(null);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/permits`, { headers: authHeaders() }).then(r => r.json()).then(setPermits);
    socket.on('permitsUpdate', setPermits);
    return () => socket.off('permitsUpdate');
  }, []);

  const allZones = liveState.map(z => z.zone);

  const issuePermit = async () => {
    if (!newPermit.zone || !newPermit.issuedBy || !newPermit.description) return;
    setSubmitting(true);
    await fetch(`${BACKEND_URL}/api/permits`, {
      method: 'POST',
      headers: authHeaders(),   // ✅ token bheja ja raha hai
      body: JSON.stringify(newPermit)
    });
    setNewPermit({ zone: '', type: 'HOT_WORK', issuedBy: '', description: '' });
    setSubmitting(false);
  };

  const closePermit = async (id) => {
    setClosing(id);
    await fetch(`${BACKEND_URL}/api/permits/${id}/close`, {
      method: 'PATCH',
      headers: authHeaders(),   // ✅ token bheja ja raha hai
    });
    setClosing(null);
  };

  const active = permits.filter(p => p.active);
  const closed = permits.filter(p => !p.active);
  const allConflicts = liveState.flatMap(z => (z.permitConflicts || []).map(c => ({ ...c, zone: z.zone })));

  return (
    <div className="permits-tab">
      {/* Conflict banner */}
      {allConflicts.length > 0 && (
        <div className="permit-conflict-banner">
          <span className="pcb-icon">[!] </span>
          <div>
            <strong>{allConflicts.length} PERMIT CONFLICT{allConflicts.length > 1 ? 'S' : ''} DETECTED</strong>
            {allConflicts.map(c => (
              <div key={c.permitId} className="pcb-detail">
                [{c.zone}] {c.permitId} — {c.reason.slice(0, 100)}...
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="permits-layout">
        {/* Active permits list */}
        <div className="permits-list-panel">
          <div className="panel-header">
            <span className="panel-title">ACTIVE PERMITS</span>
            <span className="panel-count">{active.length}</span>
          </div>
          {active.length === 0 ? (
            <div className="permits-empty">No active permits</div>
          ) : (
            active.map(p => {
              const conflict = allConflicts.find(c => c.permitId === p.id);
              return (
                <div key={p.id} className={`permit-card ${conflict ? 'permit-conflicted' : ''}`}>
                  <div className="permit-card-header">
                    <span className={`permit-type-tag pt-${p.type}`}>{p.type.replace('_', ' ')}</span>
                    <span className="permit-id-tag">{p.id}</span>
                    {conflict && <span className={`conf-sev sev-${conflict.severity}`}>{conflict.severity}</span>}
                  </div>
                  <div className="permit-zone-row">
                    <span className="perm-zone-dot" />
                    {p.zone}
                  </div>
                  <div className="permit-desc-text">{p.description}</div>
                  <div className="permit-meta">
                    Issued by {p.issuedBy} · {new Date(p.issuedAt).toLocaleTimeString('en-IN')}
                  </div>
                  {conflict && (
                    <div className="permit-conflict-inline">[!] {conflict.reason}</div>
                  )}
                  {/* ✅ Close button sirf admin ko dikhta hai */}
                  {isAdmin && (
                    <button
                      className="close-permit-btn"
                      onClick={() => closePermit(p.id)}
                      disabled={closing === p.id}
                    >
                      {closing === p.id ? 'Closing...' : '[x] Close Permit'}
                    </button>
                  )}
                </div>
              );
            })
          )}

          {closed.length > 0 && (
            <>
              <div className="panel-header" style={{ marginTop: 20 }}>
                <span className="panel-title" style={{ opacity: 0.5 }}>CLOSED PERMITS</span>
                <span className="panel-count" style={{ opacity: 0.5 }}>{closed.length}</span>
              </div>
              {closed.map(p => (
                <div key={p.id} className="permit-card permit-closed">
                  <div className="permit-card-header">
                    <span className={`permit-type-tag pt-${p.type}`} style={{ opacity: 0.5 }}>{p.type.replace('_', ' ')}</span>
                    <span className="permit-id-tag" style={{ opacity: 0.5 }}>{p.id}</span>
                    <span className="closed-tag">CLOSED</span>
                  </div>
                  <div className="permit-desc-text" style={{ opacity: 0.5 }}>{p.description} — {p.zone}</div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* ✅ Issue new permit — sirf admin ko dikhta hai, operator ko locked panel */}
        {isAdmin ? (
          <div className="issue-permit-panel">
            <div className="panel-header">
              <span className="panel-title">ISSUE NEW PERMIT</span>
            </div>
            <div className="issue-form">
              <div className="form-group">
                <label className="form-label">ZONE</label>
                <select className="form-select" value={newPermit.zone} onChange={e => setNewPermit(p => ({ ...p, zone: e.target.value }))}>
                  <option value="">-- select zone --</option>
                  {allZones.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">PERMIT TYPE</label>
                <select className="form-select" value={newPermit.type} onChange={e => setNewPermit(p => ({ ...p, type: e.target.value }))}>
                  <option value="HOT_WORK">Hot Work</option>
                  <option value="CONFINED_SPACE">Confined Space Entry</option>
                  <option value="ELECTRICAL">Electrical / LOTO</option>
                  <option value="HEIGHT_WORK">Work at Height</option>
                  <option value="EXCAVATION">Excavation</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">ISSUED BY</label>
                <input
                  className="form-input"
                  placeholder="Shift Supervisor name..."
                  value={newPermit.issuedBy}
                  onChange={e => setNewPermit(p => ({ ...p, issuedBy: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">WORK DESCRIPTION</label>
                <textarea
                  className="form-textarea"
                  placeholder="Describe the work to be performed..."
                  rows={3}
                  value={newPermit.description}
                  onChange={e => setNewPermit(p => ({ ...p, description: e.target.value }))}
                />
              </div>
              <button
                className="submit-btn"
                onClick={issuePermit}
                disabled={submitting || !newPermit.zone || !newPermit.issuedBy || !newPermit.description}
              >
                {submitting ? '[ ] Issuing...' : '+ ISSUE PERMIT'}
              </button>
              <div className="ptw-note">
                Permits are auto-cross-checked against live sensor data. Hot Work + elevated gas readings will trigger an immediate conflict alert.
              </div>
            </div>
          </div>
        ) : (
          /* ✅ Operator ko locked state dikhta hai */
          <div className="issue-permit-panel">
            <div className="panel-header">
              <span className="panel-title">ISSUE NEW PERMIT</span>
            </div>
            <div style={{
              padding: '48px 24px',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.2)',
              fontFamily: 'monospace',
            }}>
              <div style={{ fontSize: 32, marginBottom: 16, opacity: 0.4 }}>🔒</div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>Admin access required</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.12)', lineHeight: 1.6 }}>
                Contact your shift supervisor<br />to issue or close permits
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shift Roster Tab ─────────────────────────────────────────────────────────
// Assigns supervisors to zones for a time window. CRITICAL alerts email whoever
// is on-duty for that zone directly, in addition to admins (see server-side
// getOnDutyUsers). Closes the gap the project overview calls out: "the system
// knows exactly who is on shift and can alert them directly."

function ShiftsTab({ liveState, userRole }) {
  const isAdmin = ['admin', 'super_admin'].includes(userRole);
  const [shifts, setShifts] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ zone: '', userId: '', startTime: '', endTime: '' });
  const [submitting, setSubmitting] = useState(false);
  const [ending, setEnding] = useState(null);

  const allZones = liveState.map(z => z.zone);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/shifts`, { headers: authHeaders() }).then(r => r.json()).then(setShifts);
    if (isAdmin) fetch(`${BACKEND_URL}/api/users`, { headers: authHeaders() }).then(r => r.json()).then(setUsers);
    socket.on('shiftsUpdate', setShifts);
    return () => socket.off('shiftsUpdate');
  }, [isAdmin]);

  const assignShift = async () => {
    if (!form.zone || !form.userId || !form.startTime || !form.endTime) return;
    setSubmitting(true);
    await fetch(`${BACKEND_URL}/api/shifts`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({
        ...form,
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
      }),
    });
    setForm({ zone: '', userId: '', startTime: '', endTime: '' });
    setSubmitting(false);
  };

  const endShift = async (id) => {
    setEnding(id);
    await fetch(`${BACKEND_URL}/api/shifts/${id}/end`, { method: 'PATCH', headers: authHeaders() });
    setEnding(null);
  };

  const now = Date.now();
  const onDuty = shifts.filter(s => s.active && new Date(s.startTime) <= now && new Date(s.endTime) >= now);
  const upcoming = shifts.filter(s => s.active && new Date(s.startTime) > now);
  const past = shifts.filter(s => !s.active || new Date(s.endTime) < now);

  const ShiftCard = ({ s, tag, tagColor }) => (
    <div key={s._id} className="permit-card">
      <div className="permit-card-header">
        <span className="permit-type-tag" style={{ background: tagColor }}>{tag}</span>
        <span className="permit-id-tag">{s.userName}</span>
      </div>
      <div className="permit-zone-row"><span className="perm-zone-dot" />{s.zone}</div>
      <div className="permit-desc-text">{s.userEmail}</div>
      <div className="permit-meta">
        {new Date(s.startTime).toLocaleString('en-IN')} → {new Date(s.endTime).toLocaleString('en-IN')} · assigned by {s.assignedBy}
      </div>
      {isAdmin && tag === 'ON DUTY' && (
        <button className="close-permit-btn" onClick={() => endShift(s._id)} disabled={ending === s._id}>
          {ending === s._id ? 'Ending...' : '[x] End Shift Early'}
        </button>
      )}
    </div>
  );

  return (
    <div className="permits-tab">
      <div className="permits-layout">
        <div className="permits-list-panel">
          <div className="panel-header">
            <span className="panel-title">ON DUTY NOW</span>
            <span className="panel-count">{onDuty.length}</span>
          </div>
          {onDuty.length === 0
            ? <div className="permits-empty">No one currently rostered — critical alerts will only reach admins</div>
            : onDuty.map(s => <ShiftCard key={s._id} s={s} tag="ON DUTY" tagColor="#006644" />)}

          {upcoming.length > 0 && (
            <>
              <div className="panel-header" style={{ marginTop: 20 }}>
                <span className="panel-title">UPCOMING</span>
                <span className="panel-count">{upcoming.length}</span>
              </div>
              {upcoming.map(s => <ShiftCard key={s._id} s={s} tag="UPCOMING" tagColor="#4285F4" />)}
            </>
          )}

          {past.length > 0 && (
            <>
              <div className="panel-header" style={{ marginTop: 20 }}>
                <span className="panel-title" style={{ opacity: 0.5 }}>PAST</span>
                <span className="panel-count" style={{ opacity: 0.5 }}>{past.length}</span>
              </div>
              {past.slice(0, 10).map(s => (
                <div key={s._id} className="permit-card permit-closed">
                  <div className="permit-card-header">
                    <span className="permit-id-tag" style={{ opacity: 0.5 }}>{s.userName}</span>
                    <span className="closed-tag">{s.active ? 'ENDED' : 'CLOSED EARLY'}</span>
                  </div>
                  <div className="permit-desc-text" style={{ opacity: 0.5 }}>{s.zone} — {new Date(s.startTime).toLocaleDateString('en-IN')}</div>
                </div>
              ))}
            </>
          )}
        </div>

        {isAdmin ? (
          <div className="issue-permit-panel">
            <div className="panel-header"><span className="panel-title">ASSIGN SHIFT</span></div>
            <div className="issue-form">
              <div className="form-group">
                <label className="form-label">ZONE</label>
                <select className="form-select" value={form.zone} onChange={e => setForm(f => ({ ...f, zone: e.target.value }))}>
                  <option value="">-- select zone --</option>
                  {allZones.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">SUPERVISOR</label>
                <select className="form-select" value={form.userId} onChange={e => setForm(f => ({ ...f, userId: e.target.value }))}>
                  <option value="">-- select user --</option>
                  {users.map(u => <option key={u._id} value={u._id}>{u.name} ({u.email})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">START</label>
                <input type="datetime-local" className="form-input" value={form.startTime}
                  onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">END</label>
                <input type="datetime-local" className="form-input" value={form.endTime}
                  onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
              </div>
              <button className="submit-btn" onClick={assignShift}
                disabled={submitting || !form.zone || !form.userId || !form.startTime || !form.endTime}>
                {submitting ? '[ ] Assigning...' : '+ ASSIGN SHIFT'}
              </button>
              <div className="ptw-note">
                Whoever is on-duty for a zone gets emailed directly the moment a CRITICAL mismatch fires there, in addition to admins.
              </div>
            </div>
          </div>
        ) : (
          <div className="issue-permit-panel">
            <div className="panel-header"><span className="panel-title">ASSIGN SHIFT</span></div>
            <div style={{ padding: '48px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>
              <div style={{ fontSize: 32, marginBottom: 16, opacity: 0.4 }}>🔒</div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>Admin access required</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Team Tab (visible to all roles — strict org isolation via /api/team) ──────
// Members can only ever see teammates in their own organization; the backend
// scopes every query to req.user.companyId, so there is no cross-org leakage.

function TeamTab({ userRole, currentUserEmail }) {
  const isAdmin = ['admin', 'super_admin'].includes(userRole);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', role: 'operator' });
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState('');
  const [removing, setRemoving] = useState(null);

  const loadTeam = () => {
    fetch(`${BACKEND_URL}/api/team`, { headers: authHeaders() })
      .then(r => r.json()).then(d => { setTeam(Array.isArray(d) ? d : []); setLoading(false); });
  };

  useEffect(() => { loadTeam(); }, []);

  const addMember = async () => {
    if (!form.name || !form.email) return;
    setSubmitting(true); setFormMsg('');
    const res = await fetch(`${BACKEND_URL}/api/team/members`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setFormMsg(data.message || 'Failed to add member'); }
    else { setFormMsg(`Invite sent to ${data.email} — credentials emailed.`); setForm({ name: '', email: '', role: 'operator' }); loadTeam(); }
    setSubmitting(false);
  };

  const removeMember = async (id) => {
    setRemoving(id);
    await fetch(`${BACKEND_URL}/api/team/members/${id}/remove`, { method: 'PATCH', headers: authHeaders() });
    setRemoving(null);
    loadTeam();
  };

  return (
    <div className="permits-tab">
      <div className="permits-layout">
        <div className="permits-list-panel">
          <div className="panel-header">
            <span className="panel-title">MY ORGANIZATION'S TEAM</span>
            <span className="panel-count">{team.length}</span>
          </div>
          {loading ? (
            <div className="permits-empty">Loading...</div>
          ) : team.length === 0 ? (
            <div className="permits-empty">No teammates yet</div>
          ) : team.map(m => (
            <div key={m._id} className="permit-card">
              <div className="permit-card-header">
                <span className="permit-type-tag" style={{ background: m.status === 'pending' ? '#886600' : '#006644' }}>
                  {m.status === 'pending' ? 'INVITE PENDING' : m.role.replace('_', ' ').toUpperCase()}
                </span>
                <span className="permit-id-tag">{m.name}{m.email === currentUserEmail ? ' (you)' : ''}</span>
              </div>
              <div className="permit-desc-text">{m.email}</div>
              <div className="permit-meta">Joined {new Date(m.createdAt).toLocaleDateString('en-IN')}</div>
              {isAdmin && m.email !== currentUserEmail && (
                <button className="close-permit-btn" onClick={() => removeMember(m._id)} disabled={removing === m._id}>
                  {removing === m._id ? 'Removing...' : '[x] Remove from org'}
                </button>
              )}
            </div>
          ))}
        </div>

        {isAdmin ? (
          <div className="issue-permit-panel">
            <div className="panel-header"><span className="panel-title">ADD TEAM MEMBER</span></div>
            <div className="issue-form">
              <div className="form-group">
                <label className="form-label">NAME</label>
                <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">EMAIL</label>
                <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">ROLE</label>
                <select className="form-select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="operator">Operator</option>
                  <option value="safety_officer">Safety Officer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button className="submit-btn" onClick={addMember} disabled={submitting || !form.name || !form.email}>
                {submitting ? '[ ] Sending invite...' : '+ ADD & EMAIL CREDENTIALS'}
              </button>
              <div className="ptw-note">
                A temporary password is emailed to them. The moment they log in with it, they join your
                organization and you'll get a confirmation email.
              </div>
              {formMsg && <div className="ptw-note" style={{ color: '#00ffb4' }}>{formMsg}</div>}
            </div>
          </div>
        ) : (
          <div className="issue-permit-panel">
            <div className="panel-header"><span className="panel-title">ADD TEAM MEMBER</span></div>
            <div style={{ padding: '48px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>
              <div style={{ fontSize: 32, marginBottom: 16, opacity: 0.4 }}>🔒</div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>Admin access required</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Zones Tab (Admin only) ───────────────────────────────────────────────────
// Admins define zones for their org's industry — any name, any set of
// tracked metrics (or none — status-label-only), and simulated vs manual
// mode. Backend: routes/zoneRoutes.js, scoped to req.user.companyId.

function emptyZoneForm() {
  return { name: '', mode: 'manual', metricConfig: [] };
}

function ZonesTab({ userRole }) {
  const isAdmin = ['admin', 'super_admin'].includes(userRole);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // zone._id, 'new', or null
  const [form, setForm] = useState(emptyZoneForm());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [deleting, setDeleting] = useState(null);

  const load = () => {
    setLoading(true);
    fetch(`${BACKEND_URL}/api/zones`, { headers: authHeaders() })
      .then(r => r.json()).then(d => { setZones(Array.isArray(d) ? d : []); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const startNew = () => { setForm(emptyZoneForm()); setEditing('new'); setErr(''); };
  const startEdit = (z) => {
    setForm({ name: z.name, mode: z.mode, metricConfig: (z.metricConfig || []).map(m => ({ ...m })) });
    setEditing(z._id); setErr('');
  };
  const cancelEdit = () => { setEditing(null); setErr(''); };

  const addMetricRow = () => setForm(f => ({
    ...f, metricConfig: [...f.metricConfig, { key: '', label: '', unit: '', warningThreshold: '', criticalThreshold: '' }],
  }));
  const updateMetricRow = (i, field, value) => setForm(f => ({
    ...f, metricConfig: f.metricConfig.map((m, idx) => idx === i ? { ...m, [field]: value } : m),
  }));
  const removeMetricRow = (i) => setForm(f => ({ ...f, metricConfig: f.metricConfig.filter((_, idx) => idx !== i) }));

  const save = async () => {
    if (!form.name.trim()) { setErr('Zone name is required'); return; }
    const cleanMetrics = form.metricConfig.map(m => ({
      key: (m.key || '').trim(), label: (m.label || '').trim(), unit: m.unit || '',
      warningThreshold: m.warningThreshold === '' || m.warningThreshold == null ? null : Number(m.warningThreshold),
      criticalThreshold: m.criticalThreshold === '' || m.criticalThreshold == null ? null : Number(m.criticalThreshold),
    }));
    if (cleanMetrics.some(m => !m.key || !m.label)) { setErr('Each metric needs a key and a label'); return; }

    setSaving(true); setErr('');
    const url = editing === 'new' ? `${BACKEND_URL}/api/zones` : `${BACKEND_URL}/api/zones/${editing}`;
    const method = editing === 'new' ? 'POST' : 'PATCH';
    const res = await fetch(url, {
      method, headers: authHeaders(),
      body: JSON.stringify({ name: form.name, mode: form.mode, metricConfig: cleanMetrics }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setErr(data.message || 'Failed to save zone'); return; }
    setEditing(null); load();
  };

  const removeZone = async (id) => {
    setDeleting(id);
    await fetch(`${BACKEND_URL}/api/zones/${id}`, { method: 'DELETE', headers: authHeaders() });
    setDeleting(null); load();
  };

  if (!isAdmin) return (
    <div className="issue-permit-panel">
      <div style={{ padding: '48px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>
        <div style={{ fontSize: 32, marginBottom: 16, opacity: 0.4 }}>🔒</div>
        <div style={{ fontSize: 13 }}>Admin access required</div>
      </div>
    </div>
  );

  return (
    <div className="permits-tab">
      <div className="permits-layout">
        <div className="permits-list-panel">
          <div className="panel-header">
            <span className="panel-title">ZONES</span>
            <span className="panel-count">{zones.length}</span>
          </div>
          {loading ? (
            <div className="permits-empty">Loading...</div>
          ) : zones.length === 0 ? (
            <div className="permits-empty">No zones yet — create one to get started</div>
          ) : zones.map(z => (
            <div key={z._id} className="permit-card">
              <div className="permit-card-header">
                <span className="permit-type-tag" style={{ background: z.mode === 'simulated' ? '#4285F4' : '#886600' }}>
                  {z.mode === 'simulated' ? 'SIMULATED' : 'MANUAL'}
                </span>
                <span className="permit-id-tag">{z.name}</span>
              </div>
              <div className="permit-desc-text">
                {z.metricConfig?.length > 0
                  ? z.metricConfig.map(m => `${m.label}${m.unit ? ` (${m.unit})` : ''}`).join(', ')
                  : 'No metrics configured — status label only'}
              </div>
              <div className="permit-meta">Created by {z.createdBy}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="close-permit-btn" onClick={() => startEdit(z)}>[edit]</button>
                <button className="close-permit-btn" onClick={() => removeZone(z._id)} disabled={deleting === z._id}>
                  {deleting === z._id ? 'Removing...' : '[x] Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="issue-permit-panel">
          <div className="panel-header">
            <span className="panel-title">{editing ? (editing === 'new' ? 'NEW ZONE' : 'EDIT ZONE') : 'ZONE SETUP'}</span>
          </div>
          {!editing ? (
            <div style={{ padding: '20px 4px' }}>
              <button className="submit-btn" onClick={startNew}>+ CREATE ZONE</button>
              <div className="ptw-note">
                Create a zone for any area, process, or unit — a warehouse floor, a hospital ward, a construction site,
                anything your industry needs. Pick "simulated" to auto-generate demo readings, or "manual" so only
                your team's shift updates drive its status.
              </div>
            </div>
          ) : (
            <div className="issue-form">
              <div className="form-group">
                <label className="form-label">ZONE NAME</label>
                <input className="form-input" value={form.name} placeholder="e.g. Warehouse Floor 2"
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">MODE</label>
                <select className="form-select" value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}>
                  <option value="manual">Manual — team submits status</option>
                  <option value="simulated">Simulated — auto-generate demo data</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">TRACKED METRICS (optional)</label>
                {form.metricConfig.map((m, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input className="form-input" style={{ flex: '1 1 90px' }} placeholder="key (e.g. tempC)"
                      value={m.key} onChange={e => updateMetricRow(i, 'key', e.target.value)} />
                    <input className="form-input" style={{ flex: '1 1 120px' }} placeholder="label (e.g. Temperature)"
                      value={m.label} onChange={e => updateMetricRow(i, 'label', e.target.value)} />
                    <input className="form-input" style={{ flex: '0 1 55px' }} placeholder="unit"
                      value={m.unit} onChange={e => updateMetricRow(i, 'unit', e.target.value)} />
                    <input className="form-input" style={{ flex: '0 1 60px' }} type="number" placeholder="warn"
                      value={m.warningThreshold} onChange={e => updateMetricRow(i, 'warningThreshold', e.target.value)} />
                    <input className="form-input" style={{ flex: '0 1 60px' }} type="number" placeholder="crit"
                      value={m.criticalThreshold} onChange={e => updateMetricRow(i, 'criticalThreshold', e.target.value)} />
                    <button className="close-permit-btn" onClick={() => removeMetricRow(i)}>[x]</button>
                  </div>
                ))}
                <button className="close-permit-btn" onClick={addMetricRow}>[+] Add metric</button>
              </div>
              {err && <div className="ptw-note" style={{ color: '#ff3a3a' }}>{err}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="submit-btn" onClick={save} disabled={saving}>
                  {saving ? 'Saving...' : (editing === 'new' ? '+ CREATE ZONE' : 'SAVE CHANGES')}
                </button>
                <button className="close-permit-btn" onClick={cancelEdit}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Zone Status Tab ───────────────────────────────────────────────────────────
// Any team member who is currently on-shift for a zone can update its status
// here (status label + optional numeric readings for whatever metrics that
// zone tracks) — this feeds the same risk/alert engine as simulated sensor
// data. Admins can update any zone at any time (e.g. to correct/override).
// Backend: POST /api/zones/:id/status (routes/zoneRoutes.js).

function ZoneStatusTab({ liveState, userRole, currentUserEmail, onSubmitted }) {
  const isAdmin = ['admin', 'super_admin'].includes(userRole);
  const myZones = isAdmin
    ? liveState
    : liveState.filter(z => (z.onDuty || []).some(s => s.userEmail === currentUserEmail));

  const [zoneId, setZoneId] = useState('');
  const [statusLabel, setStatusLabel] = useState('NORMAL');
  const [metrics, setMetrics] = useState({});
  const [note, setNote] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (myZones.length && !myZones.some(z => String(z.zoneId) === zoneId)) {
      setZoneId(String(myZones[0].zoneId));
    }
  }, [myZones.map(z => z.zoneId).join(',')]);

  const activeZone = myZones.find(z => String(z.zoneId) === zoneId);
  const metricConfig = activeZone?.metricConfig || [];

  const submit = async () => {
    if (!zoneId) return;
    setSubmitting(true); setMsg('');
    const cleanMetrics = {};
    metricConfig.forEach(m => {
      if (metrics[m.key] !== undefined && metrics[m.key] !== '') cleanMetrics[m.key] = Number(metrics[m.key]);
    });
    const res = await fetch(`${BACKEND_URL}/api/zones/${zoneId}/status`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ statusLabel, metrics: cleanMetrics, note: note || undefined, attachments }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) { setMsg(data.message || 'Failed to submit status'); return; }
    setMsg('Status updated ✓'); setNote(''); setMetrics({}); setAttachments([]);
    onSubmitted && onSubmitted();
  };

  if (myZones.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">[i]</div>
        <div>You're not currently on shift for any zone</div>
        <div className="empty-sub">Ask your admin to roster you on a shift, then come back here to update its status.</div>
      </div>
    );
  }

  return (
    <div className="handover-panel">
      <div className="handover-info">
        <div className="info-icon">[i]</div>
        <div>
          <strong>How it works:</strong> Set the current status of a zone you're on shift for. If the zone tracks
          numeric metrics, you can optionally add live readings too — both feed the same risk/alert engine as
          automated sensor data.
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">ZONE</label>
        <select className="form-select" value={zoneId} onChange={e => { setZoneId(e.target.value); setMetrics({}); }}>
          {myZones.map(z => <option key={z.zoneId} value={z.zoneId}>{z.zone}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">STATUS</label>
        <select className="form-select" value={statusLabel} onChange={e => setStatusLabel(e.target.value)}>
          <option value="NORMAL">Normal</option>
          <option value="WARNING">Warning</option>
          <option value="CRITICAL">Critical</option>
        </select>
      </div>

      {metricConfig.length > 0 && (
        <div className="form-group">
          <label className="form-label">READINGS (optional)</label>
          {metricConfig.map(m => (
            <div key={m.key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ width: 150, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: 12 }}>
                {m.label}{m.unit ? ` (${m.unit})` : ''}
              </span>
              <input className="form-input" type="number" value={metrics[m.key] ?? ''}
                onChange={e => setMetrics(prev => ({ ...prev, [m.key]: e.target.value }))} />
            </div>
          ))}
        </div>
      )}

      <div className="form-group">
        <label className="form-label">NOTE (optional)</label>
        <textarea className="form-textarea" rows={3} value={note} onChange={e => setNote(e.target.value)}
          placeholder="Anything worth flagging..." />
        <div className="voice-attach-row">
          <VoiceNoteButton onTranscript={t => setNote(prev => (prev ? `${prev} ${t}` : t))} />
          <AttachmentPicker files={attachments} setFiles={setAttachments} />
        </div>
      </div>

      <button className={`submit-btn ${submitting ? 'submitting' : ''}`} onClick={submit} disabled={submitting || !zoneId}>
        {submitting ? '[ ] Updating...' : '[>] UPDATE ZONE STATUS'}
      </button>
      {msg && <div className="ptw-note" style={{ color: msg.includes('✓') ? '#00ffb4' : '#ff3a3a' }}>{msg}</div>}
    </div>
  );
}

// ── Alert Card ────────────────────────────────────────────────────────────────

function AlertCard({ a }) {
  return (
    <div className="alert-card-full">
      <div className="alert-header">
        <div className="alert-zone-tag">
          <span className="alert-dot" />
          {a.zone}
        </div>
        <div className="alert-time">{a.alert?.timestamp ? new Date(a.alert.timestamp).toLocaleTimeString('en-IN') : 'just now'}</div>
      </div>
      <div className="alert-message">{a.alert?.message}</div>
      {a.alert?.recommendation && (
        <div className="alert-rec">
          <div className="rec-label">AI RECOMMENDATION</div>
          <div className="rec-text">{a.alert.recommendation}</div>
        </div>
      )}
      {a.alert?.permitConflicts?.length > 0 && (
        <div className="alert-permits-section">
          <div className="rec-label">[P] PERMIT CONFLICTS IN THIS ALERT</div>
          {a.alert.permitConflicts.map(c => (
            <div key={c.permitId} className={`conflict-card conf-inline ${c.severity === 'CRITICAL' ? 'conf-critical' : 'conf-high'}`}>
              <span className="conf-permit">{c.permitId} · {c.permitType}</span>
              <span className={`conf-sev sev-${c.severity}`}>{c.severity}</span>
              <div className="conflict-reason">{c.reason}</div>
            </div>
          ))}
        </div>
      )}
      {a.alert?.matchedIncidents?.length > 0 && (
        <div className="matched-row">
          {a.alert.matchedIncidents.map(m => (
            <span key={m.id} className="inc-tag">{m.id} · {m.title}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Voice-to-text (Web Speech API) + photo/document attachments ────────────────
// Shared by the Handover tab and the Update Status tab so both can capture a
// spoken note and attach evidence for whoever picks up the next shift.

function useSpeechToText(appendTranscript) {
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);
  const supported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const start = () => {
    if (!supported || listening) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'en-IN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join(' ').trim();
      if (transcript) appendTranscript(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };
  const stop = () => { recRef.current?.stop(); setListening(false); };
  const toggle = () => (listening ? stop() : start());

  useEffect(() => () => { recRef.current?.stop(); }, []);

  return { listening, toggle, supported };
}

function VoiceNoteButton({ onTranscript }) {
  const { listening, toggle, supported } = useSpeechToText(onTranscript);
  if (!supported) return null;
  return (
    <button type="button" className={`mic-btn ${listening ? 'mic-listening' : ''}`} onClick={toggle}>
      <span className="mic-dot" /> {listening ? '[■] Stop recording' : '[●] Record voice note'}
    </button>
  );
}

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024; // 4MB per file — plenty for a phone photo/PDF

function AttachmentPicker({ files, setFiles }) {
  const inputRef = useRef(null);
  const [err, setErr] = useState('');

  const handlePick = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    setErr('');
    if (files.length + picked.length > MAX_ATTACHMENTS) {
      setErr(`You can attach up to ${MAX_ATTACHMENTS} files`);
      return;
    }
    picked.forEach(file => {
      if (file.size > MAX_ATTACHMENT_BYTES) { setErr(`${file.name} is over 4MB — skipped`); return; }
      const reader = new FileReader();
      reader.onload = () => {
        setFiles(prev => [...prev, { name: file.name, type: file.type, size: file.size, dataUrl: reader.result }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

  return (
    <div className="attach-picker">
      <input ref={inputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt"
        style={{ display: 'none' }} onChange={handlePick} />
      <button type="button" className="attach-btn" onClick={() => inputRef.current?.click()}>
        [+] Attach photo / document
      </button>
      {err && <span className="attach-err">{err}</span>}
      {files.length > 0 && (
        <div className="attach-list">
          {files.map((f, i) => (
            <div className="attach-chip" key={`${f.name}-${i}`}>
              {f.type?.startsWith('image/')
                ? <img src={f.dataUrl} alt={f.name} />
                : <span className="attach-file-icon">[doc]</span>}
              <span className="attach-name" title={f.name}>{f.name}</span>
              <button type="button" className="attach-remove" onClick={() => removeFile(i)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Read-only gallery for attachments already saved on a handover / status entry.
function AttachmentGallery({ attachments }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="attach-list attach-list-readonly">
      {attachments.map((f, i) => (
        <a key={`${f.name}-${i}`} className="attach-chip" href={f.dataUrl} download={f.name} title={`Download ${f.name}`}>
          {f.type?.startsWith('image/')
            ? <img src={f.dataUrl} alt={f.name} />
            : <span className="attach-file-icon">[doc]</span>}
          <span className="attach-name">{f.name}</span>
        </a>
      ))}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState(null);
  const [state, setState] = useState([]);
  const [zone, setZone] = useState('');
  const [note, setNote] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [time, setTime] = useState(new Date());
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedZone, setSelectedZone] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/state`, { headers: authHeaders() }).then(r => r.json()).then(setState);
    socket.on('stateUpdate', setState);
    socket.on('alert', (a) => setAlerts(prev => [a, ...prev].slice(0, 20)));
    return () => { socket.off('stateUpdate'); socket.off('alert'); };
  }, []);

  // Default the handover zone selector to the first real zone once loaded
  // (there's no more hardcoded "CokeOvenBattery-3" to fall back on).
  useEffect(() => {
    if (!zone && state.length > 0) setZone(state[0].zone);
  }, [state]);

  useEffect(() => {
    if (selectedZone) {
      const updated = state.find(z => z.zone === selectedZone.zone);
      if (updated) setSelectedZone(updated);
    }
  }, [state]);

  const submitHandover = async () => {
    if (!note.trim()) return;
    setSubmitting(true);
    await fetch(`${BACKEND_URL}/api/handover`, {
      method: 'POST',
      headers: authHeaders(),   // ✅ token bheja ja raha hai
      body: JSON.stringify({ zone, text: note, attachments })
    });
    setNote('');
    setAttachments([]);
    setSubmitting(false);
  };

  // ✅ Logout — token bhi clear karo
  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setUser(null);
  };

  if (!user) return <LandingPage onLogin={(u) => { reconnectSocketWithAuth(); setUser(u); }} />;

  const isAdmin = ['admin', 'super_admin'].includes(user?.role);
  const criticalCount = state.filter(z => z.mismatchScore >= 60).length;
  const avgRisk = state.length ? (state.reduce((a, z) => a + z.sensor.riskLevel, 0) / state.length * 100).toFixed(0) : 0;
  const totalPermitConflicts = state.reduce((a, z) => a + (z.permitConflicts?.length || 0), 0);

  const tabs = [
    { id: 'dashboard', icon: <IconDashboard />, label: 'Dashboard' },
    { id: 'handover',  icon: <IconHandover />,  label: 'Handover' },
    { id: 'status',    icon: <IconStatus />,    label: 'Update Status' },
    { id: 'alerts',    icon: <IconAlerts />,    label: `Alerts${alerts.length > 0 ? ` (${alerts.length})` : ''}` },
    { id: 'permits',   icon: <IconPermits />,   label: `Permits${totalPermitConflicts > 0 ? ` ⚠ ${totalPermitConflicts}` : ''}` },
    { id: 'shifts',    icon: <IconShifts />,    label: 'Shift Roster' },
    { id: 'team',      icon: <IconTeam />,      label: 'Team' },
    { id: 'map',       icon: <IconMap />,       label: 'Zone Map' },
  ];

  // ✅ Admin-only tabs — Zones (create/configure) + User Management
  const allTabs = isAdmin
    ? [...tabs,
        { id: 'zones', icon: <IconZones />, label: 'Zones' },
        { id: 'users', icon: <IconUsers />, label: user?.role === 'super_admin' ? 'Admin Panel' : 'Users' },
      ]
    : tabs;

  return (
    <div className="app-shell">
      <ZoneModal z={selectedZone} onClose={() => setSelectedZone(null)} />

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-dot-lg" />
          <div>
            <div className="logo-text">SHIFT ZERO</div>
            <div className="logo-sub">SAFETY INTEL</div>
          </div>
        </div>
        {user?.isDemo && (
          <div style={{
            margin: '0 16px 12px', padding: '4px 10px', borderRadius: 20,
            background: 'rgba(0,255,180,0.1)', border: '1px solid rgba(0,255,180,0.35)',
            color: '#00ffb4', fontSize: 9, fontFamily: 'monospace', letterSpacing: 1,
            textAlign: 'center',
          }}>
            ⚡ SANDBOX DEMO MODE
          </div>
        )}
        <nav className="sidebar-nav">
          {allTabs.map(item => (
            <button
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'nav-active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="user-avatar">
              <img
                src={user.avatar}
                alt={user.name}
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                onError={e => { e.target.style.display = 'none'; }}
              />
            </div>
            <div>
              <div className="user-name">{user.name}</div>
              {/* ✅ Dynamic role badge */}
              <div className="user-role" style={{
                color: isAdmin ? '#00ffb4' : 'var(--blue)',
              }}>
                {isAdmin ? '⬡ ADMIN'
                  : user?.role === 'safety_officer' ? 'SAFETY OFFICER'
                  : 'OPERATOR'}
              </div>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>[out]</button>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        <div className="topbar">
          <div className="topbar-left">
            <div className="page-title-row">
              <div className="page-title">
                {activeTab === 'dashboard' && 'Live Operations'}
                {activeTab === 'handover'  && 'Shift Handover'}
                {activeTab === 'status'    && 'Update Zone Status'}
                {activeTab === 'alerts'    && 'Alert Feed'}
                {activeTab === 'permits'   && 'Permit to Work'}
                {activeTab === 'shifts'    && 'Shift Roster'}
                {activeTab === 'team'      && 'Team'}
                {activeTab === 'map'       && 'Zone Map'}
                {activeTab === 'zones'     && 'Zone Configuration'}
                {activeTab === 'users'     && 'User Management'}
              </div>
              <span className="topbar-role-badge" style={{ color: isAdmin ? '#00ffb4' : 'var(--blue)' }}>
                {isAdmin ? 'ADMIN'
                  : user?.role === 'safety_officer' ? 'SAFETY OFFICER'
                  : 'OPERATOR'}
              </span>
            </div>
            <div className="breadcrumb">{user?.companyName || 'Your Organization'}</div>
          </div>
          <div className="topbar-right">
            {totalPermitConflicts > 0 && (
              <div className="permit-conflict-chip" onClick={() => setActiveTab('permits')}>
                [P] {totalPermitConflicts} PTW CONFLICT{totalPermitConflicts > 1 ? 'S' : ''}
              </div>
            )}
            {criticalCount > 0 && (
              <div className="critical-badge">
                <span className="crit-dot" />
                {criticalCount} CRITICAL ZONE{criticalCount > 1 ? 'S' : ''}
              </div>
            )}
            <div className="clock">{time.toLocaleTimeString('en-IN', { hour12: false })}</div>
            <div className="live-chip">* LIVE</div>
          </div>
        </div>

        <div className="content-body">

          {/* DASHBOARD TAB */}
          {activeTab === 'dashboard' && (
            <>
            {/* PDF Download */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
              <a
                href={`${BACKEND_URL}/api/report/pdf?token=${localStorage.getItem('authToken')}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  background: 'rgba(0,255,180,0.08)',
                  border: '1px solid rgba(0,255,180,0.25)',
                  color: '#00ffb4',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  letterSpacing: 1,
                  textDecoration: 'none',
                }}
              >
                [↓] DOWNLOAD SHIFT REPORT PDF
              </a>
              {isAdmin && (
                <a
                  href={`${BACKEND_URL}/api/report/csv?token=${localStorage.getItem('authToken')}&days=7`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: '8px 18px', borderRadius: 8,
                    background: 'rgba(77,216,192,0.1)', border: '1px solid rgba(77,216,192,0.3)',
                    color: '#4dd8c0', fontFamily: 'monospace', fontSize: 12, letterSpacing: 1,
                    textDecoration: 'none', marginLeft: 10,
                  }}
                >
                  [↓] DGFASLI AUDIT CSV
                </a>
              )}
            </div>
              <div className="kpi-row">
                {[
                  { label: 'Critical Zones',  value: criticalCount,        color: criticalCount > 0        ? '#ff3a3a' : '#00ffb4', sub: 'mismatch score >= 60' },
                  { label: 'Avg Sensor Risk', value: `${avgRisk}%`,        color: avgRisk > 50             ? '#ffaa00' : '#00ffb4', sub: 'across all zones' },
                  { label: 'Active Alerts',   value: alerts.length,        color: alerts.length > 0        ? '#ff3a3a' : '#00ffb4', sub: 'last 20 events' },
                  { label: 'PTW Conflicts',   value: totalPermitConflicts, color: totalPermitConflicts > 0 ? '#ffaa00' : '#00ffb4', sub: 'live permit clashes' },
                ].map(k => (
                  <div key={k.label} className="kpi-card">
                    <div className="kpi-label">{k.label}</div>
                    <div className="kpi-value" style={{ color: k.color, textShadow: `0 0 20px ${k.color}40` }}>{k.value}</div>
                    <div className="kpi-sub">{k.sub}</div>
                  </div>
                ))}
              </div>

              <div className="section-title">
                Zone Status <span className="section-badge">LIVE</span>
                <span className="section-hint">Click any zone for details</span>
              </div>
              <div className="zones-grid">
                {state.map(z => <ZoneCard key={z.zone} z={z} onClick={setSelectedZone} />)}
              </div>

              {alerts.length > 0 && (
                <>
                  <div className="section-title">Latest Alert</div>
                  <AlertCard a={alerts[0]} />
                </>
              )}
            </>
          )}

          {/* HANDOVER TAB */}
          {activeTab === 'handover' && (
            <div className="handover-panel">
              <div className="handover-info">
                <div className="info-icon">[i]</div>
                <div>
                  <strong>How it works:</strong> Submit a shift-handover note for any zone. The AI compares the risk language in your note against live sensor trends. If sensors show escalation but your note sounds calm, a Verbal-Sensor Mismatch is flagged.
                </div>
              </div>
              {zone && state.find(z => z.zone === zone) && (() => {
                const z = state.find(s => s.zone === zone);
                const color = riskColor(z.mismatchScore);
                return (
                  <div className="handover-zone-preview" style={{ borderColor: color + '40' }}>
                    <div className="hzp-label">CURRENT ZONE STATE</div>
                    <div className="hzp-row">
                      <span style={{ color }}>* {riskLabel(z.mismatchScore)}</span>
                      {zoneMetricEntries(z).slice(0, 2).map(m => (
                        <span key={m.key}>{m.label}: {m.value}{m.unit ? ` ${m.unit}` : ''}</span>
                      ))}
                      <span>Risk: {(z.sensor.riskLevel * 100).toFixed(0)}%</span>
                      {z.prediction?.confident && z.prediction.minutesToCritical !== null && (
                        <TimeToCritical prediction={z.prediction} />
                      )}
                    </div>
                    {z.activePermits?.length > 0 && (
                      <div className="hzp-permits">
                        [P] Active permits: {z.activePermits.map(p => `${p.id} (${p.type})`).join(', ')}
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="form-group">
                <label className="form-label">SELECT ZONE</label>
                <select className="form-select" value={zone} onChange={e => setZone(e.target.value)}>
                  {state.map(z => <option key={z.zone} value={z.zone}>{z.zone}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">HANDOVER NOTE</label>
                <textarea
                  className="form-textarea"
                  placeholder='e.g. "Gas level thoda high tha but sab normal hai, routine hai, will check later..."'
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={5}
                />
                <div className="char-count">{note.length} chars</div>
                <div className="voice-attach-row">
                  <VoiceNoteButton onTranscript={t => setNote(prev => (prev ? `${prev} ${t}` : t))} />
                  <AttachmentPicker files={attachments} setFiles={setAttachments} />
                </div>
              </div>
              <button
                className={`submit-btn ${submitting ? 'submitting' : ''}`}
                onClick={submitHandover}
                disabled={submitting || !note.trim()}
              >
                {submitting ? '[ ] AI ANALYZING...' : '[>] SUBMIT & ANALYZE'}
              </button>
              <div className="sample-notes">
                <div className="sample-label">TRY A SAMPLE NOTE:</div>
                {[
                  'Gas level thoda high tha but sab normal hai, routine hai, will check later',
                  'Minor pressure fluctuation observed, manageable, as usual nothing major',
                ].map(s => (
                  <button key={s} className="sample-btn" onClick={() => setNote(s)}>"{s}"</button>
                ))}
              </div>
            </div>
          )}

          {/* ALERTS TAB */}
          {activeTab === 'alerts' && (
            <div>
              {alerts.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">[ok]</div>
                  <div>No active mismatches detected</div>
                  <div className="empty-sub">All zones within normal parameters</div>
                </div>
              ) : (
                alerts.map((a, i) => <AlertCard key={i} a={a} />)
              )}
            </div>
          )}

          {/* PERMITS TAB */}
          {activeTab === 'permits' && (
            <PermitsTab liveState={state} userRole={user?.role} />
          )}

          {activeTab === 'shifts' && (
            <ShiftsTab liveState={state} userRole={user?.role} />
          )}

          {activeTab === 'team' && (
            <TeamTab userRole={user?.role} currentUserEmail={user?.email} />
          )}

          {/* STATUS TAB — on-duty team members update their zone's status */}
          {activeTab === 'status' && (
            <ZoneStatusTab
              liveState={state}
              userRole={user?.role}
              currentUserEmail={user?.email}
              onSubmitted={() => fetch(`${BACKEND_URL}/api/state`, { headers: authHeaders() }).then(r => r.json()).then(setState)}
            />
          )}

          {/* MAP TAB */}
          {activeTab === 'map' && (
            <PlantGeospatialView liveState={state} onZoneClick={setSelectedZone} />
          )}

          {/* ZONES TAB — admin-only zone configuration (create/edit/delete, any industry) */}
          {activeTab === 'zones' && isAdmin && <ZonesTab userRole={user?.role} />}

          {/* USERS TAB — sirf admin ko dikhta hai */}
          {activeTab === 'users' && isAdmin && <UsersTab currentUser={user} />}
        </div>
      </main>
    </div>
  );
}

// ── Users Tab (Admin only) ────────────────────────────────────────────────────

function UsersTab({ currentUser }) {
  const [tab, setTab] = useState('users'); // 'users' | 'invites' | 'audit' | 'companies'
  const [users, setUsers]     = useState([]);
  const [invites, setInvites] = useState([]);
  const [audit, setAudit]     = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating]   = useState(null);
  const [inviteRole, setInviteRole] = useState('operator');
   const [inviteEmail, setInviteEmail] = useState('');   // 🔽 NEW  
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [newInviteUrl, setNewInviteUrl] = useState(null);
  const [copied, setCopied] = useState(false);
 
  const isSuperAdmin = currentUser?.role === 'super_admin';
 
  const load = async () => {
    setLoading(true);
    try {
      const [uRes, iRes, aRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/users`,        { headers: authHeaders() }),
        fetch(`${BACKEND_URL}/api/auth/invites`, { headers: authHeaders() }),
        fetch(`${BACKEND_URL}/api/auth/audit`,   { headers: authHeaders() }),
      ]);
      if (uRes.ok) setUsers(await uRes.json());
      if (iRes.ok) setInvites(await iRes.json());
      if (aRes.ok) setAudit(await aRes.json());
 
      if (isSuperAdmin) {
        const cRes = await fetch(`${BACKEND_URL}/api/companies`, { headers: authHeaders() });
        if (cRes.ok) setCompanies(await cRes.json());
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };
 
  useEffect(() => { load(); }, []);
 
  const changeRole = async (userId, newRole) => {
    setUpdating(userId);
    const res = await fetch(`${BACKEND_URL}/api/users/${userId}/role`, {
      method: 'PATCH', headers: authHeaders(),
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      const updated = await res.json();
      setUsers(prev => prev.map(u => u._id === userId ? { ...u, role: updated.role } : u));
    }
    setUpdating(null);
  };
 
  const generateInvite = async () => {
    setGeneratingInvite(true);
    setNewInviteUrl(null);
    const res = await fetch(`${BACKEND_URL}/api/auth/invite`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ role: inviteRole, forEmail: inviteEmail }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewInviteUrl(data.inviteUrl);
      setInvites(prev => [data, ...prev]);
      setInviteEmail('');  
    }
    setGeneratingInvite(false);
  };
 
  const revokeInvite = async (token) => {
    await fetch(`${BACKEND_URL}/api/auth/invites/${token}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    setInvites(prev => prev.filter(i => i.token !== token));
  };
 
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
 
  const roleColor = (role) => {
    if (role === 'super_admin') return '#ff00ff';
    if (role === 'admin') return '#00ffb4';
    if (role === 'safety_officer') return '#ffaa00';
    return 'rgba(255,255,255,0.4)';
  };
 
  const tabStyle = (t) => ({
    padding: '6px 16px', borderRadius: 6, fontFamily: 'monospace',
    fontSize: 11, letterSpacing: 1, cursor: 'pointer', border: 'none',
    background: tab === t ? 'rgba(0,255,180,0.15)' : 'transparent',
    color: tab === t ? '#00ffb4' : 'rgba(255,255,255,0.35)',
    borderBottom: tab === t ? '1px solid #00ffb4' : '1px solid transparent',
  });
 
  if (loading) return (
    <div className="empty-state">
      <div style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', fontSize: 13 }}>[ loading... ]</div>
    </div>
  );
 
  return (
    <div style={{ maxWidth: 800 }}>
 
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 0 }}>
        <button style={tabStyle('users')} onClick={() => setTab('users')}>[U] Users ({users.length})</button>
        <button style={tabStyle('invites')} onClick={() => setTab('invites')}>[+] Invites</button>
        <button style={tabStyle('audit')} onClick={() => setTab('audit')}>[~] Audit Log</button>
        {isSuperAdmin && (
          <button style={tabStyle('companies')} onClick={() => setTab('companies')}>[C] Companies ({companies.length})</button>
        )}
      </div>
 
      {/* ── USERS TAB ── */}
      {tab === 'users' && (
        <div>
          {users.length === 0 ? (
            <div className="permits-empty">No users found</div>
          ) : (
            users.map(u => (
              <div key={u._id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 16px', marginBottom: 8,
                background: 'rgba(255,255,255,0.055)',
                border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8,
              }}>
                <img src={u.avatar} alt={u.name}
                  style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                  onError={e => { e.target.style.display = 'none'; }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{u.name}</span>
                    {u.role === 'super_admin' && (
                      <span style={{ fontSize: 9, color: '#ff00ff', border: '1px solid #ff00ff44', padding: '1px 6px', borderRadius: 4, letterSpacing: 1 }}>SUPER ADMIN</span>
                    )}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: 'monospace' }}>{u.email}</div>
                </div>
                {/* Don't allow changing super_admin role */}
                {u.role !== 'super_admin' ? (
                  <select
                    value={u.role}
                    disabled={updating === u._id}
                    onChange={e => changeRole(u._id, e.target.value)}
                    style={{
                      background: 'rgba(0,255,180,0.08)', border: '1px solid rgba(0,255,180,0.25)',
                      color: roleColor(u.role), padding: '4px 10px', borderRadius: 6,
                      fontFamily: 'monospace', fontSize: 11, cursor: 'pointer',
                      textTransform: 'uppercase', letterSpacing: 1,
                    }}>
                    <option value="admin">Admin</option>
                    <option value="safety_officer">Safety Officer</option>
                    <option value="operator">Operator</option>
                  </select>
                ) : (
                  <span style={{ fontSize: 11, color: '#ff00ff', fontFamily: 'monospace', padding: '4px 10px' }}>OWNER</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
 
      {/* ── INVITES TAB ── */}
      {tab === 'invites' && (
        <div>
          {/* Generate new invite */}
          <div style={{
            padding: 20, background: 'rgba(0,255,180,0.04)',
            border: '1px solid rgba(0,255,180,0.15)', borderRadius: 10, marginBottom: 24,
          }}>
            <div style={{ color: '#00ffb4', fontFamily: 'monospace', fontSize: 12, letterSpacing: 2, marginBottom: 14 }}>
              GENERATE INVITE LINK
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="email"
                placeholder="user@company.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,255,180,0.2)',
                  color: '#fff', padding: '8px 14px', borderRadius: 6,
                  fontFamily: 'monospace', fontSize: 12, minWidth: 200,
                }}
              />
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,255,180,0.2)',
                  color: '#fff', padding: '8px 14px', borderRadius: 6,
                  fontFamily: 'monospace', fontSize: 12,
                }}>
                <option value="operator">Operator</option>
                <option value="safety_officer">Safety Officer</option>
                <option value="admin">Admin</option>
              </select>
              <button
                onClick={generateInvite}
                disabled={generatingInvite || !inviteEmail.trim()}
                style={{
                  background: generatingInvite ? 'rgba(0,255,180,0.08)' : '#00ffb4',
                  color: '#000', border: 'none', padding: '8px 20px', borderRadius: 6,
                  fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                  cursor: generatingInvite ? 'wait' : 'pointer', letterSpacing: 1,
                }}>
                {generatingInvite ? '[ generating... ]' : '[+] CREATE INVITE'}
              </button>
            </div>
 
            {newInviteUrl && (
              <div style={{ marginTop: 16, padding: 14, background: 'rgba(255,255,255,0.06)', borderRadius: 8, border: '1px solid rgba(0,255,180,0.2)' }}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 8 }}>
                  INVITE LINK (valid 24hrs) — share this with your team:
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <code style={{ color: '#00ffb4', fontSize: 11, flex: 1, wordBreak: 'break-all', fontFamily: 'monospace' }}>
                    {newInviteUrl}
                  </code>
                  <button
                    onClick={() => copyToClipboard(newInviteUrl)}
                    style={{
                      background: copied ? '#00ffb4' : 'rgba(0,255,180,0.15)',
                      color: copied ? '#000' : '#00ffb4',
                      border: '1px solid rgba(0,255,180,0.3)', padding: '6px 14px',
                      borderRadius: 6, fontFamily: 'monospace', fontSize: 11,
                      cursor: 'pointer', flexShrink: 0,
                    }}>
                    {copied ? '✓ Copied!' : '[copy]'}
                  </button>
                </div>
              </div>
            )}
          </div>
 
          {/* Existing invites list */}
          <div style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', fontSize: 11, letterSpacing: 2, marginBottom: 10 }}>
            RECENT INVITES
          </div>
          {invites.length === 0 ? (
            <div className="permits-empty">No invites created yet</div>
          ) : (
            invites.map(inv => (
              <div key={inv.token} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', marginBottom: 6,
                background: 'rgba(255,255,255,0.045)', borderRadius: 8,
                border: `1px solid ${inv.usedBy ? 'rgba(0,255,180,0.1)' : 'rgba(255,255,255,0.06)'}`,
                opacity: inv.usedBy ? 0.6 : 1,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: roleColor(inv.role), fontFamily: 'monospace', fontSize: 11, textTransform: 'uppercase' }}>{inv.role}</span>
                    {inv.forEmail && (
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: 10 }}>→ {inv.forEmail}</span>
                    )}
                    {inv.usedBy
                      ? <span style={{ color: '#00ffb4', fontSize: 10, fontFamily: 'monospace' }}>✓ Used by {inv.usedBy}</span>
                      : new Date() > new Date(inv.expiresAt)
                        ? <span style={{ color: '#ff3a3a', fontSize: 10, fontFamily: 'monospace' }}>EXPIRED</span>
                        : <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'monospace' }}>Expires {new Date(inv.expiresAt).toLocaleString('en-IN')}</span>
                    }
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, fontFamily: 'monospace', marginTop: 2 }}>
                    Created by {inv.createdBy}
                  </div>
                </div>
                {!inv.usedBy && (
                  <button
                    onClick={() => revokeInvite(inv.token)}
                    style={{
                      background: 'transparent', border: '1px solid rgba(255,60,60,0.3)',
                      color: '#ff3a3a', padding: '4px 10px', borderRadius: 5,
                      fontFamily: 'monospace', fontSize: 10, cursor: 'pointer',
                    }}>
                    [revoke]
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
 
      {/* ── AUDIT LOG TAB ── */}
      {tab === 'audit' && (
        <div>
          {audit.length === 0 ? (
            <div className="permits-empty">No audit events yet</div>
          ) : (
            audit.map((log, i) => (
              <div key={i} style={{
                padding: '10px 14px', marginBottom: 6,
                background: 'rgba(255,255,255,0.045)', borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', gap: 14, alignItems: 'flex-start',
              }}>
                <div style={{ color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', fontSize: 10, flexShrink: 0, marginTop: 2 }}>
                  {new Date(log.createdAt).toLocaleString('en-IN')}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                    <span style={{
                      fontFamily: 'monospace', fontSize: 10, letterSpacing: 1, padding: '2px 8px', borderRadius: 4,
                      background: log.action.includes('CRITICAL') || log.action.includes('DELETE') ? 'rgba(255,60,60,0.15)' : 'rgba(0,255,180,0.08)',
                      color: log.action.includes('CRITICAL') || log.action.includes('DELETE') ? '#ff3a3a' : '#00ffb4',
                    }}>{log.action}</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{log.actorEmail}</span>
                  </div>
                  {log.targetEmail && (
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
                      → {log.targetEmail}
                      {log.details?.from && log.details?.to && ` (${log.details.from} → ${log.details.to})`}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
 
      {/* ── COMPANIES TAB (super admin only) ── */}
      {tab === 'companies' && isSuperAdmin && (
        <div>
          {companies.length === 0 ? (
            <div className="permits-empty">No companies yet</div>
          ) : (
            companies.map(c => (
              <div key={c._id} style={{
                padding: '14px 18px', marginBottom: 8,
                background: 'rgba(255,255,255,0.055)', borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.07)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', fontSize: 11, marginTop: 3 }}>
                      domain: {c.domain} · created by {c.createdBy}
                    </div>
                  </div>
                  <div style={{
                    textAlign: 'center', background: 'rgba(0,255,180,0.08)',
                    padding: '8px 16px', borderRadius: 8,
                    border: '1px solid rgba(0,255,180,0.15)',
                  }}>
                    <div style={{ color: '#00ffb4', fontFamily: 'monospace', fontSize: 20, fontWeight: 700 }}>{c.userCount}</div>
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'monospace' }}>USERS</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}