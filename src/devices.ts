import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Persistent durable device-token store backed by devices.json.
 * Only tokens issued via a successful pairing claim are ever added here, and
 * requireToken accepts ONLY tokens present in this store.
 */
export class DeviceStore {
  private tokens = new Set<string>();

  constructor(private readonly file: string) {}

  async load(): Promise<this> {
    try {
      const raw = await fs.readFile(this.file, "utf8");
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) this.tokens = new Set(arr.filter((t) => typeof t === "string"));
    } catch {
      // missing/corrupt file -> empty store
    }
    return this;
  }

  has(token: string): boolean {
    return typeof token === "string" && token.length > 0 && this.tokens.has(token);
  }

  async add(token: string): Promise<void> {
    this.tokens.add(token);
    await this.save();
  }

  async revokeAll(): Promise<void> {
    this.tokens.clear();
    await this.save();
  }

  list(): string[] {
    return [...this.tokens];
  }

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, `${JSON.stringify([...this.tokens], null, 2)}\n`, "utf8");
  }
}
