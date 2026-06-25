const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// POST /api/auth/google
// Frontend se access_token aata hai (Google se mila hua)
router.post('/google', async (req, res) => {
  try {
    const { access_token } = req.body;
    if (!access_token) {
      return res.status(400).json({ message: 'Missing access_token' });
    }

    // Google se direct verify karo ki token real hai
    const googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!googleRes.ok) {
      return res.status(401).json({ message: 'Invalid Google token' });
    }

    const profile = await googleRes.json();

    if (!profile.email_verified) {
      return res.status(401).json({ message: 'Google email not verified' });
    }

    // OPTIONAL: sirf company domain allow karna ho to uncomment karo
    // if (!profile.email.endsWith('@vizagsteel.in')) {
    //   return res.status(403).json({ message: 'Only vizagsteel.in accounts allowed' });
    // }

    let user = await User.findOne({ email: profile.email });
    if (!user) {
      user = await User.create({
        name: profile.name,
        email: profile.email,
        avatar: profile.picture,
        googleId: profile.sub,
      });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ message: 'Server error during Google authentication' });
  }
});

module.exports = router;