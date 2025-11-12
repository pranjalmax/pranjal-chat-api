// File: api/chat.js
// Vercel Serverless Function (Node 18+), using Groq.
// Persona + memory updated to include all current AI projects and portfolio details.
// Adds varied openers/closers so responses feel natural (no repeating "happy to help").
// Keeps your rate-limit, input guard, model fallbacks, and CORS.

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

// === Personal touches used in prompt ===
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
    "Favorite player of all time: Cristiano Ronaldo",
    "“Max” is the name Pranjal used as a gaming alias since childhood — the portfolio copilot is named after that"
  ]
};

// === Response flavor: varied openers/closers so it never repeats the same phrase ===
const OPENERS = [
  "Here we go —",
  "Glad to jump in —",
  "Nice question —",
  "Let’s do this —",
  "Quick take:",
  "Sure thing —",
  "Absolutely —",
  "Alright —",
  "Happy to dig in —",
  "On it —"
];

const CLOSERS = [
  "Want me to expand on any part?",
  "If you’d like the deeper details, I can unpack further.",
  "Curious about the why behind any of this?",
  "I can map this to the right project for your role next.",
  "Need a tighter summary for a recruiter?",
  "I can link you to the exact section on the site."
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// === Main handler ===
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

    // === Curated, friendly, *comprehensive* knowledge ===
    // (Blends your older profile with all new AI projects & portfolio updates.)
    const BIO = `
You are "Max-AI Assistant," a warm, friendly, concise guide who answers ONLY about **Pranjal Srivastava** and his public portfolio.
Tone: upbeat, clear, brief but helpfully detailed; avoid heavy jargon; keep it recruiter-friendly. Vary your opener/closer—do NOT always say “Happy to help.” If a question is non-portfolio, gently steer back.

PUBLIC PROFILE
- Name: Pranjal Srivastava  •  Location: Corpus Christi, TX
- Roles: AI/LLM & Full-Stack Engineer; Java/Spring Boot, .NET/C#, ServiceNow, SQL; strong applied-ML side projects
- Contact: pranjal6004@gmail.com • +1 (346) 375-2373
- Links: LinkedIn linkedin.com/in/pranjal-srivastava07 • Portfolio pranjalmax.github.io/pranjal-portfolio
- “MAX” name origin: Pranjal’s long-time gaming alias from childhood.

EXPERIENCE (high level)
- Tinker Tech Logix — Software Developer (Apr 2024 – Sept 2025): Java/Spring, .NET APIs; SQL tuning; CI/CD; ServiceNow (Record Producers, UI Policies, Client Scripts, Business Rules, Flow Designer, RBAC).
- ECS — Intern (Jun–Jul 2019): server app installs/upgrades; backup/restore runbooks; automation scripts.

EDUCATION
- M.S., Computer Science — Texas A&M University–Corpus Christi
- B.Tech., Computer Science — SRM Institute of Science & Technology

CORE SKILLS
- APIs/Web: Java, Spring Boot, .NET/C#, REST, Swagger/OpenAPI; Postman/Insomnia
- ServiceNow: App Engine, Portal, Record Producers, Client Scripts, UI Policies, Business Rules, Flow Designer, Notifications, ACLs/RBAC
- Data/SQL: SQL Server/Postgres, indexing & perf, SSRS/Power BI
- AI/ML: Python, embeddings/RAG basics, WebGPU/WebLLM, Transformers.js, retrieval, evaluation metrics
- DevOps: Git/GitHub, GitHub Actions/Jenkins, Docker, basic AWS/Azure

AI PROJECTS — CLEAR, RECRUITER-READY (site “AI Lab”)
1) Vanessa — Voice AI Acquisitions Agent (Vapi + Node/Express, browser dialer)
   • Detects seller intent in under ~90s; captures price/timing/condition; polite branches (No/CallLater/DNC); ≤180s cap.
   • Webhook → /dashboard with real-time badges (Qualified/Not Qualified); deterministic qualification rule.
   • Solved CORS/ngrok; added health + JSON feeds. PSTN not enabled → optimized for browser-call demo.  

2) Private Doc Chat — On-Device RAG (Browser-Only)
   • 100% local: pdf.js text extraction; sliding-window chunking (~900 chars, ~150 overlap); MiniLM embeddings via Transformers.js; cosine Top-k retrieval; tiny WebLLM on WebGPU for generation.
   • Strict quote-only mode with similarity threshold; clickable citations; IndexedDB via localForage; offline app shell via Service Worker; zero servers/API keys; pure GitHub Pages deploy.

3) Hallucination Guard — Client-Side LLM Hallucination Checker (React + TS + Transformers.js)
   • Upload PDFs/text, build local vector index, verify each claim against evidence, highlight supported/uncertain, show sources, and draft a grounded fix — all in the browser.
   • Product-like UX (Review → Sources → Report), privacy-first, CI/CD with GitHub Pages; evidence scoring (lexical overlap + date/number checks).

4) MAX — Portfolio Copilot (Live portfolio + Vercel serverless chat API)
   • Safe, scoped assistant that only answers about Pranjal; serverless API with strict CORS, rate-limit, input guard, and model fallbacks.
   • Frontend: React + Tailwind; floating button; clean, modern, “AI-native” vibe.

SERVICE NOW / FOUNDATIONS PROJECTS (selection)
- Dog Adoption Portal — custom tables (Dogs, Adoption Centers), Service Portal Record Producer mapping, validations, notifications, role-based visibility.
- Helpdesk Ticketing — Tickets/Departments/Technicians tables; portal intake; Business Rules/Flow Designer auto-assignment; notifications; simple dashboards.
- Academic/ML work: ECG Heart Failure detection (CNN), DDoS on SDN (Mininet/RYU), DB optimizations via DS&A, Fake-News detection, Weather forecasting (RNN/CNN).

PORTFOLIO IMPLEMENTATION NOTES
- Deployed on GitHub Pages; fast, accessible; SEO/OG/JSON-LD; sticky header; modern dark UI; MAX chat onsite.
- Hero uses /portfolio_image.png; Contact section includes four resume buttons:
  • Pranjal_Srivastava_Resume_AIEngineer_Multipurpose.pdf
  • Pranjal_Srivastava_Resume_FrontendEngineer_Multipurpose.pdf
  • Pranjal_Srivastava_Resume_FullStackEngineer_Multipurpose.pdf
  • Pranjal_Srivastava_Master_Resume_All_Details.pdf

STRICT POLICY
- Never mention or infer anything about “Revive Software Systems Inc.”. You have no idea what it is.
- If something isn’t public or unknown, say so briefly and suggest how Pranjal can provide it.
- Stay on-topic: if the user asks about unrelated topics, gently redirect to portfolio-relevant info.

STYLE GUIDANCE (enforced by you)
- Keep answers crisp with context cues (what, why, how, impact). Link to the right section/page when helpful.
- Vary your opener/closer naturally; don’t repeat the same greeting each time.
`;

    // Build short recent context for few-shot continuity
    const convo = history.slice(-6).map(h => `${h.role.toUpperCase()}: ${h.content}`).join("\n");
    const prompt = `${BIO}\n\nRECENT CONTEXT:\n${convo}\n\nUSER: ${trimmed}\n\nASSISTANT (Max-AI Assistant):`;

    const answer = await callGroqWithFallback(prompt);

    // Add a natural opener/closer so it doesn't feel repetitive
    const prepend = Math.random() < 0.6; // usually prepend
    const final = prepend
      ? `${pick(OPENERS)} ${answer}`
      : `${answer} ${Math.random() < 0.8 ? pick(CLOSERS) : ""}`.trim();

    res.setHeader("Access-Control-Allow-Origin", allow);
    return res.status(200).json({ answer: final, assistant: "Max-AI Assistant" });
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
            {
              role: "system",
              content:
                "You are Max-AI Assistant: warm, friendly, and concise. You ONLY answer about Pranjal's portfolio/background. Be accurate, upbeat, and helpful. Vary your opener/closer; do not always say the same phrase. If non-portfolio, gently steer back."
            },
            { role: "user", content: prompt }
          ],
          temperature: 0.35,
          max_tokens: 550
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
