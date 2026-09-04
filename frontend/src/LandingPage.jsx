// frontend/src/LandingPage.jsx
import { useEffect, useRef, useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import './LandingPage.css';

const FEATURES = [
  {
    icon: '🛰️',
    title: 'Live Sensor Monitoring',
    desc: 'Every zone streams gas, temperature and pressure readings in real time, so you see plant conditions the moment they change — not at the next round.',
  },
  {
    icon: '🧠',
    title: 'Verbal–Sensor Mismatch AI',
    desc: 'Our NLP engine compares what shift handover notes say against what the sensors actually recorded, and flags the gap before it becomes an incident.',
  },
  {
    icon: '📋',
    title: 'Digital Work Permits',
    desc: 'Issue, track and close hot-work, confined-space, electrical and height-work permits — with automatic conflict detection across overlapping zones.',
  },
  {
    icon: '🔔',
    title: 'Smart Alerts & Recommendations',
    desc: 'When risk crosses a threshold, the system doesn\u2019t just alert — it recommends the action, pulled from a corpus of real past incidents.',
  },
  {
    icon: '🔄',
    title: 'Shift Handover Logs',
    desc: 'Structured, timestamped handovers replace the sticky-note-and-memory approach, so nothing gets lost between outgoing and incoming crews.',
  },
  {
    icon: '🗺️',
    title: 'Plant Geospatial View',
    desc: 'A live map of every zone, colour-coded by risk, so supervisors can see the whole plant\u2019s safety posture at a glance.',
  },
];

const STEPS = [
  { n: '01', title: 'Sensors + shift notes come in', desc: 'Field sensors and handover notes both feed into Shift Zero continuously, in parallel.' },
  { n: '02', title: 'AI scores the risk', desc: 'The NLP risk engine cross-checks language against live readings to catch mismatches humans miss.' },
  { n: '03', title: 'You get an alert + a fix', desc: 'Flagged zones surface instantly with a concrete, incident-backed recommendation — not just a warning.' },
  { n: '04', title: 'Permits & handovers stay in sync', desc: 'Every action is logged, permits auto-check for conflicts, and the next shift starts with full context.' },
];

// Hoisted OUTSIDE LandingPage on purpose: this used to be defined inside the
// component body, which meant React saw a brand-new component type on every
// re-render (e.g. every keystroke) and remounted the whole auth card each
// time — which is why the email/password inputs lost focus after one
// character. A top-level component with stable props fixes that.
function AuthActions({
  loading, handleLogin, inviteToken,
  authMode, setAuthMode,
  form, setForm,
  formLoading, formError, setFormError,
  handleRegisterOrg, handleEmailLogin,
  demoLoading, handleDemoLogin,
  error,
}) {
  return (
    <>
      <button className="lp-btn lp-btn-primary" onClick={handleLogin} disabled={loading}>
        {loading ? (
          <><span className="lp-spinner" /> Authenticating…</>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </>
        )}
      </button>

      <div className="lp-auth-toggle">
        {!inviteToken && (
          <button className={authMode === 'register' ? 'active' : ''}
            onClick={() => { setAuthMode(authMode === 'register' ? null : 'register'); setFormError(''); }}>
            Register your organization
          </button>
        )}
        <button className={authMode === 'login' ? 'active' : ''}
          onClick={() => { setAuthMode(authMode === 'login' ? null : 'login'); setFormError(''); }}>
          Login with email
        </button>
      </div>

      {authMode && (
        <div className="lp-auth-card">
          {authMode === 'register' && (
            <>
              <input className="lp-input" placeholder="Organization name" value={form.orgName} onChange={e => setForm(f => ({ ...f, orgName: e.target.value }))} />
              <input className="lp-input" placeholder="Your full name" value={form.adminName} onChange={e => setForm(f => ({ ...f, adminName: e.target.value }))} />
            </>
          )}
          <input className="lp-input" placeholder="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <input className="lp-input" placeholder="Password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          <button className="lp-auth-submit" onClick={authMode === 'register' ? handleRegisterOrg : handleEmailLogin} disabled={formLoading}>
            {formLoading ? '…' : authMode === 'register' ? 'CREATE ORGANIZATION' : 'LOGIN'}
          </button>
          {authMode === 'login' && (
            <p className="lp-auth-note">Invited team member? Use the email &amp; temporary password sent to you.</p>
          )}
          {formError && <p className="lp-auth-note" style={{ color: 'var(--red)' }}>{formError}</p>}
        </div>
      )}

      {!inviteToken && (
        <>
          <div className="lp-divider">
            <div className="line" /><span>OR</span><div className="line" />
          </div>
          <button className="lp-btn lp-btn-demo" onClick={handleDemoLogin} disabled={demoLoading}>
            {demoLoading ? (<><span className="lp-spinner" /> Loading demo…</>) : (<>⚡ Explore Live Demo — No Sign-in Required</>)}
          </button>
          <p className="lp-hint" style={{ maxWidth: 300 }}>
            Instant access to a sandboxed demo org — full dashboard, alerts, permits &amp; admin panel.
          </p>
        </>
      )}

      {error && <p className="lp-error">{error}</p>}
      <p className="lp-footnote">
        {inviteToken ? 'YOU HAVE BEEN INVITED — SIGN IN TO CONTINUE' : 'AUTHORIZED PERSONNEL ONLY'}
      </p>
    </>
  );
}

export default function LandingPage({ onLogin }) {
  const canvasRef = useRef(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [accessDenied, setAccessDenied] = useState(false);
  const [deniedMessage, setDeniedMessage] = useState('');
  const [demoLoading, setDemoLoading]   = useState(false);
  const [authMode, setAuthMode]         = useState(null); // null | 'login' | 'register'
  const [form, setForm] = useState({ orgName: '', adminName: '', email: '', password: '' });
  const [formLoading, setFormLoading]   = useState(false);
  const [formError, setFormError]       = useState('');

  // Read invite token from URL (e.g. ?invite=abc123)
  const inviteToken = new URLSearchParams(window.location.search).get('invite');

  // ── Particle system (hero background) ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let W = canvas.width = window.innerWidth;
    let H = canvas.height = canvas.parentElement.offsetHeight;

    const particles = Array.from({ length: 90 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.8 + 0.4, alpha: Math.random() * 0.6 + 0.2,
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

    const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = canvas.parentElement.offsetHeight; };
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);

  // ── Scroll-reveal for sections ──────────────────────────────────────────
  useEffect(() => {
    const els = document.querySelectorAll('.lp-reveal');
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('in-view'); });
    }, { threshold: 0.15 });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  // ── 3D tilt effect for feature / step cards ─────────────────────────────
  const handleTilt = (e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width - 0.5;
    const relY = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `perspective(900px) rotateX(${relY * -10}deg) rotateY(${relX * 10}deg) translateY(-6px) scale(1.02)`;
  };
  const resetTilt = (e) => { e.currentTarget.style.transform = ''; };

  const scrollToId = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: tokenResponse.access_token,
            inviteToken: inviteToken || undefined,
          }),
        });

        // Sirf ek baar parse karo, phir 'data' use karo everywhere
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          // ✅ 'data' use karo, errData nahi
          if (data.code === 'NO_INVITE' || data.code === 'INVALID_INVITE' ||
              data.code === 'INVITE_EXPIRED' || data.code === 'INVITE_USED') {
            setAccessDenied(true);
            setDeniedMessage(data.message || 'Access restricted.');
            return;
          }
          throw new Error(data.message || 'Login failed on server');
        }

        // Clean URL (remove ?invite= param after successful use)
        if (inviteToken) {
          window.history.replaceState({}, '', window.location.pathname);
        }

        localStorage.setItem('authToken', data.token);
        onLogin(data.user);
      } catch (err) {
        setError(err.message || 'Something went wrong. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      setError('Google sign-in was cancelled or failed.');
      setLoading(false);
    },
  });

  const handleLogin = () => { setError(''); googleLogin(); };

  // ── Org registration (admin creates a brand-new isolated organization) ────
  const handleRegisterOrg = async () => {
    setFormError(''); setFormLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/auth/register-org`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgName: form.orgName,
          adminName: form.adminName,
          adminEmail: form.email,
          password: form.password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Registration failed');
      localStorage.setItem('authToken', data.token);
      onLogin(data.user);
    } catch (err) {
      setFormError(err.message || 'Something went wrong.');
    } finally {
      setFormLoading(false);
    }
  };

  // ── Email/password login (used by invited team members with emailed credentials) ──
  const handleEmailLogin = async () => {
    setFormError(''); setFormLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Login failed');
      localStorage.setItem('authToken', data.token);
      onLogin(data.user);
    } catch (err) {
      setFormError(err.message || 'Something went wrong.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError('');
    setDemoLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/auth/demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not start demo session');

      localStorage.setItem('authToken', data.token);
      onLogin(data.user);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setDemoLoading(false);
    }
  };

  // ── Access Denied Screen ──────────────────────────────────────────────────
  if (accessDenied) return (
    <div className="lp-denied">
      <div className="lp-denied-card">
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <div style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 14, letterSpacing: 0.5, marginBottom: 12 }}>ACCESS RESTRICTED</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>{deniedMessage}</div>
        <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          Contact your shift supervisor or admin for an invite link.
        </div>
        <button onClick={() => setAccessDenied(false)} style={{ marginTop: 20, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '8px 20px', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer' }}>
          ← Try different account
        </button>
      </div>
    </div>
  );

  // ── Main Landing ──────────────────────────────────────────────────────────
  return (
    <div className="lp">
      <div className="lp-grid" />
      <div className="lp-glow" />

      {/* Nav */}
      <nav className="lp-nav">
        <div className="lp-brand">
          <img src="/logo.png" alt="Shift Zero logo" />
          <span>SHIFT ZERO</span>
          <span className="dot" />
        </div>
        <button className="lp-nav-cta" onClick={() => scrollToId('lp-access')}>Sign in</button>
      </nav>

      {/* Hero */}
      <header className="lp-hero" style={{ position: 'relative' }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, zIndex: -1, opacity: 0.8 }} />

        <div className="lp-hero-grid">
          <div className="lp-hero-left">
            {inviteToken && (
              <div className="lp-invite">✓ INVITE LINK DETECTED — Sign in to join your team</div>
            )}

            <div className="lp-badge">⬡ AI-POWERED INDUSTRIAL SAFETY INTELLIGENCE</div>

            <h1 className="lp-title">
              Catch the gap between <span className="accent">what's said</span> and what the sensors know.
            </h1>

            <p className="lp-sub">
              Shift Zero is a real-time industrial safety platform for plants and refineries. It listens to
              your shift handovers, watches your live sensor feeds, and uses AI to flag the moment the two
              stop matching — before that mismatch becomes an incident.
            </p>
          </div>

          <div className="lp-hero-right">
            <div className="lp-mock-window">
              <div className="lp-mock-titlebar">
                <span className="lp-mock-dot lp-mock-dot-red" />
                <span className="lp-mock-dot lp-mock-dot-amber" />
                <span className="lp-mock-dot lp-mock-dot-green" />
                <span className="lp-mock-titletext">shift zero — live operations</span>
              </div>
              <div className="lp-mock-body">
                <div className="lp-mock-toprow">
                  <span className="lp-mock-chip">⬡ 4 zones monitored</span>
                  <span className="lp-mock-live"><span className="lp-mock-livedot" /> LIVE</span>
                </div>
                {[
                  { name: 'CokeOvenBattery-3', status: 'MONITORING', risk: 38, tone: 'amber' },
                  { name: 'BlastFurnace-1', status: 'CRITICAL', risk: 82, tone: 'red' },
                  { name: 'RollingMill-2', status: 'STABLE', risk: 12, tone: 'green' },
                ].map(z => (
                  <div className={`lp-mock-zone lp-mock-zone-${z.tone}`} key={z.name}>
                    <div className="lp-mock-zone-top">
                      <span className={`lp-mock-zone-dot lp-mock-zone-dot-${z.tone}`} />
                      <span className="lp-mock-zone-name">{z.name}</span>
                      <span className={`lp-mock-zone-status lp-mock-zone-status-${z.tone}`}>{z.status}</span>
                    </div>
                    <div className="lp-mock-zone-track">
                      <div className={`lp-mock-zone-fill lp-mock-zone-fill-${z.tone}`} style={{ width: `${z.risk}%` }} />
                    </div>
                  </div>
                ))}
                <div className="lp-mock-footer">
                  <span>1 mismatch flagged</span>
                  <span>·</span>
                  <span>updated 2s ago</span>
                </div>
              </div>
            </div>
            <div className="lp-hero-glow-orb" />

            <div className="lp-actions" id="lp-access">
              <AuthActions
                loading={loading} handleLogin={handleLogin}
                inviteToken={inviteToken}
                authMode={authMode} setAuthMode={setAuthMode}
                form={form} setForm={setForm}
                formLoading={formLoading} formError={formError} setFormError={setFormError}
                handleRegisterOrg={handleRegisterOrg} handleEmailLogin={handleEmailLogin}
                demoLoading={demoLoading} handleDemoLogin={handleDemoLogin}
                error={error}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="lp-stats lp-reveal">
        {[
          { val: '6,500+', label: 'Fatal accidents/yr (DGFASLI)' },
          { val: '< 10 min', label: 'Alert-to-action target' },
          { val: '4 Zones', label: 'Live plant coverage' },
          { val: 'Real-time', label: 'Sensor + NLP fusion' },
        ].map(s => (
          <div className="lp-stat" key={s.label} onMouseMove={handleTilt} onMouseLeave={resetTilt}>
            <div className="lp-stat-val">{s.val}</div>
            <div className="lp-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Problem */}
      <section className="lp-section lp-reveal">
        <div className="lp-section-head">
          <span className="lp-eyebrow">The problem</span>
          <h2 className="lp-section-title">Handover notes and sensors don't always agree</h2>
          <p className="lp-section-desc">
            A note can say "zone stable" while a gas reading is already trending toward danger. That
            small gap between the spoken word and the live data is where most preventable incidents begin.
          </p>
        </div>
        <blockquote className="lp-problem-quote">
          "Everything was normal at handover" is the line investigators hear after almost every incident —
          and it's rarely a lie. It's usually just a note that was never checked against the sensors.
        </blockquote>
      </section>

      {/* Product preview */}
      <section className="lp-section lp-reveal">
        <div className="lp-preview-grid">
          <div className="lp-preview-visual" onMouseMove={handleTilt} onMouseLeave={resetTilt}>
            <div className="lp-mock-window lp-mock-window-lg">
              <div className="lp-mock-titlebar">
                <span className="lp-mock-dot lp-mock-dot-red" />
                <span className="lp-mock-dot lp-mock-dot-amber" />
                <span className="lp-mock-dot lp-mock-dot-green" />
                <span className="lp-mock-titletext">shift zero — plant health</span>
              </div>
              <div className="lp-mock-body lp-mock-body-split">
                <div className="lp-health-ring-wrap">
                  <svg width="120" height="120" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(0,255,180,0.08)" strokeWidth="10" />
                    <circle cx="60" cy="60" r="52" fill="none" stroke="var(--green)" strokeWidth="10"
                      strokeDasharray={`${2 * Math.PI * 52 * 0.86} ${2 * Math.PI * 52}`}
                      strokeLinecap="round" transform="rotate(-90 60 60)"
                      style={{ filter: 'drop-shadow(0 0 10px rgba(0,255,180,0.5))' }} />
                    <text x="60" y="56" textAnchor="middle" fill="var(--text-primary)" fontSize="26" fontWeight="700" fontFamily="var(--font-mono)">86</text>
                    <text x="60" y="76" textAnchor="middle" fill="var(--green)" fontSize="11" fontFamily="var(--font-mono)" letterSpacing="1">A-</text>
                  </svg>
                  <div className="lp-health-label">PLANT HEALTH SCORE</div>
                </div>
                <div className="lp-health-bars">
                  {[
                    { l: 'Sensor Accuracy', v: 94 },
                    { l: 'Handover Match', v: 78 },
                    { l: 'Permit Compliance', v: 91 },
                  ].map(b => (
                    <div className="lp-health-bar-row" key={b.l}>
                      <div className="lp-health-bar-top"><span>{b.l}</span><span>{b.v}%</span></div>
                      <div className="lp-health-bar-track"><div className="lp-health-bar-fill" style={{ width: `${b.v}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="lp-preview-text">
            <span className="lp-eyebrow">See it before it happens</span>
            <h2 className="lp-section-title" style={{ textAlign: 'left' }}>Every zone, scored and explained in real time</h2>
            <p className="lp-section-desc" style={{ textAlign: 'left' }}>
              Shift Zero rolls up sensor accuracy, handover-to-sensor match rate and permit compliance
              into one live score per zone — so a supervisor can see the plant's real risk posture
              at a glance, not after the incident report is filed.
            </p>
            <ul className="lp-preview-list">
              <li>🟢 Live risk arcs per zone, updated on every sensor tick</li>
              <li>🟡 Verbal–sensor mismatches flagged the moment they diverge</li>
              <li>🔴 Predictive "time to critical" so alerts arrive with a runway</li>
            </ul>
          </div>
        </div>
      </section>

      {/* What it does */}
      <section className="lp-section lp-reveal" id="lp-features">
        <div className="lp-section-head">
          <span className="lp-eyebrow">What it does</span>
          <h2 className="lp-section-title">One platform for the whole shift</h2>
          <p className="lp-section-desc">
            From live sensors to digital permits, Shift Zero brings every piece of plant-floor safety
            data into a single, always-on view.
          </p>
        </div>
        <div className="lp-features">
          {FEATURES.map(f => (
            <div className="lp-feature" key={f.title} onMouseMove={handleTilt} onMouseLeave={resetTilt}>
              <span className="lp-feature-icon-box"><span className="lp-feature-icon">{f.icon}</span></span>
              <h4>{f.title}</h4>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="lp-section lp-reveal" id="lp-how">
        <div className="lp-section-head">
          <span className="lp-eyebrow">How it works</span>
          <h2 className="lp-section-title">From raw signal to safe decision, in four steps</h2>
          <p className="lp-section-desc">
            No new hardware to install — Shift Zero sits on top of the sensors and reporting you already have.
          </p>
        </div>
        <div className="lp-flow">
          {STEPS.map(s => (
            <div className="lp-flow-step" key={s.n} onMouseMove={handleTilt} onMouseLeave={resetTilt}>
              <div className="lp-flow-num">{s.n}</div>
              <h4>{s.title}</h4>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Compliance */}
      <section className="lp-section lp-reveal" id="lp-compliance">
        <div className="lp-section-head">
          <span className="lp-eyebrow">Built for compliance</span>
          <h2 className="lp-section-title">Aligned with the standards you're already audited on</h2>
          <p className="lp-section-desc">
            Permit workflows, zone monitoring and handover logs are structured around the frameworks
            Indian industrial sites already report against.
          </p>
        </div>
        <div className="lp-compliance">
          {['OISD-116', 'DGFASLI', 'Factory Act, 1948'].map(c => (
            <span className="lp-chip" key={c} onMouseMove={handleTilt} onMouseLeave={resetTilt}>{c}</span>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="lp-section lp-cta-section lp-reveal">
        <div className="lp-section-head">
          <span className="lp-eyebrow">Get started</span>
          <h2 className="lp-section-title">See your plant's real risk, right now</h2>
          <p className="lp-section-desc">
            Explore a full sandboxed demo — dashboard, alerts, permits and the admin panel — with no sign-up required.
          </p>
        </div>
        <div className="lp-actions">
          <button className="lp-btn lp-btn-demo" onClick={handleDemoLogin} disabled={demoLoading}>
            {demoLoading ? (<><span className="lp-spinner" /> Loading demo…</>) : (<>⚡ Explore Live Demo</>)}
          </button>
          <button className="lp-nav-cta" style={{ width: '100%' }} onClick={() => scrollToId('lp-access')}>
            Or sign in to your organization ↑
          </button>
        </div>
      </section>

      <footer className="lp-footer">
        <strong>Shift Zero</strong> — AI-powered industrial safety intelligence. Built for OISD, DGFASLI &amp; Factory Act compliance.
      </footer>
    </div>
  );
}
