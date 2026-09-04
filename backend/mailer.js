// backend/mailer.js
const nodemailer = require('nodemailer');

const transport = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

async function sendMail(opts) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`✉️  (email disabled — no EMAIL_USER/EMAIL_PASS) would send "${opts.subject}" to ${opts.to}`);
    return;
  }
  try {
    await transport.sendMail({ from: `"ShiftZero" <${process.env.EMAIL_USER}>`, ...opts });
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
}

module.exports = { sendMail };
