# 🐱 Cookie Commentary Service

Texts you AI-generated funny commentary every time Cookie uses her Litter-Robot 4.

**Example texts you might receive:**
> 🐱 Cookie Update:
> BREAKING: Sources confirm Cookie has once again retreated to the Porcelain Palace for what witnesses describe as a "productive 47-second engagement." Her publicist has declined to comment.

> 🐱 Cookie Update:
> AND SHE STICKS THE LANDING! Cookie, weighing in at a svelte 9.2 pounds, executes a flawless bathroom visit. The crowd goes WILD. This is what peak performance looks like, folks.

---

## How It Works

1. Polls the Litter-Robot 4 API every 3 minutes
2. Detects new cat visits (ignores cleaning cycles)
3. Sends the visit details to Claude for funny commentary
4. Texts you via Twilio

---

## Setup

### 1. Clone & install
```bash
git clone <your-repo>
cd cookie-commentary
npm install
```

### 2. Configure environment variables
```bash
cp .env.example .env
# Edit .env with your credentials
```

You'll need:
- **Litter-Robot credentials**: Same email/password as the app
- **Anthropic API key**: [console.anthropic.com](https://console.anthropic.com)
- **Twilio**: Sign up at [twilio.com](https://twilio.com), get a number (~$1/mo), grab your Account SID and Auth Token

### 3. Test locally
```bash
npm run dev
```

Watch the logs — on first run it seeds existing activity (no texts sent). On the next Cookie visit, you'll get a text within 3 minutes.

---

## Deploy to Railway

1. Push to a GitHub repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repo
4. Add all env vars from `.env.example` in the Railway dashboard under **Variables**
5. Deploy — Railway will keep it running 24/7

**Cost**: Railway Hobby plan is $5/mo. Twilio is ~$0.0079/text. Anthropic API calls are fractions of a cent each. Total: ~$5-6/month.

---

## Customization

**Change polling frequency**: Edit the cron expression in `src/index.js`:
```js
cron.schedule('*/3 * * * *', checkForNewActivity); // every 3 min
cron.schedule('* * * * *', checkForNewActivity);   // every 1 min
```

**Change commentary style**: Edit the prompt in `src/commentary.js` to adjust Cookie's persona or the narrator's voice.

**Multiple recipients**: In `src/sms.js`, call `sendText()` multiple times with different `to` numbers.

---

## Troubleshooting

**Auth failures**: Make sure your LR4 app login works. The service uses the same credentials.

**No activity detected**: The `catDetected` field varies by firmware. If you're not getting texts after confirmed visits, check the raw API response by adding `console.log(activities)` in `src/index.js`.

**Twilio errors**: Verify your `TWILIO_FROM_NUMBER` is an SMS-capable number and `TO_PHONE_NUMBER` includes the country code (+1 for US).
