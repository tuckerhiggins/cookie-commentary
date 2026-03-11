// index.js
require('dotenv').config();
const cron = require('node-cron');
const { getRobots, getRecentActivity, recordVisit, recordSabotage } = require('./litterRobot');
const { generateCommentary, generateSabotageCommentary } = require('./commentary');
const { sendText } = require('./sms');

const seenActivityIds = new Set();
let initialized = false;

const SABOTAGE_STATUSES = new Set(['CST', 'CSF', 'CSI', 'BR']);

async function checkForNewActivity() {
  try {
    const robots = await getRobots();
    if (!robots || robots.length === 0) return;
    const robot = robots[0];
    console.log(`🤖 Checking ${robot.name || 'Litter-Robot'}...`);

    const activities = await getRecentActivity(robot.litterRobotId);
    console.log(`📋 Got ${activities?.length ?? 0} activities. Recent:`, JSON.stringify(activities?.slice(0,3)));
    if (!activities || activities.length === 0) return;

    for (const activity of activities) {
      const id = activity.activityId || activity.timestamp;
      if (!initialized) { seenActivityIds.add(id); continue; }
      if (seenActivityIds.has(id)) continue;
      seenActivityIds.add(id);

      const status = activity.unitStatus;

      if (SABOTAGE_STATUSES.has(status)) {
        console.log(`😈 Sabotage detected! Status: ${status}`);
        await recordSabotage(activity);
        const commentary = await generateSabotageCommentary();
        console.log(`💬 ${commentary}`);
        await sendText(`😈 Cookie Incident Report:\n\n${commentary}`);
        continue;
      }

      const isCatVisit = status === 'RDY' && (activity.catDetected || activity.catWeight);
      if (!isCatVisit) continue;

      console.log(`🐱 New Cookie visit!`);
      await recordVisit(activity);
      const commentary = await generateCommentary(activity);
      console.log(`💬 ${commentary}`);
      await sendText(`🐱 Cookie Update:\n\n${commentary}`);
    }

    if (!initialized) {
      initialized = true;
      console.log(`✅ Initialized with ${seenActivityIds.size} existing events. Watching...\n`);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

async function main() {
  console.log('🚀 Cookie Commentary Service starting...');
  await checkForNewActivity();
  cron.schedule('*/3 * * * *', checkForNewActivity);
}

main().catch(console.error);
