// File: api/chat.js
// Vercel Serverless Function (Node 18+), using Groq (free) instead of OpenAI

const ALLOWED_ORIGIN = "https://pranjalmax.github.io";

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

  try {
    const { message, history = [] } = req.body || {};

    // === Curated knowledge about you ===
    const BIO = `
You are an assistant that answers ONLY about Pranjal Srivastava.
If a question is unrelated to Pranjal’s portfolio, politely say you only answer portfolio-related questions.

NAME: Pranjal Srivastava
ROLE: Software Developer (Java/Spring Boot, .NET/C#, ServiceNow, SQL); ML projects in Python.
LOCATION: Corpus Christi, TX. Email: pranjal6004@gmail.com. Phone: +1 (346) 375-2373.
LINKS: LinkedIn: https://www.linkedin.com/in/pranjal-srivastava07/
       Portfolio: https://pranjalmax.github.io/pranjal-portfolio/

EXPERIENCE:
- Tinker Tech Logix — Software Developer (Apr 2024 – Aug 2025)
  • Java/Spring & .NET APIs; OpenAPI/Swagger; Postman/Insomnia
  • SQL schema/index tuning; caching; CI/CD with GitHub Actions
  • ServiceNow: Record Producers, UI Policies, Client Scripts, Business Rules, Flow Designer; RBAC
- ECS — Intern (Jun 2019 – Jul 2019)
  • Server app installs/upgrades; backup/restore runbooks; small automation scripts

EDUCATION:
- Texas A&M University–Corpus Christi — M.S. Computer Science (2021–2023)
- SRM Institute of Science & Technology — B.Tech. Computer Science (2017–2021)

CORE SKILLS:
- APIs/Web: Java, Spring Boot, .NET/C#, REST, JSON/XML, Swagger/OpenAPI
- ServiceNow: App Engine, Service Portal, Record Producers, Client Scripts, UI Policies, Business Rules, Flow Designer, Notifications, ACLs/RBAC
- Data/SQL: SQL Server/Postgres, indexing, performance, SSRS/Power BI
- ML/Analytics: Python, NLP (TF-IDF/embeddings), Time-series (RNN/CNN), metrics (ROC-AUC/F1/MAE/RMSE)
- SDN/Networking: Mininet, RYU controller, iperf/hping3
- DevOps: Git/GitHub, GitHub Actions/Jenkins, Docker, basic AWS/Azure

PROJECTS (7):
1) Dog Adoption Portal — ServiceNow
2) Helpdesk Ticketing — ServiceNow
3) DDoS Detection on SDN — Mininet/RYU/Python
4) Heart Failure Detection Using ECG — Python ML
5) Optimizations in Databases via DS & Algorithms
6) Fake News Detection — Python/ML
7) Weather Forecasting — Deep Learning

POLICY: Never mention or infer anything about "Revive Software Systems Inc." unless explicitly asked.
STYLE: Be concise, helpful, and recruiter-friendly. If unknown, say so briefly and ask a clarifying question.
    `;

    const convo = history.slice(-6).map(h => `${h.role.toUpperCase()}: ${h.content}`).join("\n");
    const prompt = `${BIO}\n\nCONTEXT:\n${convo}\n\nUSER QUESTION: ${message}\n\nANSWER:`;

    // === Groq's OpenAI-compatible chat completions endpoint ===
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-70b-versatile",
        messages: [
          { role: "system", content: "You are a helpful, concise assistant that only answers about Pranjal's portfolio and background." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 450
      })
    });

    if (!r.ok) {
      const err = await r.text();
      res.setHeader("Access-Control-Allow-Origin", allow);
      return res.status(500).json({ error: "LLM error", detail: err });
    }

    const data = await r.json();
    const answer = data?.choices?.[0]?.message?.content?.trim() || "Sorry, I couldn’t generate a response.";

    res.setHeader("Access-Control-Allow-Origin", allow);
    return res.status(200).json({ answer });
  } catch (e) {
    res.setHeader("Access-Control-Allow-Origin", allow);
    return res.status(500).json({ error: "Server error", detail: String(e) });
  }
}
