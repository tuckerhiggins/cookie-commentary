// src/sms.js
const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function sendText(message) {
  const result = await client.messages.create({
    body: message,
    from: process.env.TWILIO_FROM_NUMBER, // your Twilio number, e.g. +15551234567
    to: process.env.TO_PHONE_NUMBER,       // your number, e.g. +15559876543
  });

  console.log(`📱 SMS sent: ${result.sid}`);
  return result;
}

module.exports = { sendText };
