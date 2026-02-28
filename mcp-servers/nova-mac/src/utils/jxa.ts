import { runJXA } from "./applescript.js";

/**
 * Run a JXA script that returns a JSON-serializable value.
 * Wraps the script in JSON.stringify for easy parsing.
 */
export async function runJXAJson<T>(script: string): Promise<T> {
  const wrapped = `JSON.stringify((function() { ${script} })())`;
  const result = await runJXA(wrapped);
  if (!result.success) {
    throw new Error(`JXA error: ${result.error}`);
  }
  return JSON.parse(result.output) as T;
}
