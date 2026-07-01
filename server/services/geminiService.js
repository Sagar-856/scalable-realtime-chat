const { GoogleGenAI } = require("@google/genai");

// Created once, reused for every request — same idea as why we created the
// Socket.IO connection once in Chat.jsx instead of per-render. Creating a
// fresh client per-request would work too, but is wasteful.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// sleep is a tiny helper — just pauses execution for the given milliseconds.
// Used below to wait between retry attempts.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Gemini's free tier occasionally returns 503 ("model overloaded") during
// traffic spikes — this is Google's infrastructure being busy, not a bug
// in our code. Retrying after a short wait usually succeeds on the 2nd or
// 3rd attempt. We use "exponential backoff" — waiting longer after each
// failed attempt (1s, then 2s, then 4s) — which is the standard pattern
// for retrying calls to any external API, not specific to Gemini.
async function startStreamWithRetry(prompt, maxRetries = 3) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await ai.models.generateContentStream({
        model: "gemini-2.5-flash", // fast + cheap, ideal for a chat app
        contents: prompt,
      });
    } catch (err) {
      lastError = err;

      // Only retry on 503 (temporary overload) — other errors (e.g. 401
      // bad API key, 400 bad request) won't fix themselves by retrying,
      // so we fail immediately for those instead of wasting time.
      const isRetryable = err?.status === 503;
      const isLastAttempt = attempt === maxRetries - 1;

      if (!isRetryable || isLastAttempt) {
        throw err;
      }

      const backoffMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
      console.log(`Gemini overloaded (503), retrying in ${backoffMs}ms... (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(backoffMs);
    }
  }

  throw lastError;
}

// streamAIResponse takes recent chat messages as "context" and the user's
// actual question, and returns an async generator that yields text chunks
// as Gemini produces them — NOT the full answer at once.
//
// recentMessages: array of { senderName, content } from MongoDB, oldest first.
// userQuestion: the actual question the user just asked the AI.
async function* streamAIResponse(recentMessages, userQuestion) {
  // --- BUILDING CONTEXT ---
  // Without this, the AI only ever sees the single question in isolation —
  // it wouldn't know what was discussed 2 messages ago. We turn the last
  // few chat messages into a simple text block and prepend it as context,
  // so the AI can reference the ongoing conversation naturally.
  const contextText = recentMessages
    .map((m) => `${m.senderName}: ${m.content}`)
    .join("\n");

  const prompt = `You are a helpful AI assistant inside a group chat app.
Here is the recent conversation for context:
${contextText}

Now answer this question from a user, keeping your reply concise and conversational (this is a chat app, not an essay):
${userQuestion}`;

  // generateContentStream returns an async generator — Gemini sends chunks
  // of the response progressively as they're generated, not all at once.
  // Wrapped in retry logic since the FIRST call (establishing the stream)
  // is where the 503 actually happens — once streaming begins, it's
  // unlikely to fail mid-stream the same way.
  const response = await startStreamWithRetry(prompt);

  // "yield" here passes each chunk of text back to WHOEVER called this
  // function (we'll call it from socket.js), one piece at a time, the
  // moment it's ready — instead of waiting to collect the full answer first.
  for await (const chunk of response) {
    if (chunk.text) {
      yield chunk.text;
    }
  }
}

module.exports = { streamAIResponse };