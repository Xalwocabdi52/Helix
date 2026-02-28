import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Simple JSON file storage for structured data (preferences, patterns, profiles).
 */
export class StructuredStore {
  constructor(private filePath: string) {}

  async read<T extends Record<string, unknown>>(): Promise<T> {
    try {
      const data = await readFile(this.filePath, "utf-8");
      return JSON.parse(data) as T;
    } catch {
      return {} as T;
    }
  }

  async write<T extends Record<string, unknown>>(data: T): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    const data = await this.read();
    return (data[key] as T) ?? defaultValue;
  }

  async set(key: string, value: unknown): Promise<void> {
    const data = await this.read();
    data[key] = value;
    await this.write(data);
  }

  async delete(key: string): Promise<boolean> {
    const data = await this.read();
    if (key in data) {
      delete data[key];
      await this.write(data);
      return true;
    }
    return false;
  }
}
