import type { Scene } from "../domain/scene.js";

export interface ExportArtifact {
  format: "pptx" | "odp" | "json";
  outputPath: string;
}

export interface ExportContext {
  scene: Scene;
  outputPath: string;
}

export interface SceneExporter {
  readonly format: ExportArtifact["format"];
  export(context: ExportContext): Promise<ExportArtifact>;
}
