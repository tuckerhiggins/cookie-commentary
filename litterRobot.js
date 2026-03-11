// litterRobot.js
// Delegates to litter_robot.py (pylitterbot) via child_process
const { execFile } = require('child_process');
const path = require('path');

const SCRIPT = path.join(__dirname, 'litter_robot.py');

function runPython(args) {
  return new Promise((resolve, reject) => {
    execFile('python3', [SCRIPT, ...args], {
      env: process.env,
      timeout: 30000,
    }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`Failed to parse Python output: ${stdout}`));
      }
    });
  });
}

async function getRobots() {
  return runPython(['robots']);
}

async function getRecentActivity(robotId) {
  return runPython(['activity', robotId]);
}

module.exports = { getRobots, getRecentActivity };
