/**
 * Global Agent Orchestrator
 *
 * Coordinates all agent spawns across all paths (main, Telegram, scheduled)
 * Enforces global limits and tracks agent lifecycle
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const NOVA_ROOT = process.env.NOVA_ROOT || process.cwd();
const STATE_PATH = join(NOVA_ROOT, 'agents', 'orchestrator-state.json');

export type SessionTier = 'orchestrator' | 'telegram' | 'scheduled' | 'background';
export type AgentStatus = 'running' | 'completed' | 'failed';

export interface AgentInfo {
  tier: SessionTier;
  parent_id?: string;
  depth: number;
  spawn_path: 'main' | 'telegram' | 'scheduled';
  started_at: string;
  status: AgentStatus;
  task_summary?: string;
}

export interface OrchestratorState {
  agents: Record<string, AgentInfo>;
  counters: {
    total_active: number;
    by_tier: Record<SessionTier, number>;
  };
  rate_limits: {
    spawns_last_hour: Array<{ timestamp: string; agent_id: string }>;
    last_cleanup: string | null;
  };
  metadata: {
    created_at: string;
    last_updated: string | null;
    schema_version: string;
  };
}

const INITIAL_STATE: OrchestratorState = {
  agents: {},
  counters: {
    total_active: 0,
    by_tier: {
      orchestrator: 0,
      telegram: 0,
      scheduled: 0,
      background: 0,
    },
  },
  rate_limits: {
    spawns_last_hour: [],
    last_cleanup: null,
  },
  metadata: {
    created_at: new Date().toISOString(),
    last_updated: null,
    schema_version: '1.0.0',
  },
};

// Safety limits from config/safety.json
const LIMITS = {
  MAX_TOTAL_AGENTS: 6,
  MAX_DEPTH: 2,
  MAX_SPAWNS_PER_HOUR: 100,
  RATE_LIMIT_WINDOW_MS: 60 * 60 * 1000, // 1 hour
};

/**
 * Read orchestrator state from disk
 * Creates initial state if file doesn't exist
 */
export function readOrchestratorState(): OrchestratorState {
  try {
    if (!existsSync(STATE_PATH)) {
      writeOrchestratorState(INITIAL_STATE);
      return INITIAL_STATE;
    }

    const data = readFileSync(STATE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to read orchestrator state, using initial state:', error);
    return INITIAL_STATE;
  }
}

/**
 * Write orchestrator state to disk
 */
export function writeOrchestratorState(state: OrchestratorState): void {
  try {
    state.metadata.last_updated = new Date().toISOString();
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to write orchestrator state:', error);
    throw new Error('Orchestrator state write failed');
  }
}

/**
 * Clean up stale entries from rate limit tracking
 */
function cleanupRateLimits(state: OrchestratorState): void {
  const now = Date.now();
  const cutoff = now - LIMITS.RATE_LIMIT_WINDOW_MS;

  state.rate_limits.spawns_last_hour = state.rate_limits.spawns_last_hour.filter(
    (entry) => new Date(entry.timestamp).getTime() > cutoff
  );

  state.rate_limits.last_cleanup = new Date().toISOString();
}

/**
 * Register a new agent spawn
 * @throws Error if spawn would violate limits
 */
export function incrementAgentCount(
  agentId: string,
  tier: SessionTier,
  depth: number,
  spawnPath: 'main' | 'telegram' | 'scheduled',
  parentId?: string,
  taskSummary?: string
): void {
  const state = readOrchestratorState();

  // Clean up old rate limit entries
  cleanupRateLimits(state);

  // Check global agent limit
  if (state.counters.total_active >= LIMITS.MAX_TOTAL_AGENTS) {
    throw new Error(
      `Global agent limit reached: ${state.counters.total_active}/${LIMITS.MAX_TOTAL_AGENTS} active agents`
    );
  }

  // Check depth limit
  if (depth > LIMITS.MAX_DEPTH) {
    throw new Error(
      `Agent depth limit exceeded: depth ${depth} > max ${LIMITS.MAX_DEPTH}`
    );
  }

  // Check rate limit
  if (state.rate_limits.spawns_last_hour.length >= LIMITS.MAX_SPAWNS_PER_HOUR) {
    throw new Error(
      `Rate limit exceeded: ${state.rate_limits.spawns_last_hour.length} spawns in last hour (max ${LIMITS.MAX_SPAWNS_PER_HOUR})`
    );
  }

  // Register agent
  state.agents[agentId] = {
    tier,
    parent_id: parentId,
    depth,
    spawn_path: spawnPath,
    started_at: new Date().toISOString(),
    status: 'running',
    task_summary: taskSummary,
  };

  // Update counters
  state.counters.total_active += 1;
  state.counters.by_tier[tier] += 1;

  // Track rate limit
  state.rate_limits.spawns_last_hour.push({
    timestamp: new Date().toISOString(),
    agent_id: agentId,
  });

  writeOrchestratorState(state);

  console.log(
    `[Orchestrator] Registered agent ${agentId} (tier: ${tier}, depth: ${depth}, total active: ${state.counters.total_active})`
  );
}

/**
 * Unregister an agent when it completes or fails
 */
export function decrementAgentCount(agentId: string, status: 'completed' | 'failed'): void {
  const state = readOrchestratorState();

  const agent = state.agents[agentId];
  if (!agent) {
    console.warn(`[Orchestrator] Attempted to decrement unknown agent: ${agentId}`);
    return;
  }

  if (agent.status !== 'running') {
    console.warn(
      `[Orchestrator] Agent ${agentId} already finalized with status: ${agent.status}`
    );
    return;
  }

  // Update agent status
  agent.status = status;

  // Update counters
  state.counters.total_active -= 1;
  state.counters.by_tier[agent.tier] -= 1;

  writeOrchestratorState(state);

  console.log(
    `[Orchestrator] Unregistered agent ${agentId} (status: ${status}, total active: ${state.counters.total_active})`
  );
}

/**
 * Check if spawning an agent is allowed
 * @throws Error with detailed message if spawn would violate limits
 */
export function checkSpawnAllowed(
  tier: SessionTier,
  depth: number,
  parentId?: string
): void {
  const state = readOrchestratorState();

  // Clean up old rate limit entries
  cleanupRateLimits(state);

  // Check global agent limit
  if (state.counters.total_active >= LIMITS.MAX_TOTAL_AGENTS) {
    throw new Error(
      `Cannot spawn agent: global limit reached (${state.counters.total_active}/${LIMITS.MAX_TOTAL_AGENTS} active)`
    );
  }

  // Check depth limit
  if (depth > LIMITS.MAX_DEPTH) {
    throw new Error(
      `Cannot spawn agent: depth limit exceeded (${depth} > ${LIMITS.MAX_DEPTH})`
    );
  }

  // Check rate limit
  if (state.rate_limits.spawns_last_hour.length >= LIMITS.MAX_SPAWNS_PER_HOUR) {
    throw new Error(
      `Cannot spawn agent: rate limit exceeded (${state.rate_limits.spawns_last_hour.length} spawns in last hour)`
    );
  }

  // Verify parent exists if specified
  if (parentId && !state.agents[parentId]) {
    console.warn(`[Orchestrator] Parent agent ${parentId} not found in state`);
  }
}

/**
 * Get current rate limit status
 */
export function getRateLimitStatus(): {
  spawns_last_hour: number;
  remaining: number;
  window_ms: number;
} {
  const state = readOrchestratorState();
  cleanupRateLimits(state);

  return {
    spawns_last_hour: state.rate_limits.spawns_last_hour.length,
    remaining: LIMITS.MAX_SPAWNS_PER_HOUR - state.rate_limits.spawns_last_hour.length,
    window_ms: LIMITS.RATE_LIMIT_WINDOW_MS,
  };
}

/**
 * Get orchestrator statistics
 */
export function getOrchestratorStats(): {
  total_active: number;
  by_tier: Record<SessionTier, number>;
  max_agents: number;
  max_depth: number;
  rate_limit: ReturnType<typeof getRateLimitStatus>;
} {
  const state = readOrchestratorState();

  return {
    total_active: state.counters.total_active,
    by_tier: state.counters.by_tier,
    max_agents: LIMITS.MAX_TOTAL_AGENTS,
    max_depth: LIMITS.MAX_DEPTH,
    rate_limit: getRateLimitStatus(),
  };
}

/**
 * Get all active agents
 */
export function getActiveAgents(): Array<{ id: string; info: AgentInfo }> {
  const state = readOrchestratorState();

  return Object.entries(state.agents)
    .filter(([_, info]) => info.status === 'running')
    .map(([id, info]) => ({ id, info }));
}
