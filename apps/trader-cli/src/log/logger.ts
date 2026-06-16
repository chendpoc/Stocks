/**
 * Structured logger backed by pino.
 * Diagnostics go to stderr; user output uses log/user.ts.
 */

import pino from "pino";

import { config } from "../config.js";

const isDev = process.env.NODE_ENV !== "production";

export const logger = isDev
    ? pino({
        level: config.logLevel,
        transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "HH:MM:ss", destination: 2 },
        },
    })
    : pino({ level: config.logLevel }, pino.destination(2));
