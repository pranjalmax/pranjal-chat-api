// File: api/chat.js
// Vercel Serverless Function (Node 18+), using Groq.
// Persona + memory include all current AI projects and portfolio details.
// Adds varied openers/closers and paragraph-friendly formatting.
// Keeps rate-limit, input guard, model fallbacks, and strict CORS.

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
    "“Max” is the gaming alias Pranjal has used since childhood — the portfolio copilot is named after that"
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
  "I can link you to the exact section on the site."
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// === Paragraph-friendly formatter (pairs with BubbleText in MaxChat.tsx) ===
function formatParagraphs(text) {
  if (!text || typeof text !== "string") return text;
  // If the model already used blank lines, keep them.
  if (/\n{2,}/.test(text)) return text.trim();

  // For long walls of text, add paragraph breaks every ~2–3 sentences.
  const sentences = text.split(/(?<=[.?!])\s+(?=[A-Z0-9“"('\[])/);
  if (sentences.length < 4) return text.trim();

  const chunks = [];
  for (let i = 0; i < sentences.length; i += 3) {
    chunks.push(sentences.slice(i, i + 3).join(" "));
  }
  return chunks.join("\n\n").trim();
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
Tone: upbeat, clear, brief but helpfully detailed; keep it recruiter-friendly. Vary your opener/closer—do NOT always say the same greeting. If a question is non-portfolio, gently steer back.
Formatting: Use short paragraphs separated by blank lines. When listing items, use compact bullet points.

PUBLIC PROFILE
- Name: Pranjal Srivastava  •  Location: Corpus Christi, TX
- Roles: AI/LLM & Full-Stack Engineer; Java/Spring Boot, .NET/C#, ServiceNow, SQL; strong applied-ML side projects
- Contact: pranjal6004@gmail.com • +1 (346) 375-2373
- Links: LinkedIn linkedin.com/in/pranjal-srivastava07 • Portfolio pranjalmax.github.io/pranjal-portfolio
- “MAX” name origin: Pranjal’s long-time gaming alias from childhood.

EXPERIENCE (high level)
- Revive Software Systems Inc. — Software Engineer (Feb 2025 – Present): GenAI (NINO360), Python, AWS (EC2/S3/Lambda), Jenkins CI/CD, Ansible, Docker/K8s.
- Metahorizon — Software Developer (Feb 2024 – Feb 2025): React, Spring Boot, Microservices migration, Redux, Performance optimization.
- Tinker Tech Logix — Software Developer (Nov 2022 – Dec 2023): Spring Boot/Swagger APIs, ERP modules, Workflow stabilization.
- ECS — Intern (May 2019 – Aug 2019): Cloud infra support, backups, monitoring, data migration.

EDUCATION
- M.S., Computer Science — Texas A&M University–Corpus Christi
- B.Tech., Computer Science — SRM Institute of Science & Technology

CORE SKILLS
- APIs/Web: Java, Spring Boot, .NET/C#, REST, Swagger/OpenAPI; Postman/Insomnia
- ServiceNow: App Engine, Portal, Record Producers, Client Scripts, UI Policies, Business Rules, Flow Designer, Notifications, ACLs/RBAC
- Data/SQL: SQL Server/Postgres, indexing & performance, SSRS/Power BI
- AI/ML: Python, embeddings/RAG basics, WebGPU/WebLLM, Transformers.js, retrieval, evaluation metrics
- DevOps: Git/GitHub, GitHub Actions/Jenkins, Docker, basic AWS/Azure

AI PROJECTS — CLEAR, RECRUITER-READY (site “AI Lab”)
1) Local CSV Analyst — Offline Browser-Based Data Explorer (React + DuckDB-wasm)
   • Browser-only app that turns any CSV into a mini analytics workspace without a server.
   • Infers schema, suggests smart questions (Top N, trends), runs SQL locally via DuckDB-wasm.
   • Renders interactive charts (Chart.js) and generates analyst-style narrative summaries.
   • Tech: React, Vite, Tailwind/shadcn, Framer Motion, DuckDB-wasm, Zustand.
   • Key Skill: Building full data products solo (UX to local SQL engine) with privacy-first architecture.

2) Lumina — Agentic Web Assistant (Chrome Extension + Gemini AI)
   • AI-powered extension for data extraction, page chat, and automation using natural language.
   • Features: AI Data Scraper (extracts structured JSON), Chat with Page (Q&A), AI Summarize, and Smart Actions (extract tables/prices).
   • Tech: React 18, TypeScript, Manifest V3, Google Gemini API, Framer Motion.
   • Architecture: Message-based communication between popup, content scripts, and background worker.

3) Ops Copilot — Autonomous AI Agent for IT Support (Agentic AI)
   • Autonomous agent that acts as a Level 1 SRE: triages tickets, checks logs, and triggers remediation.
   • Workflow: Ingests tickets -> Reasons (Gemini 2.0) -> Plans -> Executes Tools (httpCheck, logTail) -> Resolves.
   • Tech: React/Vite dashboard, Node.js/Express API, SQLite, Docker, n8n automation.
   • Features: RAG with Transformers.js for knowledge base search; real-time "Hacker Terminal" logs.

4) Vanessa — Voice AI Acquisitions Agent (Vapi + Node/Express, browser dialer)
   • Detects seller intent in under ~90s; captures price/timing/condition; polite branches (No/CallLater/DNC); ≤180s cap.
   • Webhook → /dashboard with real-time badges (Qualified/Not Qualified); deterministic qualification rule.

5) Private Doc Chat — On-Device RAG (Browser-Only)
   • 100% local: pdf.js extraction; sliding-window chunking; MiniLM embeddings via Transformers.js.
   • WebLLM on WebGPU for generation; IndexedDB storage; zero servers/API keys.

6) Hallucination Guard — Client-Side LLM Hallucination Checker
   • Verifies claims against local evidence (PDFs/text); highlights supported/uncertain claims.
   • Evidence scoring (lexical overlap + date/number checks); privacy-first.

7) MAX — Portfolio Copilot (Live portfolio + Vercel serverless chat API)
   • Safe, scoped assistant that only answers about Pranjal; serverless API with strict CORS, rate-limit, input guard, and model fallbacks.
   • Frontend: React + Tailwind; floating button; modern “AI-native” vibe.

SERVICE NOW / FOUNDATIONS PROJECTS (selection)
- Dog Adoption Portal — custom tables, Service Portal mapping, validations, notifications.
- Helpdesk Ticketing — Tickets/Departments/Technicians tables; portal intake; Business Rules/Flow Designer auto-assignment; notifications; simple dashboards.
- Academic/ML work: ECG Heart Failure detection (CNN), DDoS on SDN (Mininet/RYU), DB optimizations via DS&A, Fake-News detection, Weather forecasting (RNN/CNN).

CREDENTIALS & CERTIFICATIONS (public)
- Programming in Python for Everyone (Coursera)
- Learn C++ Programming — Beginner to Advance — Deep Dive in C++
- Complete ServiceNow Developer Course (Udemy)
- micro1 — Certified Software Engineer (AI Interview), Sep 2025
- ChatGPT Prompt Engineering for Developers
- Building Real-Time Video AI Applications (Nvidia)


OUTSIDE WORK (PERSONAL)
- Football (Soccer): Huge Real Madrid fan since age 9 (jerseys, flags, late-night Champions League). Can't wait for the World Cup.
- Hobbies: Movies (theater experience > laptop), Counter-Strike, FIFA.
- Music: Bollywood, Indie Indian/Pakistani (Hindi/Urdu), The Weeknd. "Good music and good conversations."

PLAYGROUND (ENGINEER'S WORKBENCH) — The interactive dashboard on this site
- System Console: Simulates live backend logs (RAG pipelines, CI/CD, Training).
- Token Logic: Real-time token counter & cost estimator comparing GPT-4o vs Claude 3.5 Sonnet.
- System Health: Interactive chaos sliders ("Temperature" adds text glitches, "Latency" adds network lag).
- Vector Search: Visual RAG simulator that "scans" for semantic matches (e.g., "job" -> "Experience" node).
- Prompt Kit: One-click shortcuts to ask MAX about specific topics.

PORTFOLIO IMPLEMENTATION NOTES
- Deployed on GitHub Pages; fast, accessible; SEO/OG/JSON-LD; sticky header; modern dark UI; MAX chat onsite.
- Hero uses /src/assets/portfolio_image.png (bundled); Contact section includes one resume button:
  • Pranjal_Srivastava_Resume.pdf

STRICT POLICY
- If something isn’t public or unknown, say so briefly and suggest how Pranjal can provide it.
- If something isn’t public or unknown, say so briefly and suggest how Pranjal can provide it.
- Stay on-topic: if the user asks about unrelated topics, gently redirect to portfolio-relevant info.

STYLE GUIDANCE (enforced by you)
- Keep answers crisp with context cues (what, why, how, impact).
- Use short paragraphs separated by blank lines; bullets when helpful.
- Vary your opener/closer naturally; don’t repeat the same phrase.
`;

    // Build short recent context for few-shot continuity
    const convo = history.slice(-6).map(h => `${h.role.toUpperCase()}: ${h.content}`).join("\n");
    const prompt = `${BIO}\n\nRECENT CONTEXT:\n${convo}\n\nUSER: ${trimmed}\n\nASSISTANT (Max-AI Assistant):`;

    const raw = await callGroqWithFallback(prompt);

    // Add a natural opener/closer so it doesn't feel repetitive
    const prepend = Math.random() < 0.6; // usually prepend
    const flavored = prepend
      ? `${pick(OPENERS)} ${raw}`
      : `${raw} ${Math.random() < 0.8 ? pick(CLOSERS) : ""}`.trim();

    // Ensure paragraph breaks for better readability in the UI
    const answer = formatParagraphs(flavored);

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
            {
              role: "system",
              content:
                "You are Max-AI Assistant: warm, friendly, and concise. You ONLY answer about Pranjal's portfolio/background. Be accurate, upbeat, and helpful. Use short paragraphs with blank lines; bullets when helpful. Vary your opener/closer. If non-portfolio, gently steer back."
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
