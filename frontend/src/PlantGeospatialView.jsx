import { useEffect, useRef, useState } from 'react';

// Plant layout — percent-based positions on the SVG viewBox (0 0 100 80)
const ZONE_LAYOUT = {
  'CokeOvenBattery-3': { x: 8,  y: 8,  w: 28, h: 20, label: ['COKE OVEN', 'BATTERY-3'] },
  'BlastFurnace-1':    { x: 64, y: 8,  w: 28, h: 20, label: ['BLAST', 'FURNACE-1'] },
  'GasStorage-Yard':   { x: 8,  y: 52, w: 28, h: 20, label: ['GAS STORAGE', 'YARD'] },
  'RollingMill-2':     { x: 64, y: 52, w: 28, h: 20, label: ['ROLLING', 'MILL-2'] },
};

// Pipeline connections between zone centers
const PIPELINES = [
  { from: 'CokeOvenBattery-3', to: 'BlastFurnace-1', type: 'gas' },
  { from: 'CokeOvenBattery-3', to: 'GasStorage-Yard', type: 'feed' },
  { from: 'BlastFurnace-1',    to: 'RollingMill-2',  type: 'metal' },
  { from: 'GasStorage-Yard',   to: 'RollingMill-2',  type: 'feed' },
  { from: 'BlastFurnace-1',    to: 'GasStorage-Yard', type: 'gas' },
];

const PIPE_COLORS = {
  gas:  '#ff6b35',
  feed: 'rgba(0,255,180,0.4)',
  metal: '#ffaa00',
};

function zoneCenter(key) {
  const l = ZONE_LAYOUT[key];
  if (!l) return { x: 50, y: 40 };
  return { x: l.x + l.w / 2, y: l.y + l.h / 2 };
}

function riskFill(score) {
  if (score >= 60) return '#ff3a3a';
  if (score >= 30) return '#ffaa00';
  return '#00ffb4';
}

// Animated dot along a path
function FlowDot({ x1, y1, x2, y2, color, dur, delay = 0 }) {
  return (
    <circle r="1.2" fill={color} opacity="0.9">
      <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${delay}s`}>
        <mpath href={`#pipe-${x1}-${y1}-${x2}-${y2}`} />
      </animateMotion>
    </circle>
  );
}

export default function PlantGeospatialView({ liveState, onZoneClick }) {
  const [hoveredZone, setHoveredZone] = useState(null);
  const [animTick, setAnimTick] = useState(0);

  // Pulse animation tick
  useEffect(() => {
    const t = setInterval(() => setAnimTick(n => n + 1), 100);
    return () => clearInterval(t);
  }, []);

  const getZoneState = (key) => liveState?.find(z => z.zone === key);

  return (
    <div className="plant-map-wrapper">
      <h2>⊕ Plant Geospatial Risk View</h2>
      <svg
        viewBox="0 0 100 80"
        className="plant-map"
        style={{ background: 'linear-gradient(135deg, #020b14 0%, #030d1a 100%)' }}
      >
        <defs>
          {/* Grid pattern */}
          <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(0,255,180,0.04)" strokeWidth="0.2"/>
          </pattern>

          {/* Glow filters */}
          <filter id="glow-red">
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="glow-green">
            <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="glow-amber">
            <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>

          {/* Define pipeline paths for animation */}
          {PIPELINES.map(p => {
            const c1 = zoneCenter(p.from);
            const c2 = zoneCenter(p.to);
            return (
              <path
                key={`${p.from}-${p.to}`}
                id={`pipe-${c1.x}-${c1.y}-${c2.x}-${c2.y}`}
                d={`M ${c1.x} ${c1.y} L ${c2.x} ${c2.y}`}
              />
            );
          })}
        </defs>

        {/* Background */}
        <rect width="100" height="80" fill="url(#grid)" />
        <rect x="1" y="1" width="98" height="78" fill="none" stroke="rgba(0,255,180,0.08)" strokeWidth="0.3" strokeDasharray="3,4" rx="1.5"/>

        {/* Central processing area label */}
        <text x="50" y="42" textAnchor="middle" fontSize="2.5" fill="rgba(0,255,180,0.08)" fontFamily="monospace" letterSpacing="3">
          INTEGRATED STEEL PLANT — VIZAG
        </text>

        {/* ── Pipelines ── */}
        {PIPELINES.map(p => {
          const c1 = zoneCenter(p.from);
          const c2 = zoneCenter(p.to);
          const color = PIPE_COLORS[p.type];

          // Check if either end zone is escalating
          const z1 = getZoneState(p.from);
          const z2 = getZoneState(p.to);
          const isHot = (z1?.sensor?.riskLevel > 0.5) || (z2?.sensor?.riskLevel > 0.5);
          const pipeColor = isHot && p.type === 'gas' ? '#ff4444' : color;

          return (
            <g key={`${p.from}-${p.to}`}>
              {/* Shadow/glow pipe */}
              <line
                x1={c1.x} y1={c1.y} x2={c2.x} y2={c2.y}
                stroke={pipeColor} strokeWidth="1.2" opacity="0.12"
              />
              {/* Main pipe */}
              <line
                x1={c1.x} y1={c1.y} x2={c2.x} y2={c2.y}
                stroke={pipeColor} strokeWidth="0.5" opacity="0.5"
                strokeDasharray={p.type === 'gas' ? '2,1.5' : 'none'}
              />
              {/* Animated flow dots */}
              <circle r="1.0" fill={pipeColor} opacity="0.8">
                <animateMotion
                  dur={`${p.type === 'gas' ? 2.5 : 3.5}s`}
                  repeatCount="indefinite"
                  begin={`${PIPELINES.indexOf(p) * 0.7}s`}
                >
                  <mpath href={`#pipe-${c1.x}-${c1.y}-${c2.x}-${c2.y}`} />
                </animateMotion>
              </circle>
              <circle r="0.7" fill={pipeColor} opacity="0.5">
                <animateMotion
                  dur={`${p.type === 'gas' ? 2.5 : 3.5}s`}
                  repeatCount="indefinite"
                  begin={`${PIPELINES.indexOf(p) * 0.7 + 1.2}s`}
                >
                  <mpath href={`#pipe-${c1.x}-${c1.y}-${c2.x}-${c2.y}`} />
                </animateMotion>
              </circle>
            </g>
          );
        })}

        {/* ── Zone blocks ── */}
        {Object.entries(ZONE_LAYOUT).map(([key, layout]) => {
          const z = getZoneState(key);
          if (!z) return null;
          const fill = riskFill(z.mismatchScore);
          const isCrit = z.mismatchScore >= 60;
          const isElev = z.mismatchScore >= 30;
          const glowFilter = isCrit ? 'url(#glow-red)' : isElev ? 'url(#glow-amber)' : 'url(#glow-green)';
          const isHovered = hoveredZone === key;
          const hasConflict = z.permitConflicts?.length > 0;
          const hasPermit = z.activePermits?.length > 0;

          const cx = layout.x + layout.w / 2;
          const cy = layout.y + layout.h / 2;

          return (
            <g
              key={key}
              style={{ cursor: 'pointer' }}
              onClick={() => onZoneClick && onZoneClick(z)}
              onMouseEnter={() => setHoveredZone(key)}
              onMouseLeave={() => setHoveredZone(null)}
            >
              {/* Outer pulse ring for critical zones */}
              {isCrit && (
                <rect
                  x={layout.x - 2.5} y={layout.y - 2.5}
                  width={layout.w + 5} height={layout.h + 5}
                  rx="3.5" fill="none"
                  stroke={fill} strokeWidth="0.6"
                >
                  <animate attributeName="opacity" values="0.1;0.6;0.1" dur="1.5s" repeatCount="indefinite" />
                  <animate attributeName="stroke-width" values="0.4;1;0.4" dur="1.5s" repeatCount="indefinite" />
                </rect>
              )}

              {/* Hover ring */}
              {isHovered && (
                <rect
                  x={layout.x - 1.5} y={layout.y - 1.5}
                  width={layout.w + 3} height={layout.h + 3}
                  rx="3" fill="none"
                  stroke="rgba(255,255,255,0.3)" strokeWidth="0.5"
                />
              )}

              {/* Zone background */}
              <rect
                x={layout.x} y={layout.y}
                width={layout.w} height={layout.h}
                fill={fill}
                opacity={0.07 + (z.mismatchScore / 100) * 0.25}
                rx="2.5"
              />

              {/* Zone border */}
              <rect
                x={layout.x} y={layout.y}
                width={layout.w} height={layout.h}
                fill="none"
                stroke={fill}
                strokeWidth={isCrit ? "0.9" : isHovered ? "0.7" : "0.5"}
                rx="2.5"
                filter={isCrit || isHovered ? glowFilter : undefined}
                opacity={isCrit ? 0.9 : 0.6}
              />

              {/* Zone label lines */}
              {layout.label.map((line, i) => (
                <text
                  key={i}
                  x={cx}
                  y={layout.y + 5 + i * 4.8}
                  textAnchor="middle"
                  fontSize="2.6"
                  fill="rgba(232,244,248,0.85)"
                  fontFamily="monospace"
                  fontWeight="700"
                  letterSpacing="0.5"
                >
                  {line}
                </text>
              ))}

              {/* Risk % bar */}
              <rect
                x={layout.x + 2} y={layout.y + layout.h - 5.5}
                width={layout.w - 4} height="1.5"
                fill="rgba(255,255,255,0.06)" rx="0.75"
              />
              <rect
                x={layout.x + 2} y={layout.y + layout.h - 5.5}
                width={(layout.w - 4) * z.sensor.riskLevel}
                height="1.5"
                fill={fill} rx="0.75"
                opacity="0.8"
              >
                {isCrit && <animate attributeName="opacity" values="0.6;1;0.6" dur="1s" repeatCount="indefinite" />}
              </rect>

              {/* Mismatch score */}
              <text
                x={cx}
                y={layout.y + layout.h - 2}
                textAnchor="middle"
                fontSize="3.5"
                fill={fill}
                fontFamily="monospace"
                fontWeight="700"
                filter={isCrit ? glowFilter : undefined}
              >
                {z.mismatchScore > 0 ? `MISMATCH ${z.mismatchScore}` : `RISK ${(z.sensor.riskLevel * 100).toFixed(0)}%`}
              </text>

              {/* Active permit indicator */}
              {hasPermit && (
                <g>
                  <circle cx={layout.x + 2.5} cy={layout.y + 2.5} r="2" fill="rgba(0,200,255,0.15)" stroke="rgba(0,200,255,0.5)" strokeWidth="0.3" />
                  <text x={layout.x + 2.5} y={layout.y + 3.2} textAnchor="middle" fontSize="2" fill="rgba(0,200,255,0.9)" fontFamily="monospace">P</text>
                </g>
              )}

              {/* Permit conflict indicator */}
              {hasConflict && (
                <g>
                  <circle cx={layout.x + layout.w - 2.5} cy={layout.y + 2.5} r="2" fill="rgba(255,170,0,0.2)" stroke={fill} strokeWidth="0.3">
                    <animate attributeName="opacity" values="0.6;1;0.6" dur="1s" repeatCount="indefinite" />
                  </circle>
                  <text x={layout.x + layout.w - 2.5} y={layout.y + 3.2} textAnchor="middle" fontSize="2.2" fill={fill} fontFamily="monospace">!</text>
                </g>
              )}

              {/* Critical pulse dot */}
              {isCrit && (
                <circle cx={layout.x + layout.w / 2} cy={layout.y + 2.5} r="1.2" fill={fill}>
                  <animate attributeName="r" values="1.2;2;1.2" dur="0.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="1;0.2;1" dur="0.8s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Hover tooltip */}
              {isHovered && (
                <g>
                  <rect
                    x={cx - 14} y={layout.y - 9}
                    width="28" height="7.5"
                    fill="#071525" stroke={fill} strokeWidth="0.3" rx="1.5" opacity="0.95"
                  />
                  <text x={cx} y={layout.y - 5.5} textAnchor="middle" fontSize="2" fill={fill} fontFamily="monospace" fontWeight="600">
                    {`Gas: ${z.sensor.gasPpm}ppm  Temp: ${z.sensor.tempC}°C`}
                  </text>
                  <text x={cx} y={layout.y - 2.8} textAnchor="middle" fontSize="1.8" fill="rgba(232,244,248,0.6)" fontFamily="monospace">
                    Click for full details
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* ── Pipeline legend ── */}
        <g>
          <line x1="4" y1="76" x2="9" y2="76" stroke={PIPE_COLORS.gas} strokeWidth="0.5" strokeDasharray="2,1.5" opacity="0.7"/>
          <text x="10.5" y="76.7" fontSize="1.9" fill="rgba(232,244,248,0.4)" fontFamily="monospace">Gas Pipeline</text>
          <line x1="30" y1="76" x2="35" y2="76" stroke={PIPE_COLORS.metal} strokeWidth="0.5" opacity="0.7"/>
          <text x="36.5" y="76.7" fontSize="1.9" fill="rgba(232,244,248,0.4)" fontFamily="monospace">Metal Flow</text>
          <line x1="55" y1="76" x2="60" y2="76" stroke={PIPE_COLORS.feed} strokeWidth="0.5" opacity="0.7"/>
          <text x="61.5" y="76.7" fontSize="1.9" fill="rgba(232,244,248,0.4)" fontFamily="monospace">Feed Line</text>
          <circle cx="80" cy="76" r="1" fill="rgba(0,200,255,0.8)"/>
          <text x="82" y="76.7" fontSize="1.9" fill="rgba(232,244,248,0.4)" fontFamily="monospace">P=Permit</text>
          <circle cx="90" cy="76" r="1" fill={PIPE_COLORS.gas} opacity="0.9"/>
          <text x="92" y="76.7" fontSize="1.9" fill="rgba(232,244,248,0.4)" fontFamily="monospace">!=Conflict</text>
        </g>

        {/* North indicator */}
        <text x="97" y="5" textAnchor="middle" fontSize="2.8" fill="rgba(0,255,180,0.3)" fontFamily="monospace" fontWeight="700">N</text>
        <line x1="97" y1="5.5" x2="97" y2="9" stroke="rgba(0,255,180,0.3)" strokeWidth="0.4"/>
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