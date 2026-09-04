// backend/routes/teamRoutes.js
const express  = require('express');
const User     = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const { hashPassword, generateTempPassword } = require('../utils/password');
const { sendMail } = require('../mailer');

const router = express.Router();

// GET /api/team — teammates in MY organization only. Strict isolation: every
// query here is scoped to req.user.companyId, so members can never see or
// contact anyone outside their own org.
router.get('/', requireAuth, async (req, res) => {
  try {
    const members = await User.find({ companyId: req.user.companyId })
      .select('name email role status avatar createdAt')
      .sort({ createdAt: -1 })
      .lean();
    res.json(members);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch team' });
  }
});

// POST /api/team/members — admin adds a member; login credentials are emailed
// to them directly. Member "accepts" by logging in with those credentials
// (see POST /api/auth/login), which flips status pending -> active and emails
// this admin (and any co-admins) a confirmation.
router.post('/members', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, email, role = 'operator' } = req.body;
    if (!name || !email) return res.status(400).json({ message: 'name and email required' });
    if (!['admin', 'safety_officer', 'operator'].includes(role))
      return res.status(400).json({ message: 'Invalid role' });

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) return res.status(400).json({ message: 'This email is already registered' });

    const tempPassword = generateTempPassword();
    const member = await User.create({
      name: name.trim(), email: normalizedEmail,
      password: hashPassword(tempPassword),
      role, status: 'pending',
      companyId: req.user.companyId,
      invitedBy: req.user.email,
    });

    await AuditLog.create({
      companyId: req.user.companyId, actorEmail: req.user.email, actorRole: req.user.role,
      action: 'TEAM_MEMBER_INVITED', targetEmail: normalizedEmail, details: { role },
    });

    const loginUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    await sendMail({
      to: normalizedEmail,
      subject: `You're invited to join ShiftZero`,
      html: `
        <div style="font-family:monospace;background:#020b14;color:#00ffb4;padding:24px;border-radius:8px">
          <h2 style="color:#00ffb4">Welcome to ShiftZero</h2>
          <p>${req.user.name} has added you as <b>${role}</b> on ShiftZero.</p>
          <p><b>Login email:</b> ${normalizedEmail}<br/><b>Temporary password:</b> ${tempPassword}</p>
          <p><a href="${loginUrl}" style="color:#66ccff">Log in here</a> using "Login with email" to accept
          the invite — you'll land straight in your team's isolated workspace.</p>
        </div>
      `,
    });

    res.json({ id: member._id, name: member.name, email: member.email, role: member.role, status: member.status });
  } catch (err) {
    console.error('Add team member error:', err);
    res.status(500).json({ message: 'Failed to add team member' });
  }
});

// PATCH /api/team/members/:id/remove — admin removes a member; blocked across orgs.
router.patch('/members/:id/remove', requireAuth, requireAdmin, async (req, res) => {
  try {
    const target = await User.findById(req.params.id).lean();
    if (!target) return res.status(404).json({ message: 'Member not found' });
    if (String(target.companyId) !== String(req.user.companyId))
      return res.status(403).json({ message: 'Cannot remove a member from another organization' });

    await User.deleteOne({ _id: req.params.id });
    await AuditLog.create({
      companyId: req.user.companyId, actorEmail: req.user.email, actorRole: req.user.role,
      action: 'TEAM_MEMBER_REMOVED', targetEmail: target.email, details: {},
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to remove member' });
  }
});

module.exports = router;
