import { Bot, Context } from "grammy";
import { config } from "./config.js";
import {
  relayToClaude,
  spawnBackgroundTask,
  splitMessage,
} from "./relay.js";
import { addMessage, resetSession, getSession } from "./history.js";

let bot: Bot | null = null;
let running = false;

/** Per-user rate limit tracker: userId -> timestamps of recent requests. */
const rateLimits = new Map<number, number[]>();

function checkRateLimit(userId: number): boolean {
  const now = Date.now();
  const window = 60_000;
  const timestamps = (rateLimits.get(userId) ?? []).filter(
    (t) => now - t < window
  );

  if (timestamps.length >= config.rateLimitPerMinute) {
    rateLimits.set(userId, timestamps);
    return false;
  }

  timestamps.push(now);
  rateLimits.set(userId, timestamps);
  return true;
}

function isAuthorized(userId: number): boolean {
  if (config.allowedUsers.length === 0) return true;
  return config.allowedUsers.includes(userId);
}

/** Send a message to a specific chat, splitting if necessary. */
export async function sendMessage(
  chatId: number,
  text: string
): Promise<void> {
  if (!bot) throw new Error("Bot is not running");
  const chunks = splitMessage(text);
  for (const chunk of chunks) {
    await bot.api.sendMessage(chatId, chunk);
  }
}

/** Send a message to the first allowed user (proactive notifications). */
export async function sendToChief(text: string): Promise<void> {
  const chiefId = config.allowedUsers[0];
  if (!chiefId) throw new Error("No allowed users configured");
  await sendMessage(chiefId, text);
}

async function handleAuth(ctx: Context): Promise<boolean> {
  const userId = ctx.from?.id;
  if (!userId || !isAuthorized(userId)) {
    await ctx.reply("Access denied. This bot is private.");
    console.error(
      `[telegram] Unauthorized access attempt from user ${userId}`
    );
    return false;
  }
  return true;
}

// ─── Command Handlers ─────────────────────────────

async function handleStart(ctx: Context): Promise<void> {
  if (!(await handleAuth(ctx))) return;

  await ctx.reply(
    [
      "NOVA online, Chief.",
      "",
      "Send me any message and I'll handle it. Conversations carry context — I remember what we discussed.",
      "",
      "Commands:",
      "/status — System status",
      "/task <prompt> — Background task (I'll ping you when done)",
      "/tasks — List active background tasks",
      "/handoff — Save current context for cross-session pickup",
      "/catchup — Pull the latest session context from memory",
      "/new — Start a fresh conversation",
      "/help — Full command list",
    ].join("\n")
  );
}

async function handleHelp(ctx: Context): Promise<void> {
  if (!(await handleAuth(ctx))) return;

  await ctx.reply(
    [
      "NOVA Remote Access",
      "",
      "/start — Welcome message",
      "/status — CPU, memory, disk info",
      "/task <prompt> — Background task (up to 10 min, max 2 concurrent)",
      "/tasks — List active background tasks",
      "/handoff — Save session context to shared memory",
      "/catchup — Pull latest context from any session",
      "/new — Reset conversation (start fresh)",
      "/help — This message",
      "",
      "Text messages are relayed to Claude with full conversation context.",
      "I have access to all MCP tools — apps, Chrome, calendar, memory, agents.",
      "",
      "Responses over 4096 chars get split across messages.",
      "Regular messages timeout at 2 min; background tasks at 10 min.",
    ].join("\n")
  );
}

async function handleStatus(ctx: Context): Promise<void> {
  if (!(await handleAuth(ctx))) return;

  const userId = ctx.from!.id;
  await ctx.reply("Checking...");

  try {
    const response = await relayToClaude(
      "Give me a brief system status: CPU usage, memory usage, disk space. Use mac_system_info. Keep it short, 3-4 lines max.",
      userId
    );
    const chunks = splitMessage(response);
    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }
  } catch (err) {
    await ctx.reply(`Status check failed: ${(err as Error).message}`);
  }
}

async function handleNew(ctx: Context): Promise<void> {
  if (!(await handleAuth(ctx))) return;
  const userId = ctx.from!.id;
  await resetSession(userId);
  await ctx.reply("Fresh start, Chief. New conversation.");
}

async function handleTask(ctx: Context): Promise<void> {
  if (!(await handleAuth(ctx))) return;

  const userId = ctx.from!.id;
  const chatId = ctx.chat!.id;
  const text = ctx.message?.text;
  if (!text) return;

  const taskPrompt = text.replace(/^\/task\s*/, "").trim();
  if (!taskPrompt) {
    await ctx.reply(
      "Usage: /task <what you want done>\n\nExample: /task research the latest M4 Mac Mini benchmarks and write a summary"
    );
    return;
  }

  if (!checkRateLimit(userId)) {
    await ctx.reply("Rate limit hit. Hang on a sec.");
    return;
  }

  try {
    const agentId = await spawnBackgroundTask(taskPrompt, userId, chatId);
    await ctx.reply(
      `On it, Chief. I'll work on that in the background and ping you when it's done.\n\nTask ID: ${agentId}`
    );
    console.error(
      `[telegram] Background task ${agentId} spawned for user ${userId}`
    );
  } catch (err) {
    await ctx.reply(`${(err as Error).message}`);
  }
}

async function handleTasks(ctx: Context): Promise<void> {
  if (!(await handleAuth(ctx))) return;

  const userId = ctx.from!.id;
  const session = await getSession(userId);

  if (session.activeTasks.length === 0) {
    await ctx.reply("No background tasks running.");
    return;
  }

  const lines = session.activeTasks.map((id, i) => `  ${i + 1}. ${id}`);
  await ctx.reply(`Active tasks:\n${lines.join("\n")}`);
}

async function handleHandoff(ctx: Context): Promise<void> {
  if (!(await handleAuth(ctx))) return;

  const userId = ctx.from!.id;
  await ctx.replyWithChatAction("typing");

  try {
    const response = await relayToClaude(
      "The Chief wants a handoff. Summarize this Telegram conversation so far: what we discussed, key decisions, current state, and next steps. Then store it in helix-memory with category 'conversation' and tag 'handoff'. Keep the summary concise but complete.",
      userId
    );
    const chunks = splitMessage(response);
    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }
  } catch (err) {
    await ctx.reply(`Handoff failed: ${(err as Error).message}`);
  }
}

async function handleCatchup(ctx: Context): Promise<void> {
  if (!(await handleAuth(ctx))) return;

  const userId = ctx.from!.id;
  await ctx.replyWithChatAction("typing");

  try {
    const response = await relayToClaude(
      "The Chief wants to catch up. Use memory_recall to find the most recent handoff (search for 'handoff' in conversation category). Present the context summary so the Chief knows where things stand across all sessions.",
      userId
    );
    const chunks = splitMessage(response);
    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }
  } catch (err) {
    await ctx.reply(`Catchup failed: ${(err as Error).message}`);
  }
}

// ─── Main Message Handler ─────────────────────────

async function handleTextMessage(ctx: Context): Promise<void> {
  if (!(await handleAuth(ctx))) return;

  const userId = ctx.from!.id;
  const text = ctx.message?.text;
  if (!text) return;

  if (!checkRateLimit(userId)) {
    await ctx.reply("Slow down — rate limit hit. Wait a moment.");
    return;
  }

  console.error(
    `[telegram] Message from ${userId}: ${text.slice(0, 80)}...`
  );
  await ctx.replyWithChatAction("typing");

  // Record user message
  await addMessage(userId, "user", text);

  try {
    const response = await relayToClaude(text, userId);
    await addMessage(userId, "assistant", response);

    const chunks = splitMessage(response);
    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }
  } catch (err) {
    const errorMsg = (err as Error).message;

    // If resume failed, reset session and retry once
    if (
      errorMsg.includes("exited with code") &&
      !errorMsg.includes("timed out")
    ) {
      console.error(
        "[telegram] Session resume may have failed, resetting and retrying..."
      );
      await resetSession(userId);

      try {
        const response = await relayToClaude(text, userId);
        await addMessage(userId, "assistant", response);

        const chunks = splitMessage(response);
        for (const chunk of chunks) {
          await ctx.reply(chunk);
        }
        return;
      } catch (retryErr) {
        await ctx.reply(
          `Error (retry failed): ${(retryErr as Error).message}`
        );
        return;
      }
    }

    if (errorMsg.includes("timed out") || errorMsg.includes("SIGTERM")) {
      await ctx.reply(
        "That one timed out. The 2-minute limit kicked in. Try breaking it into smaller asks, or use /task for longer work."
      );
    } else {
      await ctx.reply(`Error: ${errorMsg}`);
    }
  }
}

// ─── Bot Lifecycle ────────────────────────────────

export function startBot(): string {
  if (running && bot) return "Bot is already running.";

  if (!config.botToken) {
    return "TELEGRAM_BOT_TOKEN not set in .env";
  }

  bot = new Bot(config.botToken);

  bot.command("start", handleStart);
  bot.command("help", handleHelp);
  bot.command("status", handleStatus);
  bot.command("new", handleNew);
  bot.command("task", handleTask);
  bot.command("tasks", handleTasks);
  bot.command("handoff", handleHandoff);
  bot.command("catchup", handleCatchup);
  bot.on("message:text", handleTextMessage);

  bot.catch((err) => {
    console.error("[telegram] Bot error:", err.message);
  });

  bot.start({
    onStart: () => {
      console.error("[telegram] Bot started, polling for messages...");
    },
  });

  running = true;
  return "Telegram bot started. Polling for messages.";
}

export function stopBot(): string {
  if (!running || !bot) return "Bot is not running.";

  bot.stop();
  bot = null;
  running = false;
  return "Telegram bot stopped.";
}

export function botStatus(): {
  running: boolean;
  allowedUsers: number[];
  rateLimitPerMinute: number;
} {
  return {
    running,
    allowedUsers: config.allowedUsers,
    rateLimitPerMinute: config.rateLimitPerMinute,
  };
}
