
const nodemailer = require("nodemailer");
const line = require("@line/bot-sdk");

function buildTransporter(){
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

async function sendEmail(subject, html){
  const transporter = buildTransporter();
  if (!transporter) return;
  const to = process.env.NOTIFY_EMAIL_TO;
  if (!to) return;
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject,
    html
  });
}

async function sendLinePush(client, text){
  const groupId = process.env.ADMIN_GROUP_ID;
  const userId  = process.env.ADMIN_USER_ID;
  const msg = { type: "text", text };
  if (groupId) return client.pushMessage(groupId, msg);
  if (userId)  return client.pushMessage(userId, msg);
}

module.exports = { sendEmail, sendLinePush };
