// server.js — inbound SMS webhook
require('dotenv').config();
const express    = require('express');
const { generateReply } = require('./commentary');
const { getConversation } = require('./litterRobot');
const { sendToTucker, sendToEmma, sendToSitter } = require('./sms');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ── Phone number → sender mapping ─────────────────────────────────────────────

function identifySender(from) {
  const normalize = n => n.replace(/\s+/g, '').replace(/[^\d+]/g, '');
  const num = normalize(from);

  const roster = [
    { name: 'Tucker', phone: process.env.TO_PHONE_NUMBER,    send: sendToTucker },
    { name: 'Emma',   phone: process.env.EMMA_PHONE_NUMBER,  send: sendToEmma   },
  ];

  // Add sitter if present
  if (process.env.SITTER_NAME && process.env.SITTER_PHONE) {
    roster.push({
      name: process.env.SITTER_NAME,
      phone: process.env.SITTER_PHONE,
      send: sendToSitter,
    });
  }

  return roster.find(r => r.phone && normalize(r.phone) === num) || null;
}

// ── Inbound SMS webhook ───────────────────────────────────────────────────────

app.post('/sms', async (req, res) => {
  // Acknowledge Twilio immediately — must respond within 15s or it retries
  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');

  const from = req.body.From || '';
  const body = (req.body.Body || '').trim();

  console.log(`📩 Inbound SMS from ${from}: "${body}"`);

  const sender = identifySender(from);
  if (!sender) {
    console.warn(`⚠️ Unknown sender: ${from} — ignoring`);
    return;
  }

  try {
    const history = await getConversation(from, 20);
    const reply   = await generateReply(sender.name, body, history, from);
    console.log(`💬 Reply to ${sender.name}: ${reply}`);
    await sender.send(reply);
  } catch (err) {
    console.error(`❌ Reply error: ${err.message}`);
  }
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'cookie-commentary' });
});

// ── Start ─────────────────────────────────────────────────────────────────────

function startServer() {
  app.listen(PORT, () => {
    console.log(`🌐 Webhook server listening on port ${PORT}`);
  });
}

module.exports = { startServer };
