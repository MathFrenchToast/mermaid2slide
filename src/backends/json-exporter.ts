import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { ExportArtifact, ExportContext, SceneExporter } from "./types.js";

export class JsonSceneExporter implements SceneExporter {
  readonly format = "json" as const;

  async export(context: ExportContext): Promise<ExportArtifact> {
    await mkdir(dirname(context.outputPath), { recursive: true });
    await writeFile(
      context.outputPath,
      JSON.stringify(context.scene, null, 2),
      "utf8"
    );

    return {
      format: this.format,
      outputPath: context.outputPath
    };
  }
}
