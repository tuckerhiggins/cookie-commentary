// sms.js
const twilio = require('twilio');
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const FROM   = process.env.TWILIO_FROM_NUMBER;
const TUCKER = process.env.TO_PHONE_NUMBER;
const EMMA   = process.env.EMMA_PHONE_NUMBER;
// Sitter: set SITTER_PHONE (and SITTER_NAME in commentary.js) when someone is staying
const SITTER = process.env.SITTER_PHONE || null;

async function _send(to, message) {
  if (!to) return;
  const result = await client.messages.create({ body: message, from: FROM, to });
  console.log(`📱 SMS sent to ${to}: ${result.sid}`);
  return result;
}

async function sendToTucker(message) { return _send(TUCKER, message); }
async function sendToEmma(message)   { return _send(EMMA, message); }
async function sendToSitter(message) { return _send(SITTER, message); }

async function sendToBoth(message) {
  const targets = [TUCKER, EMMA].filter(Boolean);
  return Promise.all(targets.map(to => _send(to, message)));
}

// Default: send to household + sitter if present
async function sendText(message) {
  const targets = [TUCKER, EMMA, SITTER].filter(Boolean);
  return Promise.all(targets.map(to => _send(to, message)));
}

module.exports = { sendText, sendToTucker, sendToEmma, sendToSitter, sendToBoth };
