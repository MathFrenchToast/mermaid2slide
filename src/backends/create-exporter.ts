import { JsonSceneExporter } from "./json-exporter.js";
import { PptxSceneExporter } from "./pptx-exporter.js";
import type { SceneExporter } from "./types.js";

export type ExportFormat = "json" | "pptx";

export function createExporter(format: ExportFormat): SceneExporter {
  switch (format) {
    case "pptx":
      return new PptxSceneExporter();
    case "json":
    default:
      return new JsonSceneExporter();
  }
}
