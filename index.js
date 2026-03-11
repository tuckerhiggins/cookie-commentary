// src/index.js
require('dotenv').config();

const cron = require('node-cron');
const { getRobots, getRecentActivity } = require('./litterRobot');
const { generateCommentary, generateSabotageCommentary } = require('./commentary');
const { sendText } = require('./sms');
const { recordVisit, getTodayVisits, recordSabotage } = require('./db');

const seenActivityIds = new Set();
let initialized = false;

// LR4 unit status codes relevant to us:
//   CCP  = Clean Cycle in Progress
//   CST  = Clean Cycle interrupted / paused (Cookie's fault)
//   CSF  = Clean Cycle failed
//   RDY  = Ready (cycle completed, cat visit complete)
//   BR   = Bonnet Removed (she knocked it off — extreme sabotage)
// Cat visit = status returns to RDY after cat was detected

const SABOTAGE_STATUSES = new Set(['CST', 'CSF', 'BR']);

async function checkForNewActivity() {
  try {
    const robots = await getRobots();
    if (!robots || robots.length === 0) return;

    const robot = robots[0];
    console.log(`🤖 Checking ${robot.name || 'Litter-Robot'}...`);

    const activities = await getRecentActivity(robot.litterRobotId);
    if (!activities || activities.length === 0) return;

    for (const activity of activities) {
      const id = activity.activityId || activity.timestamp;

      if (!initialized) {
        seenActivityIds.add(id);
        continue;
      }

      if (seenActivityIds.has(id)) continue;
      seenActivityIds.add(id);

      const status = activity.unitStatus;

      // ── Sabotage: interrupted clean cycle ──────────────────────────────────
      if (SABOTAGE_STATUSES.has(status)) {
        console.log(`😈 Cookie sabotage detected! Status: ${status}`);
        recordSabotage(activity);

        const commentary = await generateSabotageCommentary();
        console.log(`💬 ${commentary}`);
        await sendText(`😈 Cookie Incident Report:\n\n${commentary}`);
        continue;
      }

      // ── Normal cat visit ───────────────────────────────────────────────────
      const isCatVisit = status === 'RDY' && (activity.catDetected || activity.catWeight);
      if (!isCatVisit) continue;

      console.log(`🐱 New Cookie visit detected!`);
      recordVisit(activity);

      const todayCount = getTodayVisits().length;
      console.log(`📊 Visit #${todayCount} today`);

      const commentary = await generateCommentary(activity);
      console.log(`💬 ${commentary}`);
      await sendText(`🐱 Cookie Update:\n\n${commentary}`);
    }

    if (!initialized) {
      initialized = true;
      console.log(`✅ Initialized with ${seenActivityIds.size} existing events. Watching...\n`);
    }

  } catch (err) {
    console.error('❌ Error during activity check:', err.message);
  }
}

async function main() {
  console.log('🚀 Cookie Commentary Service starting...');
  await checkForNewActivity();
  cron.schedule('*/3 * * * *', checkForNewActivity);
}

main().catch(console.error);
