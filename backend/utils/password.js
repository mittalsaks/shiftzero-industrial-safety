// backend/utils/password.js
// Native crypto (scrypt) so we don't need to add bcrypt as a dependency.
const crypto = require('crypto');

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(plain, stored) {
  if (!stored || !plain) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(plain, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(check, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Human-typeable temp password for invited members, e.g. "kx82Nq4T#1"
function generateTempPassword() {
  const raw = crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
  return raw.slice(0, 10) + '#1';
}

module.exports = { hashPassword, verifyPassword, generateTempPassword };
