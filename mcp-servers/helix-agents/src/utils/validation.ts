/**
 * Pre-Spawn Validation Layer
 *
 * Validates inputs at orchestrator level before spawning agents
 * Prevents injection attacks, path traversal, and dangerous operations
 */

import type { SessionTier } from './orchestrator.js';

/**
 * Validate task prompt for shell injection patterns
 * Orchestrator tier skips validation (NOVA is trusted)
 */
export function validateTaskPrompt(task: string, tier: SessionTier): void {
  if (tier === 'orchestrator') {
    return; // Skip validation for NOVA herself
  }

  // Shell injection patterns
  const dangerousPatterns: Array<{ pattern: RegExp; description: string }> = [
    { pattern: /;\s*(rm|sudo|kill|chmod|chown|dd)\b/i, description: 'destructive command' },
    { pattern: /\|\s*(curl|wget|nc|ncat|telnet)\b/i, description: 'network command in pipe' },
    { pattern: /`[^`]*`/, description: 'backtick command substitution' },
    { pattern: /\$\([^)]*\)/, description: '$() command substitution' },
    { pattern: /&&\s*(rm|sudo|kill)\b/i, description: 'chained destructive command' },
    { pattern: />\s*\/dev\/(null|zero|random)/i, description: 'device file redirect' },
    { pattern: /mkfifo|mknod/i, description: 'special file creation' },
    { pattern: /\/proc\/self/i, description: '/proc/self access' },
    { pattern: /bash\s+-[cip]/i, description: 'bash execution flags' },
  ];

  for (const { pattern, description } of dangerousPatterns) {
    if (pattern.test(task)) {
      throw new Error(
        `Task validation failed: contains ${description}. Pattern: ${pattern.source}`
      );
    }
  }
}

/**
 * Validate file path for directory traversal and restricted paths
 */
export function validateFilePath(path: string, tier: SessionTier): void {
  if (tier === 'orchestrator') {
    return; // Orchestrator has full access
  }

  // Path traversal
  if (path.includes('..') || path.includes('./') || path.includes('.\\')) {
    throw new Error(`Path validation failed: path traversal detected in "${path}"`);
  }

  // Null byte injection
  if (path.includes('\0')) {
    throw new Error('Path validation failed: null byte detected');
  }

  // Restricted system paths (read-only or forbidden)
  const restrictedPaths = [
    '/System',
    '/Library/LaunchDaemons',
    '/Library/LaunchAgents',
    '/usr',
    '/bin',
    '/sbin',
    '/etc',
    '/var/root',
    '/private/etc',
    '/private/var',
  ];

  for (const restricted of restrictedPaths) {
    if (path.startsWith(restricted)) {
      throw new Error(
        `Path validation failed: access to ${restricted} not allowed for tier ${tier}`
      );
    }
  }

  // Background tier has even more restrictions
  if (tier === 'background') {
    const allowedPrefixes = [
      process.env.NOVA_ROOT || process.cwd(),
      '/tmp',
      process.env.HOME + '/Documents',
      process.env.HOME + '/Desktop',
    ];

    const isAllowed = allowedPrefixes.some((prefix) => path.startsWith(prefix));
    if (!isAllowed) {
      throw new Error(
        `Path validation failed: background tier can only access NOVA_ROOT, /tmp, ~/Documents, ~/Desktop`
      );
    }
  }
}

/**
 * Validate URL for dangerous protocols
 */
export function validateURL(url: string, tier: SessionTier): void {
  if (tier === 'orchestrator') {
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`URL validation failed: malformed URL "${url}"`);
  }

  // Dangerous protocols
  const blockedProtocols = ['file:', 'javascript:', 'data:', 'vbscript:', 'about:'];
  if (blockedProtocols.includes(parsed.protocol)) {
    throw new Error(
      `URL validation failed: protocol ${parsed.protocol} not allowed for tier ${tier}`
    );
  }

  // Local network access restrictions for background tier
  if (tier === 'background' || tier === 'scheduled') {
    const hostname = parsed.hostname.toLowerCase();

    // Block localhost variations
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.startsWith('169.254.') || // Link-local
      hostname.endsWith('.local')
    ) {
      throw new Error(
        `URL validation failed: localhost access not allowed for tier ${tier}`
      );
    }

    // Block private IP ranges
    const privateRanges = [
      /^10\./, // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
      /^192\.168\./, // 192.168.0.0/16
    ];

    for (const range of privateRanges) {
      if (range.test(hostname)) {
        throw new Error(
          `URL validation failed: private IP range access not allowed for tier ${tier}`
        );
      }
    }
  }
}

/**
 * Validate app name (prevent injection through AppleScript)
 */
export function validateAppName(appName: string, tier: SessionTier): void {
  if (tier === 'orchestrator') {
    return;
  }

  // AppleScript injection patterns
  if (appName.includes('"') || appName.includes("'") || appName.includes('\\')) {
    throw new Error('App name validation failed: quote characters not allowed');
  }

  // Command separators
  if (appName.includes(';') || appName.includes('&') || appName.includes('|')) {
    throw new Error('App name validation failed: command separators not allowed');
  }

  // Newlines
  if (appName.includes('\n') || appName.includes('\r')) {
    throw new Error('App name validation failed: newline characters not allowed');
  }

  // Background tier: allowlist only
  if (tier === 'background') {
    const allowedApps = [
      'Safari',
      'Google Chrome',
      'Firefox',
      'Music',
      'Notes',
      'Calendar',
      'Reminders',
      'Mail',
    ];

    if (!allowedApps.includes(appName)) {
      throw new Error(
        `App validation failed: background tier can only access: ${allowedApps.join(', ')}`
      );
    }
  }
}

/**
 * Validate shell command (for Bash tool, if tier-restricted)
 */
export function validateShellCommand(command: string, tier: SessionTier): void {
  if (tier === 'orchestrator') {
    return;
  }

  // Background and scheduled tiers should NOT have shell access at all
  if (tier === 'background' || tier === 'scheduled') {
    throw new Error(`Shell access denied: tier ${tier} cannot execute shell commands`);
  }

  // Telegram tier: basic validation
  const destructiveCommands = [
    /\brm\s+-rf\s+\//,
    /\bdd\s+if=/,
    /\bsudo\s+/,
    /\bmkfs/,
    /\bformat\b/,
    /\b:\(\)\{.*\};\s*:/i, // Fork bomb
  ];

  for (const pattern of destructiveCommands) {
    if (pattern.test(command)) {
      throw new Error(
        `Shell command validation failed: potentially destructive command detected`
      );
    }
  }
}

/**
 * Sanitize string for safe logging (prevent log injection)
 */
export function sanitizeForLog(input: string): string {
  return input
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/\r\n|\r|\n/g, ' ') // Replace newlines with spaces
    .slice(0, 500); // Truncate to prevent log flooding
}
