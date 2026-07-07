// backend/routes/authRoutes.js
const express  = require('express');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const User     = require('../models/User');
const Invite   = require('../models/Invite');
const Company  = require('../models/Company');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

// ── Helper: derive a company display name from email domain ──────────────────
function companyNameFromEmail(email) {
  const domain = email.split('@')[1] || 'unknown';
  if (domain === 'gmail.com' || domain === 'yahoo.com' || domain === 'hotmail.com' || domain === 'outlook.com') {
    // Personal email — use username as company slug
    const username = email.split('@')[0];
    return { name: username.charAt(0).toUpperCase() + username.slice(1) + ' Team', domain: `personal:${email}` };
  }
  // Work email — use domain as company
  const companySlug = domain.split('.')[0];
  const displayName = companySlug.charAt(0).toUpperCase() + companySlug.slice(1);
  return { name: displayName, domain };
}

// ── POST /api/auth/google ─────────────────────────────────────────────────────
router.post('/google', async (req, res) => {
  try {
    const { access_token, inviteToken } = req.body;
    if (!access_token)
      return res.status(400).json({ message: 'Missing access_token' });

    // Verify with Google
    const googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!googleRes.ok)
      return res.status(401).json({ message: 'Invalid Google token' });

    const profile = await googleRes.json();
    if (!profile.email_verified)
      return res.status(401).json({ message: 'Google email not verified' });

    // ── Existing user — just login ───────────────────────────────────────────
    let user = await User.findOne({ email: profile.email });
    if (user) {
      const token = jwt.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
      const company = user.companyId ? await Company.findById(user.companyId).lean() : null;
      return res.json({
        token,
        user: {
          id: user._id, name: user.name, email: user.email,
          avatar: user.avatar, role: user.role,
          companyId: user.companyId, companyName: company?.name || null,
          isSuperAdmin: user.role === 'super_admin',
        },
      });
    }

    // ── New user ─────────────────────────────────────────────────────────────
    const isVeryFirstUser = (await User.countDocuments()) === 0;

    if (isVeryFirstUser) {
      // AUTO: First ever user = Super Admin, auto-create their company
      const { name: cName, domain: cDomain } = companyNameFromEmail(profile.email);

      let company = await Company.findOne({ domain: cDomain });
      if (!company) {
        company = await Company.create({ name: cName, domain: cDomain, createdBy: profile.email });
      }

      user = await User.create({
        name: profile.name, email: profile.email,
        avatar: profile.picture, googleId: profile.sub,
        role: 'super_admin', companyId: company._id,
      });

      await AuditLog.create({
        companyId: company._id, actorEmail: profile.email, actorRole: 'super_admin',
        action: 'SUPER_ADMIN_CREATED', details: { companyName: company.name, auto: true },
      });

      const token = jwt.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.json({
        token,
        user: {
          id: user._id, name: user.name, email: user.email,
          avatar: user.avatar, role: 'super_admin',
          companyId: company._id, companyName: company.name,
          isSuperAdmin: true,
        },
      });
    }

    // ── Not first user — must have invite ───────────────────────────────────
    if (!inviteToken)
      return res.status(403).json({
        message: 'Access restricted. Ask your admin for an invite link.',
        code: 'NO_INVITE',
      });

    const invite = await Invite.findOne({ token: inviteToken }).populate('companyId');
    if (!invite)
      return res.status(403).json({ message: 'Invalid invite link', code: 'INVALID_INVITE' });
    if (invite.usedBy)
      return res.status(403).json({ message: 'Invite already used', code: 'INVITE_USED' });
    if (new Date() > invite.expiresAt)
      return res.status(403).json({ message: 'Invite link has expired', code: 'INVITE_EXPIRED' });

    // 🔽 NEW — email lock check
    if (invite.forEmail && invite.forEmail !== profile.email.toLowerCase().trim())
      return res.status(403).json({
        message: `This invite was issued for a different email address. Please sign in with the email it was sent to.`,
        code: 'INVITE_EMAIL_MISMATCH',
      });

    user = await User.create({
      name: profile.name, email: profile.email,
      avatar: profile.picture, googleId: profile.sub,
      role: invite.role, companyId: invite.companyId._id,
    });

    invite.usedBy = profile.email;
    invite.usedAt = new Date();
    await invite.save();

    await AuditLog.create({
      companyId: invite.companyId._id, actorEmail: invite.createdBy, actorRole: 'admin',
      action: 'USER_JOINED_VIA_INVITE', targetEmail: profile.email,
      details: { role: invite.role, inviteToken },
    });

    const token = jwt.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: {
        id: user._id, name: user.name, email: user.email,
        avatar: user.avatar, role: user.role,
        companyId: invite.companyId._id, companyName: invite.companyId.name,
        isSuperAdmin: false,
      },
    });

  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ message: 'Server error during authentication' });
  }
});

// ── POST /api/auth/demo — instant guest access, no Google login / invite needed ──
// Lets anyone (e.g. an interviewer/recruiter evaluating the live demo) explore the
// full product in one click. Guests land in their own isolated "Demo Org" as an
// admin, so they can see every tab (including Admin Panel + Invites) without ever
// touching a real company's data, users, or audit trail.
router.post('/demo', async (req, res) => {
  try {
    const DEMO_DOMAIN = 'demo:shiftzero-showcase';

    let company = await Company.findOne({ domain: DEMO_DOMAIN });
    if (!company) {
      company = await Company.create({
        name: 'Demo Org (Sandbox)',
        domain: DEMO_DOMAIN,
        createdBy: 'system@shiftzero.demo',
      });
    }

    // Housekeeping: drop guest accounts older than 24h so the DB doesn't
    // accumulate throwaway users from every demo visitor.
    User.deleteMany({
      email: { $regex: /^guest-.*@demo\.shiftzero\.local$/ },
      createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }).catch(() => {});

    const suffix = crypto.randomBytes(4).toString('hex');
    const guestEmail = `guest-${suffix}@demo.shiftzero.local`;
    const guestName  = `Guest Reviewer ${suffix.slice(0, 4).toUpperCase()}`;

    const user = await User.create({
      name: guestName,
      email: guestEmail,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(guestName)}&background=00ffb4&color=041b14&bold=true`,
      role: 'admin', // full feature access, but scoped to the isolated Demo Org only
      companyId: company._id,
    });

    await AuditLog.create({
      companyId: company._id, actorEmail: guestEmail, actorRole: 'admin',
      action: 'DEMO_GUEST_LOGIN', details: { auto: true },
    });

    const token = jwt.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '12h' });
    res.json({
      token,
      user: {
        id: user._id, name: user.name, email: user.email,
        avatar: user.avatar, role: 'admin',
        companyId: company._id, companyName: company.name,
        isSuperAdmin: false, isDemo: true,
      },
    });
  } catch (err) {
    console.error('Demo login error:', err);
    res.status(500).json({ message: 'Could not start demo session' });
  }
});

// ── POST /api/auth/invite — admin generates invite ───────────────────────────
router.post('/invite', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { role = 'operator', forEmail } = req.body;
    if (!['admin', 'safety_officer', 'operator'].includes(role))
      return res.status(400).json({ message: 'Invalid role' });

    // 🔽 NEW — email lock validation
    if (!forEmail || typeof forEmail !== 'string' || !forEmail.includes('@'))
      return res.status(400).json({ message: 'A valid email is required for this invite' });

    const normalizedEmail = forEmail.toLowerCase().trim();

    // Optional: prevent inviting someone who's already a user
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser)
      return res.status(400).json({ message: 'This email is already registered' });

    // Super admin ke liye — companyId body se aa sakta hai, warna apna company
    const companyId = req.user.role === 'super_admin' && req.body.companyId
      ? req.body.companyId
      : req.user.companyId;

    if (!companyId)
      return res.status(400).json({ message: 'No company associated with this admin' });

    const token     = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24hr

    await Invite.create({ token, role, companyId, createdBy: req.user.email, forEmail: normalizedEmail, expiresAt });

    await AuditLog.create({
      companyId, actorEmail: req.user.email, actorRole: req.user.role,
      action: 'INVITE_CREATED', details: { role, forEmail: normalizedEmail, expiresAt },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.json({ inviteUrl: `${frontendUrl}?invite=${token}`, role, forEmail: normalizedEmail, expiresAt, token });

  } catch (err) {
    console.error('Invite error:', err);
    res.status(500).json({ message: 'Failed to create invite' });
  }
});

// ── GET /api/auth/invites ────────────────────────────────────────────────────
router.get('/invites', requireAuth, requireAdmin, async (req, res) => {
  try {
    const filter = req.user.role === 'super_admin'
      ? {}
      : { companyId: req.user.companyId };

    const invites = await Invite.find(filter).sort({ createdAt: -1 }).limit(50).lean();
    res.json(invites);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch invites' });
  }
});

// ── DELETE /api/auth/invites/:token ─────────────────────────────────────────
router.delete('/invites/:token', requireAuth, requireAdmin, async (req, res) => {
  try {
    await Invite.deleteOne({ token: req.params.token });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to revoke invite' });
  }
});

// ── GET /api/auth/audit — audit log (admin only) ────────────────────────────
router.get('/audit', requireAuth, requireAdmin, async (req, res) => {
  try {
    const filter = req.user.role === 'super_admin'
      ? {}
      : { companyId: req.user.companyId };

    const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch audit logs' });
  }
});

module.exports = router;