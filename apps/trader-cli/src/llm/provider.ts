import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

const provider = process.env.LLM_PROVIDER ?? "deepseek";

export function getModel() {
  const apiKey = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "LLM_API_KEY is required. Copy apps/trader-cli/.env.example to .env and set your key.",
    );
  }
  const model = process.env.LLM_MODEL ?? "deepseek-chat";
  switch (provider) {
    case "deepseek":
      return createOpenAI({
        baseURL: normalizeBaseUrl(
          process.env.LLM_BASE_URL ?? "https://api.deepseek.com/v1",
        ),
        apiKey,
      })(model);
    case "openrouter":
      return createOpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey,
      })(model);
    case "anthropic":
      return createAnthropic({ apiKey })(model);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

function normalizeBaseUrl(url: string): string {
  let base = url.replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) {
    base = base.slice(0, -"/chat/completions".length);
  }
  return base;
}
