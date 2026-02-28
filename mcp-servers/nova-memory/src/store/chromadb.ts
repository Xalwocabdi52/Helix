import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

const NOVA_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const MEMORIES_FILE = join(NOVA_ROOT, "memory", "memories.json");

export interface MemoryEntry {
  id: string;
  content: string;
  category: string;
  timestamp: string;
  metadata?: Record<string, string>;
}

interface MemoryStore {
  memories: MemoryEntry[];
}

async function loadStore(): Promise<MemoryStore> {
  try {
    const data = await readFile(MEMORIES_FILE, "utf-8");
    return JSON.parse(data) as MemoryStore;
  } catch {
    return { memories: [] };
  }
}

async function saveStore(store: MemoryStore): Promise<void> {
  await mkdir(dirname(MEMORIES_FILE), { recursive: true });
  await writeFile(MEMORIES_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export async function addMemory(entry: MemoryEntry): Promise<void> {
  const store = await loadStore();
  store.memories.push(entry);
  await saveStore(store);
}

/**
 * Score a memory against a query using keyword matching.
 * Returns a value between 0 (perfect match) and 1 (no match),
 * matching ChromaDB's distance convention.
 */
function scoreMemory(memory: MemoryEntry, queryTerms: string[]): number {
  const text = memory.content.toLowerCase();
  const tags = memory.metadata?.tags?.toLowerCase() || "";
  const combined = `${text} ${tags} ${memory.category}`;

  let matched = 0;
  for (const term of queryTerms) {
    if (combined.includes(term)) matched++;
  }

  if (queryTerms.length === 0) return 0.5;
  // Convert match ratio to distance (0 = perfect, 1 = no match)
  return 1 - matched / queryTerms.length;
}

export async function queryMemories(
  query: string,
  options: { category?: string; limit?: number } = {}
): Promise<{
  ids: string[];
  documents: (string | null)[];
  distances: (number | null)[];
  metadatas: (Record<string, unknown> | null)[];
}> {
  const store = await loadStore();
  let candidates = store.memories;

  if (options.category) {
    candidates = candidates.filter((m) => m.category === options.category);
  }

  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);

  const scored = candidates
    .map((m) => ({ entry: m, distance: scoreMemory(m, queryTerms) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, options.limit || 5);

  return {
    ids: scored.map((s) => s.entry.id),
    documents: scored.map((s) => s.entry.content),
    distances: scored.map((s) => s.distance),
    metadatas: scored.map((s) => ({
      category: s.entry.category,
      timestamp: s.entry.timestamp,
      ...s.entry.metadata,
    })),
  };
}

export async function deleteMemory(id: string): Promise<void> {
  const store = await loadStore();
  store.memories = store.memories.filter((m) => m.id !== id);
  await saveStore(store);
}

export async function getMemoryById(
  id: string
): Promise<MemoryEntry | null> {
  const store = await loadStore();
  return store.memories.find((m) => m.id === id) || null;
}
