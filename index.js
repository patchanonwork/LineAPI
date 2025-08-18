const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, validateSignature } = require('@line/bot-sdk');
const dotenv = require('dotenv');

// Load environment variables from .env when running locally
dotenv.config();

const { classify, extractSlots, quoteFor, askForMissing, quoteText } = require('./brain');
const { sendEmail, sendLinePush } = require('./notifier');

// LINE SDK configuration
const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
};

const client = new Client(config);
const app = express();

// Middleware to capture raw body for signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.status(200).send('ok');
});

// Load contact Flex template
const contactTemplatePath = path.join(__dirname, 'contactFlex.json');
let contactTemplate;
try {
  const content = fs.readFileSync(contactTemplatePath, 'utf8');
  contactTemplate = JSON.parse(content);
} catch (err) {
  console.error('Failed to load contactFlex.json:', err);
  contactTemplate = null;
}

// Build a fresh Flex message
function makeContactFlex() {
  if (!contactTemplate) return null;
  const clone = JSON.parse(JSON.stringify(contactTemplate));
  const replacePlaceholders = (obj) => {
    Object.keys(obj).forEach((key) => {
      const val = obj[key];
      if (typeof val === 'string') {
        obj[key] = val
          .replace(/\{\{CONTACT_PHONE\}\}/g, process.env.CONTACT_PHONE || '')
          .replace(/\{\{CONTACT_EMAIL\}\}/g, process.env.CONTACT_EMAIL || '');
      } else if (val && typeof val === 'object') {
        replacePlaceholders(val);
      }
    });
  };
  replacePlaceholders(clone);
  return clone;
}

// Notify admin via email and/or LINE push
async function notifyAdmin(subject, text) {
  const actions = [];
  if (process.env.NOTIFY_EMAIL_TO) {
    actions.push(sendEmail(subject || 'Notification from Line Gatekeeper', text));
  }
  if (process.env.ADMIN_GROUP_ID || process.env.ADMIN_USER_ID) {
    actions.push(sendLinePush(text));
  }
  try {
    await Promise.all(actions);
  } catch (err) {
    console.error('notifyAdmin error:', err);
  }
}

// LINE webhook endpoint
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-line-signature'];
  if (!validateSignature(req.rawBody, config.channelSecret, signature)) {
    res.status(401).send('Unauthorized');
    return;
  }
  const events = req.body.events || [];
  Promise.all(events.map((event) => handleEvent(event))).then(() => {
    res.json({ success: true });
  }).catch((err) => {
    console.error('Error handling events:', err);
    res.status(500).end();
  });
});

// Process a single event
async function handleEvent(event) {
  if (!event || event.type !== 'message' || event.message.type !== 'text') {
    return;
  }
  const text = (event.message.text || '').trim();
  const classification = classify(text);

  // Contact request
  if (classification === 'contact') {
    const flex = makeContactFlex();
    if (!flex) {
      await client.replyMessage(event.replyToken, { type: 'text', text: 'ขออภัย ไม่สามารถแสดงข้อมูลการติดต่อได้ในขณะนี้' });
    } else {
      await client.replyMessage(event.replyToken, {
        type: 'flex',
        altText: 'ข้อมูลการติดต่อ',
        contents: flex
      });
    }
    return;
  }

  // Notify request
  if (classification === 'notify') {
    const ackMsg = { type: 'text', text: 'ได้รับการแจ้งเตือนแล้ว ขอบคุณค่ะ' };
    await client.replyMessage(event.replyToken, ackMsg);
    await notifyAdmin('แจ้งเตือนจากผู้ใช้', `ผู้ใช้แจ้งเตือนด้วยข้อความ: ${text}`);
    return;
  }

  // Quote request
  const slots = extractSlots(text);
  const missingPrompt = askForMissing(slots);
  if (missingPrompt) {
    await client.replyMessage(event.replyToken, { type: 'text', text: missingPrompt });
    return;
  }
  const quote = quoteFor(slots);
  const replyText = quoteText(quote);
  await client.replyMessage(event.replyToken, { type: 'text', text: replyText });
  await notifyAdmin('คำขอเสนอราคา', `รายละเอียดคำขอ: ${JSON.stringify(slots)} | ราคา: ${quote.price}`);
}

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Line Gatekeeper is running on port ${port}`);
});
