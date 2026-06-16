import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

import { config } from "../config.js";

export function getModel() {
  const apiKey = config.llmApiKey || config.openaiApiKey;
  if (!apiKey) {
    throw new Error(
      "LLM_API_KEY is required. Copy apps/trader-cli/.env.example to .env and set your key.",
    );
  }
  switch (config.llmProvider) {
    case "deepseek":
      return createOpenAI({
        baseURL: normalizeBaseUrl(config.llmBaseUrl),
        apiKey,
      })(config.llmModel);
    case "openrouter":
      return createOpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey,
      })(config.llmModel);
    case "anthropic":
      return createAnthropic({ apiKey })(config.llmModel);
    default:
      throw new Error(`Unknown LLM provider: ${config.llmProvider}`);
  }
}

function normalizeBaseUrl(url: string): string {
  let base = url.replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) {
    base = base.slice(0, -"/chat/completions".length);
  }
  return base;
}
