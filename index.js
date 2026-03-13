// index.js
require('dotenv').config();
const cron = require('node-cron');
const { getRobots, getRecentActivity, recordVisit, recordSabotage, getAnomalyContext } = require('./litterRobot');
const {
  generateVisitCommentary,
  generateSabotageCommentary,
  generateDailyDigest,
  generateDrawerCommentary,
  generateMariaGratitude,
  generateHealthAlert,
  generateFaultAlert,
} = require('./commentary');
const { sendText, sendToTucker, sendToBoth } = require('./sms');
const { startServer } = require('./server');

// ── State ─────────────────────────────────────────────────────────────────────

const seenActivityIds  = new Set();
let initialized        = false;

// Pending event buffer — house-sitter discretion model
let pendingVisits      = [];
let pendingSabotages   = [];
let lastWasteDrawerPct = null;  // track percentage for Maria detection
let lastTextSentAt     = null;

const SABOTAGE_STATUSES = new Set(['CST', 'CSF', 'CSI', 'BR']);
const DRAWER_STATUSES   = new Set(['DF1', 'DF2', 'DFS']);
const FAULT_STATUSES    = new Set(['DHF', 'DPF', 'HPF', 'OTF', 'PD', 'SCF', 'SPF', 'OFFLINE']);
const FAULT_LABELS = {
  DHF:     'Dump Home Position Fault — motor lost going home',
  DPF:     'Dump Position Fault — motor lost during dump',
  HPF:     'Home Position Fault',
  OTF:     '⚠️ Over Torque Fault — something may be jammed',
  PD:      '🚨 Pinch Detect — safety sensor triggered',
  SCF:     'Startup Cat Sensor Fault',
  SPF:     'Startup Pinch Detect',
  OFFLINE: '📵 Robot went offline',
};

// ── Discretion logic ──────────────────────────────────────────────────────────

function minutesSinceLastText() {
  if (!lastTextSentAt) return Infinity;
  return (Date.now() - lastTextSentAt) / 60000;
}

function shouldSendVisitText(visits) {
  if (visits.length === 0) return false;
  const mins = minutesSinceLastText();
  // Always text if it's been more than 3 hours
  if (mins > 180) return true;
  // Text if 3+ visits have queued
  if (visits.length >= 3) return true;
  // Text if first visit of the day (visit count in context will show 1)
  if (visits.length === 1 && mins > 60) return true;
  // Otherwise hold — the robot uses discretion
  return false;
}

function shouldSendSabotageText(sabotages) {
  if (sabotages.length === 0) return false;
  // Always send first sabotage after quiet period
  if (minutesSinceLastText() > 60) return true;
  // Batch if multiple
  if (sabotages.length >= 2) return true;
  return false;
}

async function maybeFlushPending() {
  // Flush visits
  if (pendingVisits.length > 0 && shouldSendVisitText(pendingVisits)) {
    const latest = pendingVisits[pendingVisits.length - 1];
    const count  = pendingVisits.length;
    pendingVisits = [];
    const commentary = await generateVisitCommentary(latest, count);
    console.log(`💬 ${commentary}`);
    await sendText(commentary);
    lastTextSentAt = Date.now();
  }

  // Flush sabotages
  if (pendingSabotages.length > 0 && shouldSendSabotageText(pendingSabotages)) {
    const count = pendingSabotages.length;
    pendingSabotages = [];
    const commentary = await generateSabotageCommentary(count);
    console.log(`💬 ${commentary}`);
    await sendText(commentary);
    lastTextSentAt = Date.now();
  }
}

// ── Health monitoring ─────────────────────────────────────────────────────────

async function checkHealthAnomalies() {
  try {
    const anomalies = await getAnomalyContext();
    if (!anomalies) return;
    if (anomalies.weightAlert) {
      console.log(`⚠️ Health alert: weight anomaly`);
      const msg = await generateHealthAlert('Weight change detected', anomalies.weightAlert);
      await sendToBoth(msg);
      lastTextSentAt = Date.now();
    }
    if (anomalies.frequencyAlert) {
      console.log(`⚠️ Health alert: visit frequency anomaly`);
      const msg = await generateHealthAlert('Unusual visit frequency', anomalies.frequencyAlert);
      await sendToBoth(msg);
      lastTextSentAt = Date.now();
    }
  } catch (e) {
    console.error('Health check error:', e.message);
  }
}

// ── Main poller ───────────────────────────────────────────────────────────────

async function checkForNewActivity() {
  try {
    const robots = await getRobots();
    if (!robots || robots.length === 0) return;
    const robot = robots[0];
    console.log(`🤖 Checking ${robot.name || 'Cookie\'s Moving Castle'}... Waste: ${robot.wasteDrawerPct ?? '?'}% Litter: ${robot.litterLevelPct ?? '?'}%`);

    const activities = await getRecentActivity(robot.litterRobotId);
    console.log(`📋 Got ${activities?.length ?? 0} activities. Recent:`, JSON.stringify(activities?.slice(0,3)));
    if (!activities || activities.length === 0) return;

    let drawerEventThisCycle = null;
    const litterLow = robot.litterLevelState && robot.litterLevelState.toString().includes('LOW');
    const currentWastePct = robot.wasteDrawerPct ?? null;

    // Maria detection: significant drop in waste drawer percentage
    if (
      lastWasteDrawerPct !== null &&
      currentWastePct !== null &&
      lastWasteDrawerPct - currentWastePct >= 20  // 20% drop = someone emptied it
    ) {
      console.log(`🙏 Waste drawer dropped ${lastWasteDrawerPct}% → ${currentWastePct}% — Maria?`);
      const msg = await generateMariaGratitude();
      console.log(`💬 ${msg}`);
      await sendText(msg);
      lastTextSentAt = Date.now();
    }
    if (currentWastePct !== null) lastWasteDrawerPct = currentWastePct;

    for (const activity of activities) {
      const id = activity.activityId || activity.timestamp;
      if (!initialized) { seenActivityIds.add(id); continue; }
      if (seenActivityIds.has(id)) continue;
      seenActivityIds.add(id);

      const status = activity.unitStatus;

      // Fault events — drop the voice, text Tucker immediately
      if (FAULT_STATUSES.has(status)) {
        const label = FAULT_LABELS[status] || `Fault: ${status}`;
        console.log(`🚨 Fault detected: ${status}`);
        const msg = await generateFaultAlert(status, label);
        console.log(`💬 ${msg}`);
        await sendToBoth(msg);
        lastTextSentAt = Date.now();
        continue;
      }

      // Drawer fullness status events (DF1/DF2/DFS) — still alert on these
      if (DRAWER_STATUSES.has(status)) {
        drawerEventThisCycle = status;
        console.log(`🗑️ Drawer status: ${status}`);
        const msg = await generateDrawerCommentary(status);
        console.log(`💬 ${msg}`);
        await sendText(msg);
        lastTextSentAt = Date.now();
        continue;
      }

      // Sabotage events
      if (SABOTAGE_STATUSES.has(status)) {
        console.log(`😈 Sabotage: ${status}`);
        await recordSabotage(activity);
        pendingSabotages.push(activity);
        continue;
      }

      // Cat visit (RDY after cat detected or weight present)
      if (status === 'RDY' && (activity.catDetected || activity.catWeight)) {
        console.log(`🐱 Visit detected`);
        // Attach live levels from robot state
        activity.wasteDrawerPct  = robot.wasteDrawerPct;
        activity.litterLevelPct  = robot.litterLevelPct;
        activity.litterLevelState = robot.litterLevelState;
        await recordVisit(activity);
        pendingVisits.push(activity);
        continue;
      }
    }

    if (drawerEventThisCycle) console.log(`🗑️ Last drawer event this cycle: ${drawerEventThisCycle}`);

    if (!initialized) {
      initialized = true;
      console.log(`✅ Initialized with ${seenActivityIds.size} existing events. Watching...\n`);
      return;
    }

    await maybeFlushPending();

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

// ── Daily digest (7am) ────────────────────────────────────────────────────────

async function sendDailyDigest() {
  try {
    console.log(`☀️ Sending daily digest...`);
    // Flush any pending events first
    if (pendingVisits.length > 0 || pendingSabotages.length > 0) {
      await maybeFlushPending();
      // Force flush remaining
      if (pendingVisits.length > 0) {
        const latest = pendingVisits[pendingVisits.length - 1];
        const count  = pendingVisits.length;
        pendingVisits = [];
        const c = await generateVisitCommentary(latest, count);
        await sendText(c);
      }
      pendingSabotages = [];
    }
    // Grab live robot state for digest levels
    let liveState = null;
    try {
      const robots = await getRobots();
      if (robots && robots.length > 0) liveState = robots[0];
    } catch (e) {
      console.warn('Could not fetch live state for digest:', e.message);
    }
    const digest = await generateDailyDigest(liveState);
    console.log(`💬 ${digest}`);
    await sendText(digest);
    lastTextSentAt = Date.now();
    // Health check with morning digest
    await checkHealthAnomalies();
  } catch (err) {
    console.error('❌ Digest error:', err.message);
  }
}

// ── Test mode ─────────────────────────────────────────────────────────────────

async function runTestMode() {
  const mode = process.env.TEST_MODE;
  console.log(`🧪 TEST MODE: ${mode}`);
  const fakeActivity = {
    activityId: `test-${Date.now()}`,
    timestamp:  new Date().toISOString(),
    unitStatus: mode === 'sabotage' ? 'CSI' : 'RDY',
    catWeight:  15.03,
    catDetected: true,
    duration:   null,
  };
  if (mode === 'digest') {
    const msg = await generateDailyDigest();
    console.log(`💬 ${msg}`);
    await sendText(msg);
  } else if (mode === 'sabotage') {
    const msg = await generateSabotageCommentary(1);
    console.log(`💬 ${msg}`);
    await sendText(msg);
  } else if (mode === 'drawer_full') {
    const msg = await generateDrawerCommentary('DFS');
    console.log(`💬 ${msg}`);
    await sendText(msg);
  } else if (mode === 'maria') {
    const msg = await generateMariaGratitude();
    console.log(`💬 ${msg}`);
    await sendText(msg);
  } else if (mode === 'fault') {
    const msg = await generateFaultAlert('OTF', '⚠️ Over Torque Fault — something may be jammed');
    console.log(`💬 ${msg}`);
    await sendToBoth(msg);
  } else {
    const msg = await generateVisitCommentary(fakeActivity, 1);
    console.log(`💬 ${msg}`);
    await sendText(msg);
  }
  console.log('🧪 Test complete.');
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Cookie Commentary Service starting...');
  startServer();
  if (process.env.TEST_MODE) {
    await runTestMode();
    return;
  }
  await checkForNewActivity();
  // Poll every 3 minutes
  cron.schedule('*/3 * * * *', checkForNewActivity);
  // Daily digest at 7am NYC time
  cron.schedule('0 7 * * *', sendDailyDigest, { timezone: 'America/New_York' });
}

main().catch(console.error);
