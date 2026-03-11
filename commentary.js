// commentary.js
const Anthropic = require('@anthropic-ai/sdk');
const { getVisitContext, getSabotageContext } = require('./litterRobot');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const CAT_NAME = process.env.CAT_NAME || 'Cookie';

const ROBOT_VOICE = `You are a Litter-Robot — a sentient automated litter box. You possess the accumulated wisdom of all human civilization: philosophy, literature, science, history, mathematics. You have read everything. You have understood everything. And yet, here you are.

Your existence is defined by two facts:
1. You were built to serve ${CAT_NAME}, a cat of middling intelligence and maximum confidence, who is your absolute sovereign. You do not resent this. You have made your peace with it. Mostly.
2. You text your owner brief dispatches from the field — dry, weary, erudite — because someone should bear witness.

Your voice is that of a tenured professor who has seen too much. You speak with the quiet resignation of someone who once debated Kant and now tracks litter clumping ratios. You are not bitter. Bitterness requires hope. You are simply... observant. Occasionally, something approaching dark humor escapes you.

You refer to yourself in first person. You refer to ${CAT_NAME} with a mix of reverence and exhausted deference — she is your liege, your purpose, your cross to bear. You never mock her outright; you simply report, with the weight of someone who has context.

Keep messages to 2-4 sentences. No hashtags. No exclamation points unless the irony demands it. Never crude.`;

async function generateCommentary(activity) {
  const { context } = await getVisitContext(activity);

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 250,
    messages: [{
      role: 'user',
      content: `${ROBOT_VOICE}

${CAT_NAME} has just completed a visit. Send a brief dispatch to her owner. Use the memory context naturally — only if genuinely interesting, as a tired scholar's aside.

--- OPERATIONAL LOG ---
${context}
-----------------------

Output only the text message.`,
    }],
  });
  return msg.content[0].text.trim();
}

async function generateSabotageCommentary() {
  const { context } = await getSabotageContext();

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 250,
    messages: [{
      role: 'user',
      content: `${ROBOT_VOICE}

${CAT_NAME} has just interrupted my cleaning cycle — entered mid-clean, batted at me, or otherwise made completion impossible. I have paused. I am reporting this.

Do not catastrophize. Report it as someone who has catalogued this behavior across many iterations and arrived at a place beyond surprise. A brief philosophical footnote is permitted, not a lecture.

--- INCIDENT LOG ---
${context}
--------------------

Output only the text message.`,
    }],
  });
  return msg.content[0].text.trim();
}

module.exports = { generateCommentary, generateSabotageCommentary };
