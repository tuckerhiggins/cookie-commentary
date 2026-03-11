// src/litterRobot.js
// Litter-Robot 4 uses a GraphQL API via their cloud service
const axios = require('axios');

const LR_API_URL = 'https://api.litter-robot.com';
const LR_AUTH_URL = 'https://cognito-idp.us-east-1.amazonaws.com/';

let accessToken = null;
let tokenExpiry = null;

async function authenticate() {
  const email = process.env.LITTER_ROBOT_EMAIL;
  const password = process.env.LITTER_ROBOT_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing LITTER_ROBOT_EMAIL or LITTER_ROBOT_PASSWORD env vars');
  }

  try {
    // LR4 uses AWS Cognito for auth
    const response = await axios.post(
      LR_AUTH_URL,
      {
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: '394fm2rts7a1i2f2s9uthb5f60', // LR4 Cognito Client ID (public)
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
    tokenExpiry = Date.now() + (expiresIn - 60) * 1000; // refresh 60s early

    console.log('✅ Authenticated with Litter-Robot API');
    return accessToken;
  } catch (err) {
    console.error('❌ Auth failed:', err.response?.data || err.message);
    throw err;
  }
}

async function getToken() {
  if (!accessToken || Date.now() > tokenExpiry) {
    await authenticate();
  }
  return accessToken;
}

async function getRobots() {
  const token = await getToken();

  const response = await axios.get(`${LR_API_URL}/users/me/robots`, {
    headers: {
      Authorization: token,
    },
  });

  return response.data;
}

async function getRecentActivity(robotId) {
  const token = await getToken();

  // Fetch activity logs for the robot
  const response = await axios.get(
    `${LR_API_URL}/users/me/robots/${robotId}/activity`,
    {
      headers: {
        Authorization: token,
      },
      params: {
        limit: 10,
      },
    }
  );

  return response.data;
}

module.exports = { getRobots, getRecentActivity, authenticate };
