/**
 * Tier Permission Helpers
 *
 * Utility functions for checking session tier permissions in tools
 * Last line of defense after orchestrator-level validation
 */

import type { SessionTier } from './orchestrator.js';

/**
 * Get current session tier from environment
 * Defaults to 'orchestrator' for main NOVA session
 */
export function getCurrentTier(): SessionTier {
  const tier = process.env.NOVA_SESSION_TIER;

  if (!tier) {
    // No tier set = main NOVA session (orchestrator)
    return 'orchestrator';
  }

  const validTiers: SessionTier[] = ['orchestrator', 'telegram', 'scheduled', 'background'];
  if (!validTiers.includes(tier as SessionTier)) {
    console.warn(`Invalid NOVA_SESSION_TIER: ${tier}, defaulting to 'background'`);
    return 'background';
  }

  return tier as SessionTier;
}

/**
 * Check if current tier has permission for an operation
 * @param operation - Description of the operation (for error messages)
 * @param allowedTiers - Array of tiers that can perform this operation
 * @throws Error if current tier is not allowed
 */
export function requireTier(operation: string, allowedTiers: SessionTier[]): void {
  const currentTier = getCurrentTier();

  if (!allowedTiers.includes(currentTier)) {
    throw new Error(
      `Permission denied: ${operation} requires tier [${allowedTiers.join(', ')}], current tier is ${currentTier}`
    );
  }
}

/**
 * Check if current tier can perform destructive operations
 */
export function canPerformDestructive(): boolean {
  const tier = getCurrentTier();
  return tier === 'orchestrator' || tier === 'telegram';
}

/**
 * Check if current tier can spawn agents
 */
export function canSpawnAgents(): boolean {
  const tier = getCurrentTier();
  return tier !== 'background'; // All tiers except background can spawn
}

/**
 * Check if current tier can execute shell commands
 */
export function canExecuteShell(): boolean {
  const tier = getCurrentTier();
  return tier === 'orchestrator' || tier === 'telegram';
}

/**
 * Check if current tier can write to memory
 */
export function canWriteMemory(): boolean {
  const tier = getCurrentTier();
  return tier !== 'background'; // Background is read-only
}

/**
 * Check if current tier can control applications
 */
export function canControlApps(): boolean {
  const tier = getCurrentTier();
  return tier === 'orchestrator' || tier === 'telegram';
}

/**
 * Check if current tier can modify Chrome (navigate, click, fill)
 */
export function canModifyChrome(): boolean {
  const tier = getCurrentTier();
  // Orchestrator and telegram can modify
  // Scheduled can read-only
  // Background has no access
  return tier === 'orchestrator' || tier === 'telegram';
}

/**
 * Tier permission matrix for quick reference
 */
export const TIER_PERMISSIONS = {
  app_control: ['orchestrator', 'telegram'],
  chrome_navigation: ['orchestrator', 'telegram'],
  chrome_read: ['orchestrator', 'telegram', 'scheduled'],
  shell_execution: ['orchestrator', 'telegram'],
  memory_write: ['orchestrator', 'telegram', 'scheduled'],
  agent_spawn: ['orchestrator', 'telegram', 'scheduled'],
  filesystem_write: ['orchestrator', 'telegram'],
  filesystem_read: ['orchestrator', 'telegram', 'scheduled', 'background'],
} as const;

/**
 * Get human-readable tier description
 */
export function getTierDescription(tier: SessionTier): string {
  const descriptions: Record<SessionTier, string> = {
    orchestrator: 'Main NOVA session (full access)',
    telegram: 'Remote Telegram access (full access with confirmations)',
    scheduled: 'Autonomous scheduled task (read-mostly, memory writes allowed)',
    background: 'Background worker (read-only, cannot spawn)',
  };

  return descriptions[tier];
}

/**
 * Log tier check for debugging
 */
export function logTierCheck(operation: string, allowed: boolean): void {
  const tier = getCurrentTier();
  const status = allowed ? '✓ ALLOWED' : '✗ DENIED';

  console.log(`[TierCheck] ${status} | ${operation} | tier=${tier}`);
}
