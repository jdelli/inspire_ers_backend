# Render.com Environment Variables Setup Guide

## Required Environment Variables

After your backend deploys successfully to Render, you need to add these environment variables in the Render dashboard:

### Step 1: Get Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click gear icon ⚙️ → **Project settings**
4. Navigate to **Service accounts** tab
5. Click **Generate new private key**
6. Download the JSON file

### Step 2: Extract Values from JSON

Open the downloaded `serviceAccountKey.json` and find these values:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",           ← Copy this
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",  ← Copy this
  "client_email": "firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com",  ← Copy this
  ...
}
```

### Step 3: Add to Render

1. Go to your Render service dashboard
2. Click **Environment** in the left sidebar
3. Click **Add Environment Variable**
4. Add these THREE variables:

| Key | Value | Example |
|-----|-------|---------|
| `FIREBASE_PROJECT_ID` | Project ID from JSON | `inspire-ers-12345` |
| `FIREBASE_CLIENT_EMAIL` | Client email from JSON | `firebase-adminsdk-abc@inspire-ers.iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` | **Entire** private key from JSON | `-----BEGIN PRIVATE KEY-----\nMII...AAA=\n-----END PRIVATE KEY-----\n` |
| `JWT_SECRET` | Random secure string | `super-secret-jwt-key-12345` |
| `NODE_ENV` | `production` | `production` |

### Step 4: Important Notes

**For FIREBASE_PRIVATE_KEY:**
- Copy the ENTIRE value including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`
- Keep the `\n` characters (they represent newlines)
- The value should look like: `-----BEGIN PRIVATE KEY-----\nMIIE...rest...AAA=\n-----END PRIVATE KEY-----\n`
- Render will handle it correctly

**For JWT_SECRET:**
- Use a long, random string
- Generate one with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- Never use the default `your-secret-key-change-in-production`

### Step 5: Redeploy

After adding all environment variables:
1. Click **Manual Deploy** → **Clear build cache & deploy**
2. Or just click **Deploy latest commit**

### Step 6: Verify

Once deployed, test the health endpoint:
```
https://your-app-name.onrender.com/health
```

Should return:
```json
{
  "status": "OK",
  "message": "Backend server is running",
  "timestamp": "...",
  "environment": "production"
}
```

---

## Troubleshooting

**Error: "Firebase Admin initialization failed"**
- Check that all three Firebase variables are set correctly
- Verify FIREBASE_PRIVATE_KEY includes the full key with `-----BEGIN` and `-----END`
- Make sure there are no extra spaces or quotes

**Error: "Invalid service account"**
- Double-check you copied the values from the correct Firebase project
- Regenerate the service account key if needed

**Still not working?**
- Check Render logs for specific error messages
- Verify the serviceAccountKey.json works locally first
- Make sure you're using the latest service account key

---

## Quick Copy-Paste Template

For Render Environment Variables:

```
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
JWT_SECRET=
NODE_ENV=production
```

Fill in the blanks with your actual values!
