import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { config } from "./config.js";

const SESSIONS_FILE = join(config.novaRoot, "agents", "telegram-sessions.json");
const MAX_MESSAGES = 20;

export interface TelegramMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
}

export interface UserSession {
  userId: number;
  claudeSessionId: string | null;
  messages: TelegramMessage[];
  activeTasks: string[];
  lastActivity: string;
}

interface SessionStore {
  sessions: Record<number, UserSession>;
}

async function loadStore(): Promise<SessionStore> {
  try {
    const data = await readFile(SESSIONS_FILE, "utf-8");
    return JSON.parse(data) as SessionStore;
  } catch {
    return { sessions: {} };
  }
}

async function saveStore(store: SessionStore): Promise<void> {
  await mkdir(dirname(SESSIONS_FILE), { recursive: true });
  await writeFile(SESSIONS_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function newSession(userId: number): UserSession {
  return {
    userId,
    claudeSessionId: null,
    messages: [],
    activeTasks: [],
    lastActivity: new Date().toISOString(),
  };
}

export async function getSession(userId: number): Promise<UserSession> {
  const store = await loadStore();
  return store.sessions[userId] || newSession(userId);
}

export async function updateSession(session: UserSession): Promise<void> {
  const store = await loadStore();
  session.lastActivity = new Date().toISOString();
  store.sessions[session.userId] = session;
  await saveStore(store);
}

export async function addMessage(
  userId: number,
  role: "user" | "assistant",
  text: string
): Promise<UserSession> {
  const session = await getSession(userId);
  session.messages.push({ role, text, timestamp: new Date().toISOString() });

  // Keep rolling window
  if (session.messages.length > MAX_MESSAGES) {
    session.messages = session.messages.slice(-MAX_MESSAGES);
  }

  await updateSession(session);
  return session;
}

export async function getClaudeSessionId(
  userId: number
): Promise<string | null> {
  const session = await getSession(userId);
  return session.claudeSessionId;
}

export async function setClaudeSessionId(
  userId: number,
  sessionId: string
): Promise<void> {
  const session = await getSession(userId);
  session.claudeSessionId = sessionId;
  await updateSession(session);
}

export async function resetSession(userId: number): Promise<void> {
  const session = await getSession(userId);
  session.claudeSessionId = null;
  session.messages = [];
  // Keep activeTasks — don't kill running background work
  await updateSession(session);
}

export async function addActiveTask(
  userId: number,
  agentId: string
): Promise<void> {
  const session = await getSession(userId);
  session.activeTasks.push(agentId);
  await updateSession(session);
}

export async function removeActiveTask(
  userId: number,
  agentId: string
): Promise<void> {
  const session = await getSession(userId);
  session.activeTasks = session.activeTasks.filter((id) => id !== agentId);
  await updateSession(session);
}
