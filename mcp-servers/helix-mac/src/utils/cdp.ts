import CDP from "chrome-remote-interface";

let client: CDP.Client | null = null;
let currentTargetId: string | null = null;

/**
 * Get a CDP connection to the currently active Chrome tab.
 * Reconnects automatically if the active tab has changed.
 */
export async function getCDPClient(): Promise<CDP.Client> {
  const activeTarget = await getActiveTarget();

  // Reuse existing connection if still pointing at the active tab
  if (client && currentTargetId === activeTarget.id) {
    try {
      await client.Browser.getVersion();
      return client;
    } catch {
      client = null;
      currentTargetId = null;
    }
  }

  // Close stale connection
  if (client) {
    try { await client.close(); } catch { /* ignore */ }
    client = null;
  }

  try {
    client = await CDP({ port: 9222, target: activeTarget.id });
    currentTargetId = activeTarget.id;
    return client;
  } catch (err: unknown) {
    const error = err as Error;
    throw new Error(
      `Cannot connect to Chrome DevTools Protocol on port 9222. ` +
        `Make sure Chrome is running with --remote-debugging-port=9222. ` +
        `Error: ${error.message}`
    );
  }
}

/**
 * Find the currently active (frontmost) page target.
 * Falls back to the first page target if none is explicitly active.
 */
async function getActiveTarget(): Promise<CDP.Target> {
  const targets = await CDP.List({ port: 9222 });
  const pages = targets.filter((t: CDP.Target) => t.type === "page");

  if (pages.length === 0) {
    throw new Error("No Chrome page targets found. Open a tab first.");
  }

  // CDP doesn't have an "active" flag, but the first page target
  // returned is typically the most recently focused one.
  return pages[0];
}

/**
 * Close the CDP connection.
 */
export async function closeCDP(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    currentTargetId = null;
  }
}

/**
 * Get a list of available CDP targets (tabs/pages).
 */
export async function listTargets(): Promise<CDP.Target[]> {
  return CDP.List({ port: 9222 });
}

/**
 * Connect to a specific tab by target ID.
 */
export async function connectToTarget(targetId: string): Promise<CDP.Client> {
  return CDP({ port: 9222, target: targetId });
}
