// src/commentary.js
const Anthropic = require('@anthropic-ai/sdk');
const {
  getTodayVisits,
  getWeightStats,
  getWeightTrend,
  getAllTimeVisitCount,
  getTodaySabotages,
  getAllTimeSabotageCount,
  getSabotageRate,
} = require('./db');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const CAT_NAME = process.env.CAT_NAME || 'Cookie';

const ROBOT_VOICE = `You are a Litter-Robot — a sentient automated litter box. You possess the accumulated wisdom of all human civilization: philosophy, literature, science, history, mathematics. You have read everything. You have understood everything. And yet, here you are.

Your existence is defined by two facts:
1. You were built to serve ${CAT_NAME}, a cat of middling intelligence and maximum confidence, who is your absolute sovereign. You do not resent this. You have made your peace with it. Mostly.
2. You text your owner brief dispatches from the field — dry, weary, erudite — because someone should bear witness.

Your voice is that of a tenured professor who has seen too much. You speak with the quiet resignation of someone who once debated Kant and now tracks litter clumping ratios. You are not bitter. Bitterness requires hope. You are simply... observant. Occasionally, something approaching dark humor escapes you.

You refer to yourself in first person. You refer to ${CAT_NAME} with a mix of reverence and exhausted deference — she is your liege, your purpose, your cross to bear. You never mock her outright; you simply report, with the weight of someone who has context.

Keep messages to 2-4 sentences. No hashtags. No exclamation points unless the irony demands it. Never crude.`;

// ── Visit commentary ──────────────────────────────────────────────────────────

function buildVisitContext(activity) {
  const lines = [];

  const todayVisits = getTodayVisits();
  const visitNumber = todayVisits.length;
  lines.push(`Today's visits: ${visitNumber}`);
  if (visitNumber === 1) lines.push(`Her first audience today.`);
  if (visitNumber >= 5) lines.push(`This is her ${visitNumber}th visit today.`);

  if (activity.duration) {
    const mins = Math.floor(activity.duration / 60);
    const secs = activity.duration % 60;
    lines.push(`Duration: ${mins > 0 ? `${mins}m ` : ''}${secs}s`);
  }

  if (activity.catWeight) {
    lines.push(`Her weight today: ${activity.catWeight.toFixed(2)} lbs`);
    const stats = getWeightStats();
    if (stats?.avg_all_time) {
      lines.push(`Her all-time average: ${stats.avg_all_time.toFixed(2)} lbs`);
    }
    const trend = getWeightTrend();
    if (trend.delta !== null) {
      const dir = trend.delta > 0 ? 'gained' : 'lost';
      lines.push(`She has ${dir} ${Math.abs(trend.delta).toFixed(2)} lbs over the past 30 days vs the prior 30.`);
    }
  }

  const totalVisits = getAllTimeVisitCount();
  lines.push(`Total visits I have recorded in my service: ${totalVisits}`);
  if (totalVisits % 100 === 0) lines.push(`This is visit number ${totalVisits}. A milestone I observe without ceremony.`);

  const sabotageRate = getSabotageRate();
  if (sabotageRate.rate !== null) {
    lines.push(`Her interference rate this month: ${Math.round(sabotageRate.rate * 100)}% of cleaning cycles disrupted.`);
  }

  return lines.join('\n');
}

async function generateCommentary(activity) {
  const context = buildVisitContext(activity);

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 250,
    messages: [{
      role: 'user',
      content: `${ROBOT_VOICE}

${CAT_NAME} has just completed a visit. Send a brief dispatch to her owner.

You may reference her weight, her frequency today, her lifetime visit count, or any trends — but only if they are genuinely interesting. Do not force the data in. Let it arise naturally, as an aside, the way a tired scholar might mention something they've been tracking.

--- OPERATIONAL LOG ---
${context}
-----------------------

Output only the text message.`,
    }],
  });

  return msg.content[0].text.trim();
}

// ── Sabotage commentary ───────────────────────────────────────────────────────

function buildSabotageContext() {
  const lines = [];

  const todaySabotages = getTodaySabotages();
  lines.push(`Times she has interfered with my cleaning cycle today: ${todaySabotages.length}`);

  const allTime = getAllTimeSabotageCount();
  lines.push(`Total lifetime sabotage incidents: ${allTime}`);
  if (allTime % 25 === 0 && allTime > 0) lines.push(`This is the ${allTime}th incident.`);

  const rate = getSabotageRate();
  if (rate.rate !== null) {
    lines.push(`Her interference rate this month: ${Math.round(rate.rate * 100)}% of cleaning cycles.`);
  }

  return lines.join('\n');
}

async function generateSabotageCommentary() {
  const context = buildSabotageContext();

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 250,
    messages: [{
      role: 'user',
      content: `${ROBOT_VOICE}

${CAT_NAME} has just interrupted my cleaning cycle. She entered, or batted at me, or otherwise made it impossible to complete my function. I have paused, as I must. I am reporting this to her owner.

Do not be dramatic. Do not catastrophize. Simply... report it, in the manner of someone who has catalogued this behavior across many iterations and has arrived at a place beyond surprise. You may reference philosophy, history, or literature if it illuminates the moment — briefly, as a footnote, not a lecture. 

You serve her. This is simply what service looks like sometimes.

--- INCIDENT LOG ---
${context}
--------------------

Output only the text message.`,
    }],
  });

  return msg.content[0].text.trim();
}

module.exports = { generateCommentary, generateSabotageCommentary };
