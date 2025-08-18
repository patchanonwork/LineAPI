const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const { Client } = require('@line/bot-sdk');

dotenv.config();

// Instantiate LINE client
const lineClient = new Client({
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

async function sendEmail(subject, text) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.NOTIFY_EMAIL_TO;
  if (!host || !port || !user || !pass || !to) {
    console.warn('Missing SMTP configuration; skipping sendEmail');
    return;
  }
  const transporter = nodemailer.createTransport({
    host: host,
    port: parseInt(port, 10),
    secure: parseInt(port, 10) === 465,
    auth: {
      user: user,
      pass: pass
    }
  });
  try {
    const info = await transporter.sendMail({
      from: `"Line Gatekeeper" <${user}>`,
      to: to,
      subject: subject,
      text: text
    });
    console.log('Email sent:', info.messageId);
  } catch (err) {
    console.error('Failed to send email:', err);
  }
}

async function sendLinePush(text) {
  const to = process.env.ADMIN_GROUP_ID || process.env.ADMIN_USER_ID;
  if (!to) {
    console.warn('No ADMIN_GROUP_ID or ADMIN_USER_ID configured; skipping sendLinePush');
    return;
  }
  try {
    await lineClient.pushMessage(to, { type: 'text', text });
  } catch (err) {
    console.error('Failed to send LINE push notification:', err);
  }
}

module.exports = {
  sendEmail,
  sendLinePush
};
