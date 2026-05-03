# The Reviewer — ATS Resume Analyzer

An ATS resume reviewer powered by Claude. Upload a resume (PDF/DOCX), paste a job description, get a match score, missing keywords, rewritten bullets, a tailored summary, and a cover letter draft.

---

## Project structure

```
ats-reviewer/
├── api/
│   └── analyze.js        ← Serverless function (holds your API key)
├── public/
│   └── index.html        ← The frontend
├── vercel.json           ← Vercel config
├── package.json
├── .gitignore
└── README.md
```

---

## Deploy to Vercel — step by step

### 1. Get an Anthropic API key

1. Go to https://console.anthropic.com
2. Sign up or log in
3. Go to **Settings → API Keys → Create Key**
4. Copy the key (starts with `sk-ant-...`) — you'll paste it into Vercel in step 4
5. **Important:** Go to **Settings → Limits → Spend Limits** and set a hard monthly cap (e.g., $20). This protects you from runaway costs.

### 2. Push this folder to GitHub

```bash
cd ats-reviewer
git init
git add .
git commit -m "Initial commit"
```

Then create a new repo on GitHub (https://github.com/new — name it `ats-reviewer`, keep it public or private, don't initialize with README), and:

```bash
git remote add origin https://github.com/YOUR_USERNAME/ats-reviewer.git
git branch -M main
git push -u origin main
```

### 3. Deploy on Vercel

1. Go to https://vercel.com and sign up with your GitHub account (free)
2. Click **Add New → Project**
3. Find your `ats-reviewer` repo and click **Import**
4. **Don't change any settings** — Vercel auto-detects everything
5. Before clicking Deploy, expand **Environment Variables** and add:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** paste your `sk-ant-...` key
6. Click **Deploy**

About 60 seconds later, you'll get a URL like `https://ats-reviewer-xyz.vercel.app`. Open it. Done.

### 4. Test it

- Drop in a resume PDF
- Paste a job description
- Click Analyze
- Check that results come back

If anything fails, check the **Vercel dashboard → your project → Logs** for the error.

---

## Updating the site

Any change you push to your `main` branch on GitHub auto-deploys to Vercel. No CLI needed.

```bash
# edit files locally
git add .
git commit -m "Tweaked the prompt"
git push
```

Vercel rebuilds in ~30 seconds.

---

## Built-in protections

- **Server-side rate limit:** 8 analyses per IP per hour
- **Input size limits:** 25k chars max for resume, 18k for JD
- **API key never exposed:** lives in Vercel env vars, never in browser
- **Anthropic spend cap:** set this in your Anthropic console (step 1.5 above) — non-negotiable

---

## Cost expectations

- **Vercel:** free tier covers ~100k function invocations/month — more than enough
- **Anthropic API:** roughly $0.03–$0.06 per analysis with Claude Sonnet 4 (depends on resume + JD length). 100 analyses ≈ $3–6.

Set the spend cap and forget about it.

---

## Tweaks you might want later

- **Branding:** change "The Reviewer" in `public/index.html` to your name
- **Custom domain:** Vercel → project → Settings → Domains → add your domain
- **Different model:** swap `claude-sonnet-4-20250514` in `api/analyze.js` for a faster/cheaper one if needed
- **Tone presets:** add a dropdown for "consulting / tech / energy" tone in the JD input area, and pass it into the prompt
