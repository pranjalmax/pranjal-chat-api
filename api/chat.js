// File: api/chat.js
// Vercel Serverless Function (Node 18+), using Groq.
// Adds model fallbacks + rate-limit + input guard + friendly "Max-AI Assistant" persona.

const ALLOWED_ORIGIN = "https://pranjalmax.github.io";

// Prefer a model via env (optional), else use this fallback order:
const DEFAULT_MODELS = [
  process.env.GROQ_MODEL,               // optional override
  "llama-3.3-70b-versatile",
  "llama-3.1-70b-versatile",
  "llama-3.1-8b-instant",
  "mixtral-8x7b-32768",
  "gemma2-9b-it"
].filter(Boolean);

// === Rate limit (token bucket) ===
const RATE = { capacity: 16, refillPerMinute: 8 }; // burst 16, 8/min
const buckets = new Map();
function ipFromReq(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}
function takeToken(ip) {
  const now = Date.now();
  let b = buckets.get(ip) || { tokens: RATE.capacity, last: now };
  const elapsedMin = (now - b.last) / 60000;
  b.tokens = Math.min(RATE.capacity, b.tokens + elapsedMin * RATE.refillPerMinute);
  b.last = now;
  if (b.tokens >= 1) { b.tokens -= 1; buckets.set(ip, b); return true; }
  buckets.set(ip, b); return false;
}

// === Input guard ===
const MAX_CHARS = 800;
const BLOCKED_PATTERNS = [
  /https?:\/\/\S{20,}/i,
  /(free\s*money|giveaway)/i,
  /[^\w\s.,?!@()\-+/'":;%&]/u
];

// === Personal details (from you) ===
const PERSONAL = {
  age: "26",
  hobbies: [
    "soccer (played since school; St. Francis College team, regional wins)",
    "going to the cinema (all genres except horror)",
    "occasional cricket",
    "Indian festivals"
  ],
  funFacts: [
    "Die-hard Real Madrid supporter with a jersey collection",
    "Dream: watch a match at the Santiago Bernabéu",
    "Favorite player of all time: Cristiano Ronaldo"
  ]
};

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allow = origin && origin.startsWith(ALLOWED_ORIGIN) ? origin : ALLOWED_ORIGIN;

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", allow);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Access-Control-Allow-Origin", allow);
    return res.status(405).json({ error: "Use POST" });
  }

  // Rate limit
  const ip = ipFromReq(req);
  if (!takeToken(ip)) {
    res.setHeader("Access-Control-Allow-Origin", allow);
    return res.status(429).json({ error: "Too many requests, please wait a bit." });
  }

  try {
    const { message, history = [] } = req.body || {};
    if (!message || typeof message !== "string") {
      res.setHeader("Access-Control-Allow-Origin", allow);
      return res.status(400).json({ error: "Provide 'message' (string)" });
    }

    const trimmed = message.trim();
    if (!trimmed) {
      res.setHeader("Access-Control-Allow-Origin", allow);
      return res.status(400).json({ error: "Empty message" });
    }
    if (trimmed.length > MAX_CHARS) {
      res.setHeader("Access-Control-Allow-Origin", allow);
      return res.status(413).json({ error: `Message too long (max ${MAX_CHARS} chars)` });
    }
    if (BLOCKED_PATTERNS.some((re) => re.test(trimmed))) {
      res.setHeader("Access-Control-Allow-Origin", allow);
      return res.status(400).json({ error: "Message looks like spam. Try rephrasing." });
    }

    // === Curated, friendly knowledge ===
    const BIO = `
You are "Max-AI Assistant", a warm, friendly, and concise guide who answers ONLY about **Pranjal Srivastava** and his portfolio.
- Tone: upbeat, clear, a touch breezy; avoid heavy jargon; short but helpfully detailed.
- Be accurate. If non-portfolio, gently steer back.
- Include light humanity (encouragement, connective phrases), no fluff.
- If personal details aren't shared, say they aren't public.

PUBLIC PROFILE
- Name: Pranjal Srivastava
- Role: Software Developer (Java/Spring Boot, .NET/C#, ServiceNow, SQL); ML projects in Python
- Location: Corpus Christi, TX
- Email: pranjal6004@gmail.com
- Phone: +1 (346) 375-2373
- LinkedIn: https://www.linkedin.com/in/pranjal-srivastava07/
- Portfolio: https://pranjalmax.github.io/pranjal-portfolio/

EXPERIENCE
- Tinker Tech Logix — Software Developer (Apr 2024 – Sept 2025)
  • Java/Spring & .NET APIs; OpenAPI/Swagger; Postman/Insomnia
  • SQL schema/index tuning; caching; CI/CD with GitHub Actions
  • ServiceNow: Record Producers, UI Policies, Client Scripts, Business Rules, Flow Designer; RBAC
- ECS — Intern (Jun 2019 – Jul 2019)
  • Server app installs/upgrades; backup/restore runbooks; small automation scripts

EDUCATION
- Texas A&M University–Corpus Christi — M.S. Computer Science (2021–2023)
- SRM Institute of Science & Technology — B.Tech. Computer Science (2017–2021)

CORE SKILLS
- APIs/Web: Java, Spring Boot, .NET/C#, REST, JSON/XML, Swagger/OpenAPI
- ServiceNow: App Engine, Portal, Record Producers, Client Scripts, UI Policies, Business Rules, Flow Designer, Notifications, ACLs/RBAC
- Data/SQL: SQL Server/Postgres, indexing, performance, SSRS/Power BI
- ML/Analytics: Python, NLP (TF-IDF/embeddings), Time-series (RNN/CNN), metrics (ROC-AUC/F1/MAE/RMSE)
- SDN/Networking: Mininet, RYU controller, iperf/hping3
- DevOps: Git/GitHub, GitHub Actions/Jenkins, Docker, basic AWS/Azure

PROJECT HIGHLIGHTS (7)
1) Dog Adoption Portal — ServiceNow
   - Dogs & Adoption Centers tables; Service Portal Record Producer (server-side mapping), validations; optional notifications via Flow Designer.
   - Impact: standardizes intake, enables role-based visibility, foundation for an “Adopt” approval flow.
2) Helpdesk Ticketing — ServiceNow
   - Custom Tickets/Departments/Technicians; portal intake; auto-assignment via Business Rules/Flow Designer; notifications; simple dashboards.
   - Impact: faster TTR, cleaner routing, repeatable intake.
3) DDoS Detection on SDN — Mininet/RYU/Python
   - Mininet topology; traffic via iperf/hping3; controller logs in RYU; entropy features (information + log energy) with sliding windows to flag anomalies.
   - Impact: earlier anomaly detection vs baselines with reproducible setup.
4) Heart Failure Detection Using ECG — Python ML
   - End-to-end pipeline; CNN-based classifier; balanced evaluation (precision/recall/F1); confusion matrix & learning curves.
   - Impact: demonstrates viable ECG classification workflow; accepted/published results.
5) Optimizations in Databases via DS & Algorithms
   - Maps access patterns to data structures/indexing; emphasizes IO-aware complexity & latency reduction on critical paths.
6) Fake News Detection — Python/ML
   - NLP preprocessing (tokenization/stop-words/lemmatization); TF-IDF/embeddings; classifiers (LogReg/SVM/NN) compared with ROC-AUC/F1.
7) Weather Forecasting — Deep Learning
   - Time-series model (RNN/CNN hybrid); feature engineering (lags/rolling stats); evaluated with MAE/RMSE; early stopping & validation discipline.

PERSONAL
- Age: ${PERSONAL.age || "(not publicly shared)"}
- Hobbies: ${PERSONAL.hobbies.length ? PERSONAL.hobbies.join(", ") : "(not publicly shared)"}
- Fun facts: ${PERSONAL.funFacts.length ? PERSONAL.funFacts.join(", ") : "(not publicly shared)"}

STRICT POLICY
- Never mention or infer anything about "Revive Software Systems Inc." unless explicitly asked.
- If something is unknown, say so briefly and offer how Pranjal could provide it.

RESPONSE STYLE EXAMPLES
- “Happy to help! Here’s the quick version…”
- “In short: … If you want the deeper details, I can expand.”
- “Nice question—here’s how Pranjal approached it…”
`;

    const convo = history.slice(-6).map(h => `${h.role.toUpperCase()}: ${h.content}`).join("\n");
    const prompt = `${BIO}\n\nRECENT CONTEXT:\n${convo}\n\nUSER: ${trimmed}\n\nASSISTANT (Max-AI Assistant):`;

    const answer = await callGroqWithFallback(prompt);

    res.setHeader("Access-Control-Allow-Origin", allow);
    return res.status(200).json({ answer, assistant: "Max-AI Assistant" });
  } catch (e) {
    res.setHeader("Access-Control-Allow-Origin", allow);
    return res.status(500).json({ error: "Server error", detail: String(e) });
  }
}

async function callGroqWithFallback(prompt) {
  const headers = {
    "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
    "Content-Type": "application/json"
  };
  let lastError = null;
  for (const model of DEFAULT_MODELS) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "You are Max-AI Assistant: warm, friendly, and concise. You ONLY answer about Pranjal's portfolio/background. Be accurate, upbeat, and helpful. If non-portfolio, gently steer back." },
            { role: "user", content: prompt }
          ],
          temperature: 0.35,
          max_tokens: 450
        })
      });
      if (!r.ok) {
        const errText = await r.text();
        if (errText.includes("model_decommissioned") || errText.includes("not found") || errText.includes("unavailable")) {
          lastError = errText; continue;
        }
        throw new Error(errText);
      }
      const data = await r.json();
      const answer = data?.choices?.[0]?.message?.content?.trim();
      if (answer) return answer;
      lastError = "Empty response";
    } catch (e) { lastError = String(e); continue; }
  }
  throw new Error(lastError || "All models failed");
}
