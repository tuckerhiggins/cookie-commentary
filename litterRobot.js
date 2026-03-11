// litterRobot.js
// Uses Whisker's current GraphQL API for LR4 (as of 2024/2025)
// Auth: Cognito via the whisker.iothings.site user pool
const axios = require('axios');

// Current Whisker/LR4 Cognito config (reverse-engineered from app)
const COGNITO_REGION = 'us-east-1';
const COGNITO_CLIENT_ID = '20k6j0thrjr5dpth0j8uovf62v'; // current Whisker app client ID
const COGNITO_URL = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;
const GRAPHQL_URL = 'https://lr4.iothings.site/graphql';

let accessToken = null;
let tokenExpiry = null;

async function authenticate() {
  const email = process.env.LITTER_ROBOT_EMAIL;
  const password = process.env.LITTER_ROBOT_PASSWORD;

  const response = await axios.post(
    COGNITO_URL,
    {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: COGNITO_CLIENT_ID,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    },
    {
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
    }
  );

  accessToken = response.data.AuthenticationResult.AccessToken;
  const expiresIn = response.data.AuthenticationResult.ExpiresIn || 3600;
  tokenExpiry = Date.now() + (expiresIn - 60) * 1000;
  console.log('✅ Authenticated with Whisker API');
  return accessToken;
}

async function getToken() {
  if (!accessToken || Date.now() > tokenExpiry) {
    await authenticate();
  }
  return accessToken;
}

async function getRobots() {
  const token = await getToken();

  const query = `
    query GetUserRobots {
      getLitterRobot4s {
        unitId
        name
        serial
        userId
        unitStatus
      }
    }
  `;

  const response = await axios.post(
    GRAPHQL_URL,
    { query },
    {
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
    }
  );

  const robots = response.data?.data?.getLitterRobot4s || [];
  return robots.map(r => ({
    litterRobotId: r.unitId,
    name: r.name,
    serial: r.serial,
    unitStatus: r.unitStatus,
  }));
}

async function getRecentActivity(robotId) {
  const token = await getToken();

  const query = `
    query GetActivity($unitId: String!, $limit: Int) {
      getLitterRobot4Activity(unitId: $unitId, limit: $limit) {
        activityId: id
        unitId
        unitStatus
        catWeight
        catDetected
        duration: cleanCycleWaitTimeMinutes
        timestamp
      }
    }
  `;

  const response = await axios.post(
    GRAPHQL_URL,
    {
      query,
      variables: { unitId: robotId, limit: 10 },
    },
    {
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
    }
  );

  const raw = response.data?.data?.getLitterRobot4Activity || [];

  // Normalize field names to what our app expects
  return raw.map(a => ({
    activityId: a.activityId || a.id,
    timestamp:  a.timestamp,
    unitStatus: a.unitStatus,
    catWeight:  a.catWeight  ?? null,
    catDetected: a.catDetected ?? false,
    duration:   a.duration   ?? null,
  }));
}

module.exports = { getRobots, getRecentActivity, authenticate };
