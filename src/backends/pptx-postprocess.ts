import { readFile, writeFile } from "node:fs/promises";

import JSZip from "jszip";

import type { Edge, Scene, Slide } from "../domain/scene.js";

const EMU_PER_PX = 9525;
const MIN_EMU = 914;

function pxToEmu(value: number): number {
  return Math.max(Math.round(value * EMU_PER_PX), 0);
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sideToConnectionIndex(side: Edge["from"]["side"]): number {
  switch (side) {
    case "top":
      return 0;
    case "left":
      return 1;
    case "bottom":
      return 2;
    case "right":
    default:
      return 3;
  }
}

function buildConnectorGeometry(edge: Edge): {
  offX: number;
  offY: number;
  extX: number;
  extY: number;
  flipH?: true;
  flipV?: true;
  preset: "straightConnector1" | "bentConnector3";
} {
  const start = edge.path.points[0];
  const end = edge.path.points[edge.path.points.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  return {
    offX: pxToEmu(Math.min(start.x, end.x)),
    offY: pxToEmu(Math.min(start.y, end.y)),
    extX: Math.max(pxToEmu(Math.abs(dx)), MIN_EMU),
    extY: Math.max(pxToEmu(Math.abs(dy)), MIN_EMU),
    flipH: dx < 0 ? true : undefined,
    flipV: dy < 0 ? true : undefined,
    preset: edge.path.points.length > 2 ? "bentConnector3" : "straightConnector1"
  };
}

function buildConnectorXml(shapeId: number, edge: Edge, nodeShapeIds: Map<string, number>): string | null {
  const startShapeId = nodeShapeIds.get(edge.from.nodeId);
  const endShapeId = nodeShapeIds.get(edge.to.nodeId);

  if (!startShapeId || !endShapeId) {
    return null;
  }

  const geometry = buildConnectorGeometry(edge);
  const dash = edge.styleRef === "edge.emphasis" ? "dash" : "solid";
  const lineWidth = edge.styleRef === "edge.emphasis" ? "19050" : "13970";
  const lineColor = edge.styleRef === "edge.emphasis" ? "A6473D" : "5E6472";
  const flipH = geometry.flipH ? ' flipH="1"' : "";
  const flipV = geometry.flipV ? ' flipV="1"' : "";

  return [
    `<p:cxnSp>`,
    `<p:nvCxnSpPr>`,
    `<p:cNvPr id="${shapeId}" name="connector:${edge.id}"/>`,
    `<p:cNvCxnSpPr><a:stCxn id="${startShapeId}" idx="${sideToConnectionIndex(edge.from.side)}"/><a:endCxn id="${endShapeId}" idx="${sideToConnectionIndex(edge.to.side)}"/></p:cNvCxnSpPr>`,
    `<p:nvPr/>`,
    `</p:nvCxnSpPr>`,
    `<p:spPr>`,
    `<a:xfrm${flipH}${flipV}><a:off x="${geometry.offX}" y="${geometry.offY}"/><a:ext cx="${geometry.extX}" cy="${geometry.extY}"/></a:xfrm>`,
    `<a:prstGeom prst="${geometry.preset}"><a:avLst/></a:prstGeom>`,
    `<a:noFill/>`,
    `<a:ln w="${lineWidth}"><a:solidFill><a:srgbClr val="${lineColor}"/></a:solidFill><a:prstDash val="${dash}"/><a:headEnd type="none"/><a:tailEnd type="triangle"/></a:ln>`,
    `</p:spPr>`,
    `</p:cxnSp>`
  ].join("");
}

function removeEdgeSegments(slideXml: string, edgeIds: string[]): string {
  let updated = slideXml;

  for (const edgeId of edgeIds) {
    const pattern = new RegExp(
      `<p:sp>[\\s\\S]*?<p:cNvPr id="\\d+" name="edge:${escapeRegExp(edgeId)}:segment:\\d+"\\/>[\\s\\S]*?<\\/p:sp>`,
      "g"
    );
    updated = updated.replace(pattern, "");
  }

  return updated;
}

function extractShapeBlocks(slideXml: string): string[] {
  return slideXml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? [];
}

function replaceShapeBlocks(slideXml: string, shapeBlocks: string[]): string {
  return slideXml.replace(
    /(<p:spTree>)([\s\S]*?)(<\/p:spTree>)/,
    (_match, start, _content, end) => `${start}${shapeBlocks.join("")}${end}`
  );
}

function parseShapeBounds(shapeXml: string): {
  x: number;
  y: number;
  w: number;
  h: number;
} | null {
  const match =
    /<a:xfrm(?:[^>]*)><a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/><\/a:xfrm>/.exec(
      shapeXml
    );

  if (!match) {
    return null;
  }

  return {
    x: Number(match[1]),
    y: Number(match[2]),
    w: Number(match[3]),
    h: Number(match[4])
  };
}

function getShapeName(shapeXml: string): string | null {
  const match = /<p:cNvPr id="\d+" name="([^"]*)"/.exec(shapeXml);
  return match?.[1] ?? null;
}

function getTxBody(shapeXml: string): string | null {
  const match = /(<p:txBody>[\s\S]*<\/p:txBody>)/.exec(shapeXml);
  return match?.[1] ?? null;
}

function injectTxBodyIntoShape(shapeXml: string, txBody: string): string {
  if (shapeXml.includes("<p:txBody>")) {
    return shapeXml.replace(/<p:txBody>[\s\S]*<\/p:txBody>/, txBody);
  }

  return shapeXml.replace("</p:sp>", `${txBody}</p:sp>`);
}

function boundsContainedWithin(
  inner: { x: number; y: number; w: number; h: number },
  outer: { x: number; y: number; w: number; h: number }
): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

function mergeTextBoxesIntoNodeShapes(slideXml: string): string {
  const shapeBlocks = extractShapeBlocks(slideXml);
  const nodes: { block: string; bounds: { x: number; y: number; w: number; h: number }; name: string }[] = [];
  const textBoxes: { block: string; bounds: { x: number; y: number; w: number; h: number }; name: string; txBody: string }[] = [];

  for (const block of shapeBlocks) {
    const name = getShapeName(block);
    const bounds = parseShapeBounds(block);
    if (!name || !bounds) continue;

    if (name.startsWith("node:")) {
      nodes.push({ block, bounds, name });
    } else if (name.startsWith("Text ")) {
      const txBody = getTxBody(block);
      if (txBody) {
        textBoxes.push({ block, bounds, name, txBody });
      }
    }
  }

  const processedBlocks = [...shapeBlocks];
  const blocksToRemove = new Set<string>();

  for (const textBox of textBoxes) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (boundsContainedWithin(textBox.bounds, node.bounds)) {
        const nodeIndex = processedBlocks.indexOf(node.block);
        if (nodeIndex !== -1) {
          processedBlocks[nodeIndex] = injectTxBodyIntoShape(processedBlocks[nodeIndex], textBox.txBody);
          node.block = processedBlocks[nodeIndex]; // Update for potential multiple text boxes
          blocksToRemove.add(textBox.block);
          break;
        }
      }
    }
  }

  const finalBlocks = processedBlocks.filter(block => !blocksToRemove.has(block));
  return replaceShapeBlocks(slideXml, finalBlocks);
}

export function rewriteSlideXmlWithConnectors(slideXml: string, semanticSlide: Slide): string {
  const nodeShapeIds = new Map<string, number>();
  const allShapeIds = [...slideXml.matchAll(/<p:cNvPr id="(\d+)" name="([^"]*)"/g)];

  for (const match of allShapeIds) {
    const shapeId = Number(match[1]);
    const shapeName = match[2];
    if (shapeName.startsWith("node:")) {
      nodeShapeIds.set(shapeName.slice("node:".length), shapeId);
    }
  }

  let nextShapeId = allShapeIds.reduce(
    (max, match) => Math.max(max, Number(match[1])),
    1
  ) + 1;

  const connectors: string[] = [];
  for (const edge of semanticSlide.edges) {
    const connectorXml = buildConnectorXml(nextShapeId, edge, nodeShapeIds);
    if (!connectorXml) {
      continue;
    }
    connectors.push(connectorXml);
    nextShapeId += 1;
  }

  const withoutSegments = removeEdgeSegments(
    slideXml,
    semanticSlide.edges.map((edge) => edge.id)
  );
  const mergedNodes = mergeTextBoxesIntoNodeShapes(withoutSegments);

  if (connectors.length === 0) {
    return mergedNodes;
  }

  return mergedNodes.replace(
    "</p:spTree>",
    `${connectors.join("")}</p:spTree>`
  );
}

export async function postProcessPptxConnectors(
  pptxPath: string,
  scene: Scene
): Promise<void> {
  const archiveBuffer = await readFile(pptxPath);
  const zip = await JSZip.loadAsync(archiveBuffer);

  for (let index = 0; index < scene.slides.length; index += 1) {
    const slidePath = `ppt/slides/slide${index + 1}.xml`;
    const slideFile = zip.file(slidePath);
    if (!slideFile) {
      continue;
    }

    const originalXml = await slideFile.async("string");
    const updatedXml = rewriteSlideXmlWithConnectors(
      originalXml,
      scene.slides[index]
    );
    zip.file(slidePath, updatedXml);
  }

  const updatedBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE"
  });

  await writeFile(pptxPath, updatedBuffer);
}
