/**
 * Tier Permission Helpers (shared with nova-agents and nova-mac)
 *
 * Utility functions for checking session tier permissions in tools
 */

export type SessionTier = 'orchestrator' | 'telegram' | 'scheduled' | 'background';

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
