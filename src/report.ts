import type { ReportItem, ReportLevel } from "./types.js";

export class BuildReport {
  readonly items: ReportItem[] = [];

  add(level: ReportLevel, code: string, message: string, details?: string[]): void {
    this.items.push({ level, code, message, details });
  }

  info(code: string, message: string, details?: string[]): void {
    this.add("INFO", code, message, details);
  }

  warn(code: string, message: string, details?: string[]): void {
    this.add("WARNING", code, message, details);
  }

  error(code: string, message: string, details?: string[]): void {
    this.add("ERROR", code, message, details);
  }

  count(level: ReportLevel): number {
    return this.items.filter((item) => item.level === level).length;
  }

  render(header: string[]): string {
    const lines = [
      "TECH IMAGE TIER INFO - BUILD REPORT",
      "===================================",
      ...header,
      `Warnings: ${this.count("WARNING")}`,
      `Errors: ${this.count("ERROR")}`,
      "",
    ];
    for (const item of this.items) {
      lines.push(`[${item.level}] ${item.code}`, item.message);
      for (const detail of item.details ?? []) lines.push(`  - ${detail}`);
      lines.push("");
    }
    return `${lines.join("\n")}\n`;
  }
}
