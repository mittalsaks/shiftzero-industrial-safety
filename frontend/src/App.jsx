import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import PlantGeospatialView from './PlantGeospatialView';
import LandingPage from './LandingPage';
import './App.css';
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const socket = io(BACKEND_URL);

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Sparkline (SVG mini-chart from real history) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function Sparkline({ history, field = 'riskLevel', color }) {
  if (!history || history.length < 2) return <div className="sparkline-empty">â€“</div>;
  const vals = history.map(h => h[field]);
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

// â”€â”€ Risk Arc gauge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Time-to-Critical pill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TimeToCritical({ prediction }) {
  if (!prediction || !prediction.confident || prediction.minutesToCritical === null) return null;
  if (prediction.minutesToCritical === 0) return (
    <div className="ttc-pill ttc-now">âš  CRITICAL NOW</div>
  );
  return (
    <div className={`ttc-pill ${prediction.minutesToCritical <= 5 ? 'ttc-urgent' : 'ttc-warn'}`}>
      â± CRITICAL IN ~{prediction.minutesToCritical}min
    </div>
  );
}

// â”€â”€ Permit conflict badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function PermitConflictBadge({ conflicts }) {
  if (!conflicts || conflicts.length === 0) return null;
  const worst = conflicts.find(c => c.severity === 'CRITICAL') || conflicts[0];
  return (
    <div className={`permit-conflict-badge ${worst.severity === 'CRITICAL' ? 'perm-critical' : 'perm-high'}`}>
      ðŸ”’ PTW CONFLICT: {worst.permitType}
    </div>
  );
}

// â”€â”€ Zone Card (enhanced) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ZoneCard({ z, onClick }) {
  const color = riskColor(z.mismatchScore);
  const isCritical = z.mismatchScore >= 60;
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
        <div className="sensor-item">
          <span className="sensor-label">GAS</span>
          <span className="sensor-value">{z.sensor.gasPpm} <span className="sensor-unit">ppm</span></span>
        </div>
        <div className="sensor-item">
          <span className="sensor-label">TEMP</span>
          <span className="sensor-value">{z.sensor.tempC}Â° <span className="sensor-unit">C</span></span>
        </div>
        <div className="sensor-item">
          <span className="sensor-label">RISK</span>
          <span className="sensor-value">{(z.sensor.riskLevel * 100).toFixed(0)}<span className="sensor-unit">%</span></span>
        </div>
      </div>

      <div className="risk-track">
        <div className="risk-fill" style={{ width: `${z.sensor.riskLevel * 100}%`, background: color, boxShadow: `0 0 8px ${color}` }} />
      </div>

      {/* Sparkline row */}
      <div className="zone-spark-row">
        <div className="spark-item">
          <span className="spark-label">GAS TREND</span>
          <Sparkline history={z.history} field="gasPpm" color={color} />
        </div>
        <div className="spark-item">
          <span className="spark-label">RISK TREND</span>
          <Sparkline history={z.history} field="riskLevel" color={color} />
        </div>
      </div>

      {/* Bottom badges */}
      <div className="zone-badges">
        <TimeToCritical prediction={z.prediction} />
        <PermitConflictBadge conflicts={z.permitConflicts} />
        {z.activePermits?.length > 0 && (
          <div className="active-permit-badge">
            ðŸ”‘ {z.activePermits.length} ACTIVE PERMIT{z.activePermits.length > 1 ? 'S' : ''}
          </div>
        )}
        {isCritical && <div className="zone-alert-badge">âš  VERBAL-SENSOR MISMATCH</div>}
      </div>
    </div>
  );
}

// â”€â”€ Zone Detail Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
          <button className="modal-close" onClick={onClose}>âœ•</button>
        </div>

        <div className="modal-body">
          {/* Live sensor row */}
          <div className="modal-section-label">LIVE SENSORS</div>
          <div className="modal-sensor-grid">
            {[
              { label: 'Gas Level', value: `${z.sensor.gasPpm} ppm`, warn: z.sensor.gasPpm > 30 },
              { label: 'Temperature', value: `${z.sensor.tempC}Â°C`, warn: z.sensor.tempC > 55 },
              { label: 'Risk Level', value: `${(z.sensor.riskLevel * 100).toFixed(0)}%`, warn: z.sensor.riskLevel > 0.5 },
              { label: 'Trend Velocity', value: z.sensor.trendVelocity, warn: z.sensor.trendVelocity > 0.4 },
            ].map(s => (
              <div key={s.label} className={`modal-sensor-cell ${s.warn ? 'modal-sensor-warn' : ''}`}>
                <div className="modal-sensor-lbl">{s.label}</div>
                <div className="modal-sensor-val" style={{ color: s.warn ? color : undefined }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Prediction */}
          {z.prediction?.confident && z.prediction.minutesToCritical !== null && (
            <div className="modal-prediction">
              <div className="modal-section-label">RISK PREDICTION</div>
              <div className="prediction-box" style={{ borderColor: color }}>
                <span className="pred-icon">â±</span>
                {z.prediction.minutesToCritical === 0
                  ? 'Zone is at CRITICAL level now â€” immediate action required'
                  : `At current escalation rate, ${z.zone} will reach CRITICAL in ~${z.prediction.minutesToCritical} minutes`
                }
              </div>
            </div>
          )}

          {/* Sparkline charts */}
          <div className="modal-section-label">SENSOR HISTORY ({z.history?.length || 0} readings)</div>
          <div className="modal-charts">
            <div className="modal-chart-block">
              <div className="chart-label">Gas (ppm)</div>
              <MiniChart history={z.history} field="gasPpm" color={color} />
            </div>
            <div className="modal-chart-block">
              <div className="chart-label">Risk Level</div>
              <MiniChart history={z.history} field="riskLevel" color="#ffaa00" />
            </div>
            <div className="modal-chart-block">
              <div className="chart-label">Temperature (Â°C)</div>
              <MiniChart history={z.history} field="tempC" color="#00c8ff" />
            </div>
          </div>

          {/* Active Permits */}
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

          {/* Permit conflicts */}
          {z.permitConflicts?.length > 0 && (
            <>
              <div className="modal-section-label">âš  PERMIT CONFLICTS</div>
              {z.permitConflicts.map(c => (
                <div key={c.permitId} className={`conflict-card ${c.severity === 'CRITICAL' ? 'conf-critical' : 'conf-high'}`}>
                  <div className="conflict-header">
                    <span className="conf-permit">{c.permitId} Â· {c.permitType}</span>
                    <span className={`conf-sev sev-${c.severity}`}>{c.severity}</span>
                  </div>
                  <div className="conflict-reason">{c.reason}</div>
                </div>
              ))}
            </>
          )}

          {/* Last handover */}
          {z.lastHandover && (
            <>
              <div className="modal-section-label">LAST HANDOVER NOTE</div>
              <div className="modal-handover-note">
                <div className="hov-quote">"{z.lastHandover.text}"</div>
                <div className="hov-meta">
                  Risk language score: <strong>{(z.lastHandover.riskLanguageScore * 100).toFixed(0)}%</strong>
                  Â· Submitted {new Date(z.lastHandover.timestamp).toLocaleTimeString('en-IN')}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// â”€â”€ Full mini-chart for modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function MiniChart({ history, field, color }) {
  if (!history || history.length < 2) return <div className="minichart-empty">No data yet</div>;
  const vals = history.map(h => h[field]);
  const min = Math.min(...vals);
  const max = Math.max(...vals) || 1;
  const W = 200, H = 48;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - ((v - min) / (max - min + 0.001)) * (H - 6) - 3;
    return `${x},${y}`;
  }).join(' ');
  // fill area under line
  const fillPts = `0,${H} ` + pts + ` ${W},${H}`;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="minichart-svg">
      <defs>
        <linearGradient id={`grad-${field}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill={`url(#grad-${field})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      {vals.map((v, i) => {
        const x = (i / (vals.length - 1)) * W;
        const y = H - ((v - min) / (max - min + 0.001)) * (H - 6) - 3;
        return <circle key={i} cx={x} cy={y} r="1.5" fill={color} opacity="0.5" />;
      })}
    </svg>
  );
}

// â”€â”€ Permits Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function PermitsTab({ liveState }) {
  const [permits, setPermits] = useState([]);
  const [newPermit, setNewPermit] = useState({ zone: '', type: 'HOT_WORK', issuedBy: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(null);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/permits').then(r => r.json()).then(setPermits);
    socket.on('permitsUpdate', setPermits);
    return () => socket.off('permitsUpdate');
  }, []);

  const allZones = liveState.map(z => z.zone);

  const issuePermit = async () => {
    if (!newPermit.zone || !newPermit.issuedBy || !newPermit.description) return;
    setSubmitting(true);
    await fetch(`${BACKEND_URL}/api/permits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newPermit)
    });
    setNewPermit({ zone: '', type: 'HOT_WORK', issuedBy: '', description: '' });
    setSubmitting(false);
  };

  const closePermit = async (id) => {
    setClosing(id);
    await fetch(`${BACKEND_URL}/api/permits/${id}/close`, { method: 'PATCH' });
    setClosing(null);
  };

  const active = permits.filter(p => p.active);
  const closed = permits.filter(p => !p.active);

  // Find conflicts from liveState
  const allConflicts = liveState.flatMap(z => (z.permitConflicts || []).map(c => ({ ...c, zone: z.zone })));

  return (
    <div className="permits-tab">
      {/* Conflict banner */}
      {allConflicts.length > 0 && (
        <div className="permit-conflict-banner">
          <span className="pcb-icon">âš </span>
          <div>
            <strong>{allConflicts.length} PERMIT CONFLICT{allConflicts.length > 1 ? 'S' : ''} DETECTED</strong>
            {allConflicts.map(c => (
              <div key={c.permitId} className="pcb-detail">
                [{c.zone}] {c.permitId} â€” {c.reason.slice(0, 100)}â€¦
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
                    Issued by {p.issuedBy} Â· {new Date(p.issuedAt).toLocaleTimeString('en-IN')}
                  </div>
                  {conflict && (
                    <div className="permit-conflict-inline">âš  {conflict.reason}</div>
                  )}
                  <button
                    className="close-permit-btn"
                    onClick={() => closePermit(p.id)}
                    disabled={closing === p.id}
                  >
                    {closing === p.id ? 'Closingâ€¦' : 'âœ• Close Permit'}
                  </button>
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
                  <div className="permit-desc-text" style={{ opacity: 0.5 }}>{p.description} â€” {p.zone}</div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Issue new permit */}
        <div className="issue-permit-panel">
          <div className="panel-header">
            <span className="panel-title">ISSUE NEW PERMIT</span>
          </div>
          <div className="issue-form">
            <div className="form-group">
              <label className="form-label">ZONE</label>
              <select className="form-select" value={newPermit.zone} onChange={e => setNewPermit(p => ({ ...p, zone: e.target.value }))}>
                <option value="">â€” select zone â€”</option>
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
              {submitting ? <><span className="spin-icon">â—Œ</span> Issuingâ€¦</> : '+ ISSUE PERMIT'}
            </button>
            <div className="ptw-note">
              Permits are auto-cross-checked against live sensor data. Hot Work + elevated gas readings will trigger an immediate conflict alert.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// â”€â”€ Alert Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
          <div className="rec-label">â¬¡ AI RECOMMENDATION</div>
          <div className="rec-text">{a.alert.recommendation}</div>
        </div>
      )}
      {a.alert?.permitConflicts?.length > 0 && (
        <div className="alert-permits-section">
          <div className="rec-label">ðŸ”’ PERMIT CONFLICTS IN THIS ALERT</div>
          {a.alert.permitConflicts.map(c => (
            <div key={c.permitId} className={`conflict-card conf-inline ${c.severity === 'CRITICAL' ? 'conf-critical' : 'conf-high'}`}>
              <span className="conf-permit">{c.permitId} Â· {c.permitType}</span>
              <span className={`conf-sev sev-${c.severity}`}>{c.severity}</span>
              <div className="conflict-reason">{c.reason}</div>
            </div>
          ))}
        </div>
      )}
      {a.alert?.matchedIncidents?.length > 0 && (
        <div className="matched-row">
          {a.alert.matchedIncidents.map(m => (
            <span key={m.id} className="inc-tag">{m.id} Â· {m.title}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// â”€â”€ Main App â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function App() {
  const [user, setUser] = useState(null);
  const [state, setState] = useState([]);
  const [zone, setZone] = useState('CokeOvenBattery-3');
  const [note, setNote] = useState('');
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
    fetch(`${BACKEND_URL}/api/state').then(r => r.json()).then(setState);
    socket.on('stateUpdate', setState);
    socket.on('alert', (a) => setAlerts(prev => [a, ...prev].slice(0, 20)));
    return () => { socket.off('stateUpdate'); socket.off('alert'); };
  }, []);

  // Keep selected zone in sync with live state
  useEffect(() => {
    if (selectedZone) {
      const updated = state.find(z => z.zone === selectedZone.zone);
      if (updated) setSelectedZone(updated);
    }
  }, [state]);

  const submitHandover = async () => {
    if (!note.trim()) return;
    setSubmitting(true);
    await fetch(`${BACKEND_URL}/api/handover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone, text: note })
    });
    setNote('');
    setSubmitting(false);
  };

  if (!user) return <LandingPage onLogin={setUser} />;

  const criticalCount = state.filter(z => z.mismatchScore >= 60).length;
  const avgRisk = state.length ? (state.reduce((a, z) => a + z.sensor.riskLevel, 0) / state.length * 100).toFixed(0) : 0;
  const totalPermitConflicts = state.reduce((a, z) => a + (z.permitConflicts?.length || 0), 0);

  const tabs = [
    { id: 'dashboard', icon: 'â¬¡', label: 'Dashboard' },
    { id: 'handover', icon: 'âœ', label: 'Handover' },
    { id: 'alerts', icon: 'âš¡', label: `Alerts${alerts.length > 0 ? ` (${alerts.length})` : ''}` },
    { id: 'permits', icon: 'ðŸ”‘', label: `Permits${totalPermitConflicts > 0 ? ` âš ${totalPermitConflicts}` : ''}` },
    { id: 'map', icon: 'âŠ•', label: 'Plant Map' },
  ];

  return (
    <div className="app-shell">
      {/* Zone detail modal */}
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
        <nav className="sidebar-nav">
          {tabs.map(item => (
            <button key={item.id} className={`nav-item ${activeTab === item.id ? 'nav-active' : ''}`} onClick={() => setActiveTab(item.id)}>
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="user-avatar">{user.avatar}</div>
            <div>
              <div className="user-name">{user.name}</div>
              <div className="user-role">Safety Officer</div>
            </div>
          </div>
          <button className="logout-btn" onClick={() => setUser(null)}>â»</button>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        <div className="topbar">
          <div className="topbar-left">
            <div className="page-title">
              {activeTab === 'dashboard' && 'Live Operations'}
              {activeTab === 'handover' && 'Shift Handover'}
              {activeTab === 'alerts' && 'Alert Feed'}
              {activeTab === 'permits' && 'Permit to Work'}
              {activeTab === 'map' && 'Plant Map'}
            </div>
            <div className="breadcrumb">Vizag Steel Plant Â· CokeOven Division</div>
          </div>
          <div className="topbar-right">
            {totalPermitConflicts > 0 && (
              <div className="permit-conflict-chip" onClick={() => setActiveTab('permits')}>
                ðŸ”’ {totalPermitConflicts} PTW CONFLICT{totalPermitConflicts > 1 ? 'S' : ''}
              </div>
            )}
            {criticalCount > 0 && (
              <div className="critical-badge">
                <span className="crit-dot" />
                {criticalCount} CRITICAL ZONE{criticalCount > 1 ? 'S' : ''}
              </div>
            )}
            <div className="clock">{time.toLocaleTimeString('en-IN', { hour12: false })}</div>
            <div className="live-chip">â— LIVE</div>
          </div>
        </div>

        <div className="content-body">

          {/* DASHBOARD TAB */}
          {activeTab === 'dashboard' && (
            <>
              <div className="kpi-row">
                {[
                  { label: 'Critical Zones', value: criticalCount, color: criticalCount > 0 ? '#ff3a3a' : '#00ffb4', sub: 'mismatch score â‰¥ 60' },
                  { label: 'Avg Sensor Risk', value: `${avgRisk}%`, color: avgRisk > 50 ? '#ffaa00' : '#00ffb4', sub: 'across all zones' },
                  { label: 'Active Alerts', value: alerts.length, color: alerts.length > 0 ? '#ff3a3a' : '#00ffb4', sub: 'last 20 events' },
                  { label: 'PTW Conflicts', value: totalPermitConflicts, color: totalPermitConflicts > 0 ? '#ffaa00' : '#00ffb4', sub: 'live permit clashes' },
                ].map(k => (
                  <div key={k.label} className="kpi-card">
                    <div className="kpi-label">{k.label}</div>
                    <div className="kpi-value" style={{ color: k.color, textShadow: `0 0 20px ${k.color}40` }}>{k.value}</div>
                    <div className="kpi-sub">{k.sub}</div>
                  </div>
                ))}
              </div>

              <div className="section-title">Zone Status <span className="section-badge">LIVE</span>
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
                <div className="info-icon">â„¹</div>
                <div>
                  <strong>How it works:</strong> Submit a shift-handover note for any zone. The AI compares the risk language in your note against live sensor trends. If sensors show escalation but your note sounds calm, a Verbal-Sensor Mismatch is flagged.
                </div>
              </div>
              {/* Live state of selected zone */}
              {zone && state.find(z => z.zone === zone) && (() => {
                const z = state.find(s => s.zone === zone);
                const color = riskColor(z.mismatchScore);
                return (
                  <div className="handover-zone-preview" style={{ borderColor: color + '40' }}>
                    <div className="hzp-label">CURRENT ZONE STATE</div>
                    <div className="hzp-row">
                      <span style={{ color }}>â— {riskLabel(z.mismatchScore)}</span>
                      <span>Gas: {z.sensor.gasPpm} ppm</span>
                      <span>Temp: {z.sensor.tempC}Â°C</span>
                      <span>Risk: {(z.sensor.riskLevel * 100).toFixed(0)}%</span>
                      {z.prediction?.confident && z.prediction.minutesToCritical !== null && (
                        <TimeToCritical prediction={z.prediction} />
                      )}
                    </div>
                    {z.activePermits?.length > 0 && (
                      <div className="hzp-permits">
                        ðŸ”‘ Active permits: {z.activePermits.map(p => `${p.id} (${p.type})`).join(', ')}
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
              </div>
              <button className={`submit-btn ${submitting ? 'submitting' : ''}`} onClick={submitHandover} disabled={submitting || !note.trim()}>
                {submitting ? <><span className="spin-icon">â—Œ</span> AI ANALYZING...</> : <><span>âš¡</span> SUBMIT & ANALYZE</>}
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
                  <div className="empty-icon">âœ“</div>
                  <div>No active mismatches detected</div>
                  <div className="empty-sub">All zones within normal parameters</div>
                </div>
              ) : (
                alerts.map((a, i) => <AlertCard key={i} a={a} />)
              )}
            </div>
          )}

          {/* PERMITS TAB */}
          {activeTab === 'permits' && <PermitsTab liveState={state} />}

          {/* MAP TAB */}
          {activeTab === 'map' && (
            <PlantGeospatialView liveState={state} onZoneClick={setSelectedZone} />
          )}
        </div>
      </main>
    </div>
  );
}




