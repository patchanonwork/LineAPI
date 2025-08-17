const express = require("express");
const line = require("@line/bot-sdk");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { classify, extractSlots, trustScore, quoteFor, gateQuickReply, askForMissing, quoteText } = require("./brain");
const { sendEmail, sendLinePush } = require("./notifier");

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const TRUST_LOW = 40;
const TRUST_HIGH = 70;

const app = express();
const client = new line.Client(config);

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

app.post("/webhook", line.middleware(config), async (req, res) => {
  const events = req.body.events || [];
  await Promise.all(events.map(handleEvent));
  res.status(200).end();
});

async function handleEvent(e){
  try{
    if (e.type !== "message" || e.message.type !== "text") return;
    const text = (e.message.text || "").trim();
    const slots  = extractSlots(text);
    const intent = classify(text);

    // Contact flow
    if (slots.contact) {
      await reply(e.replyToken, contactFlex());
      await notifyAdmin("🔔 ผู้ติดต่อกด 'ติดต่อคุณณณ'", text, e);
      return;
    }
    if (slots.notify) {
      await notifyAdmin("🔔 ผู้ติดต่อขอให้ทีมงานติดต่อกลับ", text, e);
      await reply(e.replyToken, { type: "text", text: "รับเรื่องเรียบร้อยค่ะ ทีมงานจะติดต่อกลับโดยเร็วที่สุด ✅" });
      return;
    }

    const score  = trustScore(e.source, text, slots);

    if (intent === "rate_shop" || score < TRUST_LOW) {
      return reply(e.replyToken, gateQuickReply());
    }
    if (score >= TRUST_HIGH && (slots.format || slots.deliverable) && slots.platform && (slots.asset || slots.gencode)) {
      const quote = quoteFor(slots);
      return reply(e.replyToken, quoteText(quote, slots));
    }
    const range = quoteFor({ ...slots, coarse: true });
    return reply(e.replyToken, askForMissing(range, slots));
  } catch (err){
    console.error("handleEvent error", err);
  }
}

function reply(token, messages){
  return client.replyMessage(token, Array.isArray(messages) ? messages : [messages]);
}

function contactFlex(){
  const fp = path.join(__dirname, "contactFlex.json");   // file at repo root
  const tmpl = JSON.parse(fs.readFileSync(fp, "utf8"));
  const phone = process.env.CONTACT_PHONE || "+66967676734";
  const email = process.env.CONTACT_EMAIL || "Patchanon.work@gmail.com";
  const replaced = JSON.stringify(tmpl)
    .replace(/{{CONTACT_PHONE}}/g, phone)
    .replace(/{{CONTACT_EMAIL}}/g, email);
  return JSON.parse(replaced);
}

async function notifyAdmin(title, userText, e){
  const who = e.source.userId ? `userId: ${e.source.userId}` : (e.source.groupId ? `groupId: ${e.source.groupId}` : "unknown");
  const html = `<h3>${title}</h3><p><b>From:</b> ${who}</p><pre>${userText}</pre>`;
  try { await sendEmail(title, html); } catch(err){ console.error("email notify failed", err); }
  try { await sendLinePush(client, `${title}\nFrom ${who}\n---\n${userText}`); } catch(err){ console.error("line notify failed", err); }
}

// (No LIFF page yet, but keep path if you add one later)
app.use("/liff", express.static("liff"));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log("listening on :" + port));
