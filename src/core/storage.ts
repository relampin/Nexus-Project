import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export class JsonFileStore<T> {
  constructor(private readonly filePath: string, private readonly fallbackValue: T) {}

  read(): T {
    this.ensureParentDirectory();

    if (!existsSync(this.filePath)) {
      this.write(this.fallbackValue);
      return this.fallbackValue;
    }

    const raw = readFileSync(this.filePath, "utf-8");
    return JSON.parse(raw) as T;
  }

  write(value: T) {
    this.ensureParentDirectory();
    writeFileSync(this.filePath, JSON.stringify(value, null, 2), "utf-8");
  }

  private ensureParentDirectory() {
    mkdirSync(dirname(this.filePath), { recursive: true });
  }
}
