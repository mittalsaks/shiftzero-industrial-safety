import { useState } from 'react';

// Part 7/8 — replaces the old hardcoded 4-zone steel-plant floorplan
// (fixed x/y positions + gas/metal/feed pipelines) with a layout computed
// from however many zones this organization has actually created. Works for
// any industry, any zone count, any metric set — there's no more assumption
// that zones are steel-plant units connected by pipelines.

function riskFill(score) {
  if (score >= 60) return '#ff3a3a';
  if (score >= 30) return '#ffaa00';
  return '#00ffb4';
}

// Simple auto-grid: enough rows/cols to fit `count` zones inside the 0-100 x
// 0-80 viewBox, with even gaps.
function computeLayout(count) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const gap = 4;
  const cellW = (100 - gap * (cols + 1)) / cols;
  const cellH = (80 - gap * (rows + 1)) / rows;
  const positions = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    positions.push({ x: gap + col * (cellW + gap), y: gap + row * (cellH + gap), w: cellW, h: cellH });
  }
  return positions;
}

// Short hover-tooltip text from whatever metrics this zone tracks (or just
// risk %, for zones with no metricConfig — e.g. purely manual/status zones).
function primaryMetricText(z) {
  const cfg = z.metricConfig || [];
  const parts = cfg.slice(0, 2)
    .map(m => {
      const v = z.sensor?.metrics?.[m.key];
      return v != null ? `${m.label}: ${v}${m.unit || ''}` : null;
    })
    .filter(Boolean);
  return parts.length ? parts.join('   ') : `Risk: ${(z.sensor.riskLevel * 100).toFixed(0)}%`;
}

export default function PlantGeospatialView({ liveState, onZoneClick }) {
  const [hoveredZone, setHoveredZone] = useState(null);
  const zones = liveState || [];
  const layout = computeLayout(zones.length || 1);
  const centers = zones.map((z, i) => {
    const l = layout[i];
    return l ? { x: l.x + l.w / 2, y: l.y + l.h / 2 } : null;
  });

  return (
    <div className="plant-map-wrapper">
      <h2>⬡ Zone Risk Map</h2>
      <svg
        viewBox="0 0 100 80"
        className="plant-map"
        style={{ background: 'linear-gradient(135deg, #020b14 0%, #030d1a 100%)' }}
      >
        <defs>
          <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(0,255,180,0.04)" strokeWidth="0.2" />
          </pattern>
          <filter id="glow-red">
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-green">
            <feGaussianBlur stdDeviation="1" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-amber">
            <feGaussianBlur stdDeviation="1" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id="fill-green" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00ffb4" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#00ffb4" stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id="fill-amber" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffaa00" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#ffaa00" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="fill-red" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff3a3a" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ff3a3a" stopOpacity="0.06" />
          </linearGradient>
        </defs>

        <rect width="100" height="80" fill="url(#grid)" />
        <rect x="1" y="1" width="98" height="78" fill="none" stroke="rgba(0,255,180,0.08)" strokeWidth="0.3" strokeDasharray="3,4" rx="1.5" />

        {/* Faint network lines linking every zone, so the map reads as one
            connected plant rather than a grid of unrelated boxes. */}
        {centers.length > 1 && centers.map((c, i) => {
          if (!c || i === centers.length - 1) return null;
          const next = centers[i + 1];
          if (!next) return null;
          return (
            <line key={`link-${i}`} x1={c.x} y1={c.y} x2={next.x} y2={next.y}
              stroke="rgba(0,255,180,0.12)" strokeWidth="0.3" strokeDasharray="1.5,1.5">
              <animate attributeName="stroke-dashoffset" values="0;-6" dur="2.4s" repeatCount="indefinite" />
            </line>
          );
        })}

        {zones.length === 0 && (
          <text x="50" y="40" textAnchor="middle" fontSize="3" fill="rgba(232,244,248,0.3)" fontFamily="monospace">
            No zones yet — create one from the Zones tab
          </text>
        )}

        {zones.map((z, i) => {
          const l = layout[i];
          if (!l) return null;
          const fill = riskFill(z.mismatchScore);
          const isCrit = z.mismatchScore >= 60;
          const isElev = z.mismatchScore >= 30;
          const tone = isCrit ? 'red' : isElev ? 'amber' : 'green';
          const glowFilter = isCrit ? 'url(#glow-red)' : isElev ? 'url(#glow-amber)' : 'url(#glow-green)';
          const isHovered = hoveredZone === z.zone;
          const hasConflict = z.permitConflicts?.length > 0;
          const hasPermit = z.activePermits?.length > 0;
          const cx = l.x + l.w / 2, cy = l.y + l.h / 2;
          const displayName = z.zone.length > 18 ? z.zone.slice(0, 16) + '…' : z.zone;

          return (
            <g
              key={z.zone}
              className={`zone-box${isHovered ? ' zone-box-hovered' : ''}`}
              style={{ cursor: 'pointer' }}
              onClick={() => onZoneClick && onZoneClick(z)}
              onMouseEnter={() => setHoveredZone(z.zone)}
              onMouseLeave={() => setHoveredZone(null)}
            >
              {isHovered && (
                <circle cx={cx} cy={cy} r={Math.max(l.w, l.h) / 1.4} fill="none" stroke={fill} strokeWidth="0.25" opacity="0.35">
                  <animate attributeName="r" values={`${Math.max(l.w, l.h) / 2.2};${Math.max(l.w, l.h) / 1.2}`} dur="1.1s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0" dur="1.1s" repeatCount="indefinite" />
                </circle>
              )}
              {isCrit && (
                <rect x={l.x - 1.5} y={l.y - 1.5} width={l.w + 3} height={l.h + 3} rx="3.5" fill="none" stroke={fill} strokeWidth="0.6">
                  <animate attributeName="opacity" values="0.1;0.6;0.1" dur="1.5s" repeatCount="indefinite" />
                </rect>
              )}
              {isHovered && (
                <rect x={l.x - 1} y={l.y - 1} width={l.w + 2} height={l.h + 2} rx="3" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
              )}

              <rect x={l.x} y={l.y} width={l.w} height={l.h} fill={`url(#fill-${tone})`} rx="2.5" />
              <rect
                x={l.x} y={l.y} width={l.w} height={l.h} fill="none" stroke={fill}
                strokeWidth={isCrit ? '0.9' : isHovered ? '0.7' : '0.5'} rx="2.5"
                filter={isCrit || isHovered ? glowFilter : undefined} opacity={isCrit ? 0.9 : 0.6}
              />
              {/* Subtle top-edge highlight for a slight bevel / depth feel */}
              <line x1={l.x + 1.5} y1={l.y + 0.4} x2={l.x + l.w - 1.5} y2={l.y + 0.4} stroke="rgba(255,255,255,0.18)" strokeWidth="0.35" strokeLinecap="round" />

              <text x={cx} y={cy - 2} textAnchor="middle" fontSize="2.8" fill="rgba(232,244,248,0.85)" fontFamily="monospace" fontWeight="700">
                {displayName}
              </text>

              <rect x={l.x + 2} y={l.y + l.h - 5.5} width={l.w - 4} height="1.5" fill="rgba(255,255,255,0.06)" rx="0.75" />
              <rect
                x={l.x + 2} y={l.y + l.h - 5.5} width={(l.w - 4) * z.sensor.riskLevel} height="1.5"
                fill={fill} rx="0.75" opacity="0.8"
              >
                {isCrit && <animate attributeName="opacity" values="0.6;1;0.6" dur="1s" repeatCount="indefinite" />}
              </rect>

              <text x={cx} y={l.y + l.h - 2} textAnchor="middle" fontSize="2.8" fill={fill} fontFamily="monospace" fontWeight="700">
                {z.mismatchScore > 0 ? `MISMATCH ${z.mismatchScore}` : `RISK ${(z.sensor.riskLevel * 100).toFixed(0)}%`}
              </text>

              {hasPermit && (
                <g>
                  <circle cx={l.x + 2.5} cy={l.y + 2.5} r="2" fill="rgba(0,200,255,0.15)" stroke="rgba(0,200,255,0.5)" strokeWidth="0.3" />
                  <text x={l.x + 2.5} y={l.y + 3.2} textAnchor="middle" fontSize="2" fill="rgba(0,200,255,0.9)" fontFamily="monospace">P</text>
                </g>
              )}
              {hasConflict && (
                <g>
                  <circle cx={l.x + l.w - 2.5} cy={l.y + 2.5} r="2" fill="rgba(255,170,0,0.2)" stroke={fill} strokeWidth="0.3">
                    <animate attributeName="opacity" values="0.6;1;0.6" dur="1s" repeatCount="indefinite" />
                  </circle>
                  <text x={l.x + l.w - 2.5} y={l.y + 3.2} textAnchor="middle" fontSize="2.2" fill={fill} fontFamily="monospace">!</text>
                </g>
              )}
              {isCrit && (
                <circle cx={cx} cy={l.y + 2.5} r="1.2" fill={fill}>
                  <animate attributeName="r" values="1.2;2;1.2" dur="0.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="1;0.2;1" dur="0.8s" repeatCount="indefinite" />
                </circle>
              )}

              {isHovered && (
                <g>
                  <rect x={cx - 17} y={l.y - 9} width="34" height="7.5" fill="#071525" stroke={fill} strokeWidth="0.3" rx="1.5" opacity="0.95" />
                  <text x={cx} y={l.y - 5.5} textAnchor="middle" fontSize="1.8" fill={fill} fontFamily="monospace" fontWeight="600">
                    {primaryMetricText(z)}
                  </text>
                  <text x={cx} y={l.y - 2.8} textAnchor="middle" fontSize="1.8" fill="rgba(232,244,248,0.6)" fontFamily="monospace">
                    Click for full details
                  </text>
                </g>
              )}
            </g>
          );
        })}

        <text x="97" y="5" textAnchor="middle" fontSize="2.8" fill="rgba(0,255,180,0.3)" fontFamily="monospace" fontWeight="700">N</text>
        <line x1="97" y1="5.5" x2="97" y2="9" stroke="rgba(0,255,180,0.3)" strokeWidth="0.4" />
        <polygon points="96.2,5.5 97,3.5 97.8,5.5" fill="rgba(0,255,180,0.3)" />
      </svg>

      <div className="map-legend">
        <div className="map-legend-left">
          <span><i className="dot" style={{ background: '#00ffb4' }} /> Nominal</span>
          <span><i className="dot" style={{ background: '#ffaa00' }} /> Elevated</span>
          <span><i className="dot" style={{ background: '#ff3a3a' }} /> Critical mismatch</span>
        </div>
        <span className="map-hint">Click any zone for details · Hover for quick stats</span>
      </div>
    </div>
  );
}
