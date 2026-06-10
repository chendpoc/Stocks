import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

function normalizeBaseUrl(url: string): string {
  let base = url.replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) {
    base = base.slice(0, -"/chat/completions".length);
  }
  if (!/\/v\d+(\/|$)/.test(base) && /deepseek\.com/i.test(base)) {
    base = `${base}/v1`;
  }
  return base;
}

function createModel(modelId: string): LanguageModel {
  const provider = process.env.LLM_PROVIDER ?? "deepseek";
  const apiKey = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("LLM_API_KEY or OPENAI_API_KEY is required");
  }

  if (provider === "openrouter") {
    return createOpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
    })(modelId);
  }

  return createOpenAI({
    baseURL: normalizeBaseUrl(
      process.env.LLM_BASE_URL ?? "https://api.deepseek.com/v1",
    ),
    apiKey,
  })(modelId);
}

/** Flash tier — evidence builder, Proposer (§5) */
export function getFlashModel(): LanguageModel {
  const model =
    process.env.LLM_FLASH_MODEL ??
    process.env.LLM_MODEL ??
    "deepseek-chat";
  return createModel(model);
}

/** Pro tier — Judge (§5) */
export function getProModel(): LanguageModel {
  const model =
    process.env.LLM_PRO_MODEL ?? process.env.LLM_MODEL ?? "deepseek-chat";
  return createModel(model);
}

/** Pro + thinking tier — Opponent ToT (§5.2) */
export function getProThinkingModel(): LanguageModel {
  const model =
    process.env.LLM_PRO_THINKING_MODEL ??
    process.env.LLM_PRO_MODEL ??
    process.env.LLM_MODEL ??
    "deepseek-reasoner";
  return createModel(model);
}
