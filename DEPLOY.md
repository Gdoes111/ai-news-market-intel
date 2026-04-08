# Deploying to Vercel

## Prerequisites
- Vercel account at vercel.com (connect with GitHub)
- Node.js installed

## Step 1: Install Vercel CLI
```
npm i -g vercel
```

## Step 2: Login to Vercel
```
vercel login
```

## Step 3: Deploy
```
cd C:\Users\jaisi\.openclaw\workspace\ai-news-market-intel
vercel
```
Follow the prompts — accept all defaults. When asked "Want to override the settings?", say No.

## Step 4: Add your OpenAI API Key to Vercel
In the Vercel dashboard → your project → Settings → Environment Variables:
- Name: `OPENAI_API_KEY`
- Value: your OpenAI API key
- Environment: Production, Preview, Development (check all)

Or via CLI:
```
vercel env add OPENAI_API_KEY
```

## Step 5: Redeploy with env vars
```
vercel --prod
```

You'll get a URL like `https://ai-news-market-intel.vercel.app`

## Install on Your Phone

### iPhone (Safari)
1. Open the URL in Safari
2. Tap the Share button (box with arrow)
3. Scroll down → tap "Add to Home Screen"
4. Tap "Add"

### Android (Chrome)
1. Open the URL in Chrome
2. Tap the 3-dot menu
3. Tap "Add to Home Screen" or "Install App"

The app icon will appear on your home screen and open full-screen like a native app!

## Local Development
```
npm install
vercel dev
```
This runs the frontend + API functions locally at http://localhost:3000
