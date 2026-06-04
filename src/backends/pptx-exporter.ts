import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import PptxGenJS from "pptxgenjs";

import type { Label, Node, Slide as SemanticSlide } from "../domain/scene.js";
import { postProcessPptxConnectors } from "./pptx-postprocess.js";
import type { ExportArtifact, ExportContext, SceneExporter } from "./types.js";

const PX_PER_INCH = 96;

function pxToInches(value: number): number {
  return Number((value / PX_PER_INCH).toFixed(3));
}

function escapeText(text: string | undefined): string {
  return (text ?? "").replaceAll("\n", "\r\n");
}

function resolveFillColor(styleRef?: string): string {
  switch (styleRef) {
    case "group.domain":
      return "F7F5EC";
    case "group.cluster":
      return "FCFBF7";
    case "node.external":
      return "F6EFE3";
    case "node.network":
      return "EAF3F0";
    case "node.process":
      return "E8F1FB";
    case "node.decision":
      return "FFF0CC";
    case "node.actor":
      return "FCE8E6";
    case "node.system":
      return "E7F7EE";
    case "node.database":
      return "EFEAFE";
    default:
      return "FFFFFF";
  }
}

function resolveLineColor(styleRef?: string): string {
  switch (styleRef) {
    case "group.domain":
      return "8D7B55";
    case "group.cluster":
      return "B6AA87";
    case "node.external":
      return "A36A1F";
    case "node.network":
      return "3E7A6A";
    case "node.process":
      return "3F6EA8";
    case "node.decision":
      return "A96A00";
    case "node.actor":
      return "A6473D";
    case "node.system":
      return "2E7D55";
    case "node.database":
      return "6D56B3";
    case "edge.emphasis":
      return "A6473D";
    default:
      return "5E6472";
  }
}

function resolveTextColor(styleRef?: string): string {
  switch (styleRef) {
    case "node.external":
      return "5C3707";
    case "node.network":
      return "1D433A";
    case "node.process":
      return "17314F";
    case "node.decision":
      return "5E3B00";
    case "node.actor":
      return "5A231E";
    case "node.system":
      return "153E2B";
    case "node.database":
      return "35235F";
    default:
      return "1F2430";
  }
}

function addGroup(slide: any, group: SemanticSlide["groups"][number]): void {
  if (!group.bounds) {
    return;
  }

  slide.addShape("rect", {
    objectName: `group:${group.id}`,
    x: pxToInches(group.bounds.x),
    y: pxToInches(group.bounds.y),
    w: pxToInches(group.bounds.width),
    h: pxToInches(group.bounds.height),
    line: {
      color: resolveLineColor(group.styleRef),
      width: group.semanticType === "cluster" ? 1 : 1.5,
      dash: group.semanticType === "cluster" ? "dash" : "solid"
    },
    fill: {
      color: resolveFillColor(group.styleRef),
      transparency: 18
    },
    radius: 0.08
  });

  if (group.title) {
    slide.addText(escapeText(group.title), {
      objectName: `groupTitle:${group.id}`,
      x: pxToInches(group.bounds.x + 10),
      y: pxToInches(group.bounds.y + 6),
      w: pxToInches(group.bounds.width - 20),
      h: pxToInches(24),
      margin: 0,
      fontFace: "Aptos",
      fontSize: 12,
      bold: true,
      color: "2A251B",
      breakLine: false
    });
  }
}

function addNode(slide: any, node: Node): void {
  const shapeType =
    node.shape === "diamond"
      ? "diamond"
      : node.shape === "rounded-rectangle"
        ? "roundRect"
        : node.shape === "cylinder"
          ? "flowChartMagneticDisk"
          : node.semanticType === "actor"
            ? "round2SameRect"
          : "rect";

  slide.addShape(shapeType, {
    objectName: `node:${node.id}`,
    x: pxToInches(node.bounds.x),
    y: pxToInches(node.bounds.y),
    w: pxToInches(node.bounds.width),
    h: pxToInches(node.bounds.height),
    line: {
      color: resolveLineColor(node.styleRef),
      width: 1.2
    },
    fill: {
      color: resolveFillColor(node.styleRef)
    },
    radius: node.shape === "rounded-rectangle" ? 0.08 : undefined
  });

  if (node.text) {
    slide.addText(escapeText(node.text), {
      objectName: `nodeText:${node.id}`,
      x: pxToInches(node.bounds.x + 8),
      y: pxToInches(node.bounds.y + 6),
      w: pxToInches(node.bounds.width - 16),
      h: pxToInches(node.bounds.height - 12),
      margin: 0,
      valign: "mid",
      align: "center",
      fontFace: "Aptos",
      fontSize: node.semanticType === "external" ? 10 : 11,
      color: resolveTextColor(node.styleRef),
      fit: "shrink"
    });
  }
}

function addEdgeLabel(slide: any, label: Label): void {
  if (!label.bounds) {
    return;
  }

  slide.addText(escapeText(label.text), {
    x: pxToInches(label.bounds.x),
    y: pxToInches(label.bounds.y),
    w: pxToInches(label.bounds.width),
    h: pxToInches(label.bounds.height),
    margin: 0,
    align: "center",
    valign: "mid",
    fontFace: "Aptos",
    fontSize: 8.5,
    color: "283142",
    fill: {
      color: "FFFFFF",
      transparency: 15
    },
    line: {
      color: "CBD5E1",
      transparency: 35,
      width: 0.5
    },
    fit: "shrink"
  });
}

function addSlide(pptx: any, semanticSlide: SemanticSlide): void {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };

  for (const group of semanticSlide.groups) {
    addGroup(slide, group);
  }

  for (const node of semanticSlide.nodes) {
    addNode(slide, node);
  }

  for (const label of semanticSlide.labels) {
    addEdgeLabel(slide, label);
  }
}

export class PptxSceneExporter implements SceneExporter {
  readonly format = "pptx" as const;

  async export(context: ExportContext): Promise<ExportArtifact> {
    const PptxCtor = PptxGenJS as unknown as new () => any;
    const pptx = new PptxCtor();
    const firstSlide = context.scene.slides[0];

    if (firstSlide) {
      pptx.defineLayout({
        name: "MERMAID_EDITABLE",
        width: pxToInches(firstSlide.width),
        height: pxToInches(firstSlide.height)
      });
      pptx.layout = "MERMAID_EDITABLE";
    } else {
      pptx.layout = "LAYOUT_WIDE";
    }

    pptx.author = "Codex";
    pptx.company = "OpenAI";
    pptx.subject = "Editable Mermaid export";
    pptx.title = "Editable Mermaid export";

    for (const semanticSlide of context.scene.slides) {
      addSlide(pptx, semanticSlide);
    }

    await mkdir(dirname(context.outputPath), { recursive: true });
    await pptx.writeFile({ fileName: context.outputPath });
    await postProcessPptxConnectors(context.outputPath, context.scene);

    return {
      format: this.format,
      outputPath: context.outputPath
    };
  }
}
