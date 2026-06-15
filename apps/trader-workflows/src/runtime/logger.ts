/**
 * Structured logger backed by pino.
 * Shared by runtime, orchestration, api, and cli (re-export).
 * stdout JSON envelope stays on printEnvelope — diagnostics go to stderr via pino.
 */

import pino from "pino";

import { config } from "./config.js";

export const logger = pino({
  level: config.logLevel,
  ...(process.env.NODE_ENV !== "production"
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss" },
        },
      }
    : {}),
});
