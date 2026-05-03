// api/analyze.js
// Serverless function: receives resume + JD, calls Anthropic, returns analysis.
// Your ANTHROPIC_API_KEY lives in Vercel env vars — never exposed to the browser.

// Simple in-memory rate limiter (resets on cold start, which is fine for a personal tool).
// For heavier traffic, swap to Vercel KV / Upstash Redis.
const buckets = new Map();
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_IP = 8;             // 8 analyses per IP per hour

function rateLimited(ip) {
  const now = Date.now();
  const arr = (buckets.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_IP) return true;
  arr.push(now);
  buckets.set(ip, arr);
  return false;
}

const MAX_RESUME_CHARS = 25000; // ~5 page resume, generous
const MAX_JD_CHARS     = 18000; // very long JD
const MIN_RESUME_CHARS = 200;
const MIN_JD_CHARS     = 80;

export default async function handler(req, res) {
  // CORS — same-origin only on Vercel, but headers don't hurt
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // IP for rate limiting
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    "unknown";

  if (rateLimited(ip)) {
    return res.status(429).json({
      error: "Rate limit reached. Please try again in an hour."
    });
  }

  // Parse + validate input
  const { resumeText, jdText } = req.body || {};
  if (typeof resumeText !== "string" || typeof jdText !== "string") {
    return res.status(400).json({ error: "Invalid payload." });
  }
  if (resumeText.length < MIN_RESUME_CHARS) {
    return res.status(400).json({ error: "Resume content is too short or empty." });
  }
  if (jdText.length < MIN_JD_CHARS) {
    return res.status(400).json({ error: "Job description is too short." });
  }
  if (resumeText.length > MAX_RESUME_CHARS) {
    return res.status(400).json({ error: "Resume is too long (over ~25k characters)." });
  }
  if (jdText.length > MAX_JD_CHARS) {
    return res.status(400).json({ error: "Job description is too long (over ~18k characters)." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server misconfigured (no API key)." });
  }

  const prompt = `You are an expert ATS resume reviewer and career strategist.

Analyze this RESUME against this JOB DESCRIPTION.

=== RESUME ===
${resumeText}

=== JOB DESCRIPTION ===
${jdText}
=== END ===

Return ONLY a single valid JSON object (no markdown fences, no commentary, no preamble). Schema:

{
  "score": <integer 0-100, holistic ATS keyword + qualification + experience match>,
  "scoreRationale": "<one sentence, plain English, no fluff>",
  "matchedKeywords": [<6-10 strings: real keyword/phrase matches between resume and JD>],
  "missingKeywords": [<8-12 strings: critical keywords/phrases from the JD that are absent or weak in the resume>],
  "formatFlags": [<0-5 strings: ATS formatting/structure issues — tables, columns, graphics, missing sections, dates format, etc. Empty array if clean.>],
  "tailoredSummary": "<2-3 sentence professional summary tailored to THIS role. Strategy-forward and leadership-facing. Concise narrative hook, not a restatement of bullet metrics. No clichés like 'passionate', 'thrilled', 'leverage', 'dynamic', 'results-driven', 'proven track record'.>",
  "rewrittenBullets": [
    {
      "original": "<a real weak/generic bullet copied from the resume>",
      "rewritten": "<stronger version: action verb + quantified outcome + JD-aligned keyword. Plain confident language. No clichés.>"
    }
  ],
  "coverLetter": "<250-300 words. First person. Plain conversational language a competent senior professional would actually write. NO 'I am writing to', NO 'I am thrilled', NO 'leverage', NO 'dynamic', NO 'passionate', NO 'results-driven'. Open with a specific hook tied to the role/company. Body proves fit with 2-3 concrete achievements pulled from the resume. Close with a clear next step. Use line breaks between paragraphs.>"
}

Rules:
- rewrittenBullets array must contain 4-6 entries.
- Pull rewrittenBullets.original verbatim from the resume — do not invent.
- missingKeywords must come from the JD.
- Be ruthless on the score: only excellent matches earn 85+.
- Output JSON only.`;

  try {
    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error("Anthropic error:", apiRes.status, errText);
      return res.status(502).json({
        error: `Upstream error (${apiRes.status}). Please try again in a moment.`
      });
    }

    const data = await apiRes.json();
    let text = (data.content || []).map(b => b.text || "").join("").trim();
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) text = text.slice(first, last + 1);

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.error("Parse error. Raw text:", text.slice(0, 500));
      return res.status(502).json({ error: "Could not parse the analysis. Please try again." });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}
