import type { Scene } from "../domain/scene.js";
import { buildScene } from "./build-scene.js";
import { parseMermaidDocument } from "./parse.js";
import { readMermaidSource } from "./source.js";

export async function convertMermaidFileToScene(
  inputPath: string
): Promise<Scene> {
  const sourceText = await readMermaidSource(inputPath);
  const parsed = parseMermaidDocument(sourceText);
  return buildScene(parsed, inputPath);
}
