// litterRobot.js
const { execFile } = require('child_process');
const path = require('path');
const SCRIPT = path.join(__dirname, 'litter_robot.py');

function py(...args) {
  return new Promise((resolve, reject) => {
    execFile('python3', [SCRIPT, ...args], { env: process.env, timeout: 30000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        try { resolve(JSON.parse(stdout)); }
        catch (e) { reject(new Error(`Bad Python output: ${stdout}`)); }
      });
  });
}

const getRobots            = ()           => py('robots');
const getRecentActivity    = (id)         => py('activity', id);
const recordVisit          = (a)          => py('record_visit', JSON.stringify(a));
const recordSabotage       = (a)          => py('record_sabotage', JSON.stringify(a));
const getVisitContext      = (a)          => py('context_visit', JSON.stringify(a));
const getSabotageContext   = ()           => py('context_sabotage');
const getDigestContext     = ()           => py('context_digest');
const getAnomalyContext    = ()           => py('anomaly_context');
const recordDispatch       = (type, text) => py('record_dispatch', JSON.stringify({ type, text }));
const getRecentDispatches  = (limit=150)  => py('get_recent_dispatches', String(limit));
const recordMessage        = (direction, sender_name, phone, text) => py('record_message', JSON.stringify({ direction, sender_name, phone, text }));
const getConversation      = (phone, limit=20) => py('get_conversation', JSON.stringify({ phone, limit }));

module.exports = { getRobots, getRecentActivity, recordVisit, recordSabotage, getVisitContext, getSabotageContext, getDigestContext, getAnomalyContext, recordDispatch, getRecentDispatches, recordMessage, getConversation };
