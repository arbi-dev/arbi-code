// Reproduces Dyad's EXACT model code path against the ARBI LiteLLM endpoint,
// in isolated stages, so we can see precisely which layer fails.
//
// Usage:
//   ARBI_KEY=sk-...your-virtual-key... node scripts/diag-arbi.mjs
// Optional:
//   ARBI_MODEL=Fast            (default: Fast)
//   ARBI_URL=https://api.arbi.work/v1   (default)
//
// The key is read from the environment and never printed.

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, generateText, tool } from "ai";
import { z } from "zod";

const KEY = process.env.ARBI_KEY;
const MODEL = process.env.ARBI_MODEL || "Fast";
const URL = process.env.ARBI_URL || "https://api.arbi.work/v1";

if (!KEY) {
  console.error("ERROR: set ARBI_KEY env var to your virtual key.");
  process.exit(2);
}

// Don't let a stray promise rejection abort the staged run.
process.on("unhandledRejection", (e) => {
  console.log("  (suppressed unhandledRejection:", e?.message || e, ")");
});

function dumpError(prefix, err) {
  console.log(`${prefix} ❌ FAIL`);
  console.log("  name:        ", err?.name);
  console.log("  message:     ", err?.message);
  if (err?.statusCode) console.log("  statusCode:  ", err.statusCode);
  if (err?.url) console.log("  url:         ", err.url);
  if (err?.responseBody) console.log("  responseBody:", err.responseBody);
  if (err?.cause)
    console.log("  cause:       ", err.cause?.message || String(err.cause));
}

const provider = createOpenAICompatible({
  name: "custom::arbi-litellm",
  baseURL: URL,
  apiKey: KEY,
});

// ── Stage 1: raw /models with the key (what LiteLLM actually exposes) ────────
async function stage1() {
  console.log(`\n[1] GET ${URL}/models (auth)`);
  try {
    const res = await fetch(`${URL}/models`, {
      headers: { Authorization: `Bearer ${KEY}` },
    });
    const body = await res.text();
    console.log("  HTTP", res.status);
    try {
      const ids = JSON.parse(body).data?.map((m) => m.id);
      console.log("  models:", JSON.stringify(ids));
    } catch {
      console.log("  body:", body.slice(0, 500));
    }
  } catch (e) {
    dumpError("[1]", e);
  }
}

// ── Stage 2: non-streaming completion, NO tools ─────────────────────────────
async function stage2() {
  console.log(`\n[2] generateText(model="${MODEL}") no tools`);
  try {
    const r = await generateText({
      model: provider(MODEL),
      maxRetries: 0,
      messages: [{ role: "user", content: "Reply with exactly: pong" }],
    });
    console.log("  ✅ PASS text:", JSON.stringify(r.text));
  } catch (e) {
    dumpError("[2]", e);
  }
}

// ── Stage 3: non-streaming WITH a tool — Dyad's critical capability ─────────
// Dyad sends `tools` on every call. If the model behind LiteLLM can't do
// OpenAI function-calling, this fails while stage 2 passes.
async function stage3() {
  console.log(`\n[3] generateText(model="${MODEL}") WITH tools`);
  try {
    const r = await generateText({
      model: provider(MODEL),
      maxRetries: 0,
      temperature: 0,
      messages: [
        { role: "user", content: "Use the get_weather tool for Paris." },
      ],
      tools: {
        get_weather: tool({
          description: "Get the weather for a city",
          inputSchema: z.object({ city: z.string() }),
          execute: async ({ city }) => ({ city, tempC: 21 }),
        }),
      },
    });
    const calls = r.toolCalls?.map((c) => c.toolName) ?? [];
    console.log(
      `  ✅ PASS toolCalls=${JSON.stringify(calls)} text=${JSON.stringify(
        (r.text || "").slice(0, 100),
      )}`,
    );
  } catch (e) {
    dumpError("[3]", e);
  }
}

// ── Stage 4: streaming, NO tools (Dyad always streams) ──────────────────────
async function stage4() {
  console.log(`\n[4] streamText(model="${MODEL}") no tools`);
  let streamErr;
  try {
    const r = streamText({
      model: provider(MODEL),
      maxRetries: 0,
      messages: [{ role: "user", content: "Count: 1 2 3" }],
      onError: ({ error }) => {
        streamErr = error;
      },
    });
    let out = "";
    for await (const part of r.fullStream) {
      if (part.type === "text-delta") out += part.text ?? part.delta ?? "";
      if (part.type === "error") streamErr = part.error;
    }
    if (streamErr) dumpError("[4]", streamErr);
    else console.log("  ✅ PASS streamed:", JSON.stringify(out.slice(0, 120)));
  } catch (e) {
    dumpError("[4]", streamErr ?? e);
  }
}

await stage1();
await stage2();
await stage3();
await stage4();
console.log("\nDone.");
