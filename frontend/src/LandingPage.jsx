import { useEffect, useRef, useState } from 'react';

export default function LandingPage({ onLogin }) {
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [glitch, setGlitch] = useState(false);

  // Particle system
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animId;
    let W = canvas.width = window.innerWidth;
    let H = canvas.height = window.innerHeight;

    const particles = Array.from({ length: 120 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.8 + 0.4,
      alpha: Math.random() * 0.6 + 0.2,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,255,180,${p.alpha})`;
        ctx.fill();
      });
      // Draw lines between close particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0,255,180,${0.12 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);

  // Glitch effect interval
  useEffect(() => {
    const t = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 150);
    }, 4000);
    return () => clearInterval(t);
  }, []);

  const handleLogin = () => {
    setLoading(true);
    setTimeout(() => onLogin({ name: 'Safety Officer', email: 'officer@vizagsteel.in', avatar: 'SO' }), 1800);
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#020b14' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />

      {/* Grid overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1,
        backgroundImage: `linear-gradient(rgba(0,255,180,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,180,0.03) 1px, transparent 1px)`,
        backgroundSize: '60px 60px'
      }} />

      {/* Radial glow center */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 600, height: 600, borderRadius: '50%', zIndex: 1,
        background: 'radial-gradient(circle, rgba(0,255,180,0.07) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      {/* Top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, padding: '20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,255,180,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00ffb4', boxShadow: '0 0 8px #00ffb4', animation: 'pulse 1.5s infinite' }} />
          <span style={{ color: '#00ffb4', fontFamily: 'monospace', fontSize: 13, letterSpacing: 3 }}>SHIFT ZERO // v2.1.0</span>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {['OISD', 'DGFASLI', 'Factory Act'].map(t => (
            <span key={t} style={{ color: 'rgba(0,255,180,0.4)', fontFamily: 'monospace', fontSize: 11, letterSpacing: 2 }}>{t}</span>
          ))}
        </div>
      </div>

      {/* Center content */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 0 }}>

        {/* Badge */}
        <div style={{ marginBottom: 28, padding: '6px 18px', border: '1px solid rgba(0,255,180,0.3)', borderRadius: 30, background: 'rgba(0,255,180,0.05)', backdropFilter: 'blur(10px)' }}>
          <span style={{ color: '#00ffb4', fontFamily: 'monospace', fontSize: 11, letterSpacing: 3 }}>â¬¡ AI-POWERED INDUSTRIAL SAFETY INTELLIGENCE</span>
        </div>

        {/* Main title */}
        <h1 style={{
          fontFamily: '"Segoe UI", system-ui, sans-serif',
          fontSize: 'clamp(52px, 8vw, 88px)',
          fontWeight: 700,
          margin: 0,
          lineHeight: 1.05,
          textAlign: 'center',
          letterSpacing: -2,
          color: glitch ? '#ff003c' : '#ffffff',
          textShadow: glitch
            ? '2px 0 #00ffb4, -2px 0 #ff003c'
            : '0 0 60px rgba(0,255,180,0.15)',
          transition: 'color 0.05s',
          filter: glitch ? 'blur(0.5px)' : 'none',
        }}>
          SHIFT<span style={{ color: '#00ffb4', textShadow: '0 0 30px rgba(0,255,180,0.6)' }}>ZERO</span>
        </h1>

        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 16, margin: '16px 0 0', fontFamily: 'monospace', letterSpacing: 2, textAlign: 'center' }}>
          VERBAL-SENSOR MISMATCH INTELLIGENCE PLATFORM
        </p>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 40, margin: '40px 0', padding: '20px 40px', border: '1px solid rgba(0,255,180,0.12)', borderRadius: 12, background: 'rgba(0,255,180,0.03)', backdropFilter: 'blur(20px)' }}>
          {[
            { val: '6,500+', label: 'Fatal accidents/yr (DGFASLI)' },
            { val: '< 10min', label: 'Alert-to-action target' },
            { val: '4 Zones', label: 'Live plant coverage' },
            { val: 'Real-time', label: 'Sensor + NLP fusion' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ color: '#00ffb4', fontSize: 22, fontWeight: 700, fontFamily: 'monospace' }}>{s.val}</div>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 4, letterSpacing: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Google login button */}
        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 32px', borderRadius: 10,
            background: loading ? 'rgba(0,255,180,0.08)' : 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(0,255,180,0.35)',
            color: '#fff', fontSize: 15, fontWeight: 500,
            cursor: loading ? 'wait' : 'pointer',
            backdropFilter: 'blur(20px)',
            transition: 'all 0.2s',
            boxShadow: '0 0 30px rgba(0,255,180,0.08)',
            minWidth: 260, justifyContent: 'center',
          }}
          onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = 'rgba(0,255,180,0.1)'; e.currentTarget.style.boxShadow = '0 0 40px rgba(0,255,180,0.2)'; }}}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.boxShadow = '0 0 30px rgba(0,255,180,0.08)'; }}
        >
          {loading ? (
            <>
              <div style={{ width: 18, height: 18, border: '2px solid rgba(0,255,180,0.3)', borderTop: '2px solid #00ffb4', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontFamily: 'monospace', letterSpacing: 1 }}>AUTHENTICATING...</span>
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, marginTop: 16, fontFamily: 'monospace', letterSpacing: 1 }}>
          AUTHORIZED PERSONNEL ONLY â€” VIZAG STEEL PLANT SAFETY OPS
        </p>
      </div>

      {/* Bottom ticker */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10, borderTop: '1px solid rgba(0,255,180,0.08)', padding: '10px 0', overflow: 'hidden', background: 'rgba(2,11,20,0.8)' }}>
        <div style={{ display: 'flex', gap: 60, animation: 'ticker 20s linear infinite', whiteSpace: 'nowrap', width: 'max-content' }}>
          {['ðŸŸ¢ CokeOvenBattery-3: MONITORING', 'ðŸŸ¡ BlastFurnace-1: NORMAL', 'ðŸŸ¢ RollingMill-2: STABLE', 'ðŸŸ¢ GasStorage-Yard: NORMAL', 'âš¡ AI Engine: ACTIVE', 'ðŸ“¡ Sensor Feed: LIVE', 'ðŸ›¡ OISD-116 Compliant'].map((t, i) => (
            <span key={i} style={{ color: 'rgba(0,255,180,0.5)', fontFamily: 'monospace', fontSize: 11, letterSpacing: 2 }}>{t}</span>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.4)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes ticker { from{transform:translateX(0)} to{transform:translateX(-50%)} }
      `}</style>
    </div>
  );
}