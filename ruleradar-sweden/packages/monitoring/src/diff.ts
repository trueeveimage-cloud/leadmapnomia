import { diffLines } from "diff";

export interface DiffResult {
  excerpt: string;
  changedRatio: number;
  addedLines: number;
  removedLines: number;
}

export function buildLineDiff(previousText: string, currentText: string, maxLines = 18): DiffResult {
  const parts = diffLines(previousText, currentText);
  const previousLineCount = Math.max(previousText.split("\n").filter(Boolean).length, 1);
  const changed: string[] = [];
  let addedLines = 0;
  let removedLines = 0;

  for (const part of parts) {
    const lines = part.value.split("\n").map((line) => line.trim()).filter(Boolean);
    if (part.added) {
      addedLines += lines.length;
      changed.push(...lines.map((line) => `+ ${line}`));
    } else if (part.removed) {
      removedLines += lines.length;
      changed.push(...lines.map((line) => `- ${line}`));
    }
    if (changed.length >= maxLines) break;
  }

  return {
    excerpt: changed.slice(0, maxLines).join("\n") || "Content hash changed, but no concise line-level excerpt was produced.",
    changedRatio: Number(((addedLines + removedLines) / previousLineCount).toFixed(4)),
    addedLines,
    removedLines
  };
}
