import { basename, resolve } from "node:path";

import { createExporter, type ExportFormat } from "./backends/create-exporter.js";
import { convertMermaidFileToScene } from "./pipeline/converter.js";

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  const formatArg = process.argv[3] as ExportFormat | undefined;
  const outputNameArg = process.argv[4];
  const format: ExportFormat = formatArg === "pptx" ? "pptx" : "json";

  if (!inputPath) {
    console.error("Usage: npm run dev -- <path-to-file.mermaid> [json|pptx]");
    process.exitCode = 1;
    return;
  }

  const absoluteInput = resolve(inputPath);
  const scene = await convertMermaidFileToScene(absoluteInput);

  const outputPath = resolve(
    "outputs",
    outputNameArg
      ? outputNameArg
      : `${basename(absoluteInput, ".mermaid")}.scene.${format}`
  );

  const exporter = createExporter(format);
  const artifact = await exporter.export({ scene, outputPath });

  console.log(
    JSON.stringify(
      {
        input: absoluteInput,
        output: artifact.outputPath,
        format: artifact.format,
        diagramKind: scene.metadata.source.diagramKind,
        slideCount: scene.slides.length
      },
      null,
      2
    )
  );
}

void main();
