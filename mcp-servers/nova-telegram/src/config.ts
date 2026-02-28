import { readFileSync } from "node:fs";
import { join } from "node:path";

const NOVA_ROOT = join(import.meta.dirname, "..", "..", "..");

/** Load .env file into process.env (simple parser, no dependency needed). */
function loadEnv(): void {
  try {
    const envPath = join(NOVA_ROOT, ".env");
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional if env vars are set externally
  }
}

loadEnv();

export const config = {
  /** Telegram bot token from BotFather. */
  botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",

  /** Comma-separated list of allowed Telegram user IDs. */
  allowedUsers: (process.env.TELEGRAM_ALLOWED_USERS ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n) && n > 0),

  /** Max characters per Telegram message (API limit). */
  maxMessageLength: 4096,

  /** Rate limit: max requests per minute per user. */
  rateLimitPerMinute: 30,

  /** Claude CLI timeout in milliseconds (2 minutes). */
  claudeTimeoutMs: 120_000,

  /** Background task timeout in milliseconds (10 minutes). */
  taskTimeoutMs: 600_000,

  /** Working directory for claude CLI subprocess. */
  novaRoot: NOVA_ROOT,
} as const;
