import { readFile } from "node:fs/promises";

function scoreMojibake(text: string): number {
  const suspiciousMatches = text.match(/[ÃÂ�]/g);
  return suspiciousMatches ? suspiciousMatches.length : 0;
}

export function decodeMermaidSource(buffer: Buffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const windows1252 = new TextDecoder("windows-1252", { fatal: false }).decode(buffer);

  if (scoreMojibake(windows1252) < scoreMojibake(utf8)) {
    return windows1252;
  }

  return utf8;
}

export async function readMermaidSource(inputPath: string): Promise<string> {
  const buffer = await readFile(inputPath);
  return decodeMermaidSource(buffer);
}
