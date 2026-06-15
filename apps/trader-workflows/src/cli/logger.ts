/**
 * Structured logger backed by pino.
 * Replaces console.log / console.error across the module.
 */

import pino from "pino";
import { config } from "../runtime/config.js";

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
