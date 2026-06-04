import type { DiagramKind, ShapeKind } from "../domain/scene.js";

export interface ParsedMermaidDocument {
  sourceText: string;
  diagramKind: DiagramKind;
  title?: string;
  flowchart?: ParsedFlowchart;
}

export function detectDiagramKind(sourceText: string): DiagramKind {
  const trimmed = sourceText.trimStart();

  if (trimmed.startsWith("flowchart") || trimmed.startsWith("graph")) {
    return "flowchart";
  }

  if (trimmed.startsWith("sequenceDiagram")) {
    return "sequence";
  }

  if (trimmed.startsWith("classDiagram")) {
    return "class";
  }

  if (trimmed.startsWith("stateDiagram")) {
    return "state";
  }

  return "unknown";
}

export interface ParsedFlowchartNode {
  id: string;
  text: string;
  shape: ShapeKind;
  parentGroupId?: string;
  order: number;
}

export interface ParsedFlowchartEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  style: "solid" | "dashed";
  order: number;
}

export interface ParsedFlowchartGroup {
  id: string;
  title: string;
  parentGroupId?: string;
  children: string[];
  direction?: string;
  order: number;
}

export interface ParsedFlowchart {
  direction: string;
  nodes: ParsedFlowchartNode[];
  edges: ParsedFlowchartEdge[];
  groups: ParsedFlowchartGroup[];
}

type MutableFlowchart = {
  direction: string;
  nodes: Map<string, ParsedFlowchartNode>;
  edges: ParsedFlowchartEdge[];
  groups: Map<string, ParsedFlowchartGroup>;
  rootChildren: string[];
};

type NodeToken = {
  id: string;
  text?: string;
  shape: ShapeKind;
};

const nodeTokenPattern =
  /([A-Za-z][A-Za-z0-9_]*)(\[(?:"(?:[^"\\]|\\.)*"|[^\]]*)\]|\((?:"(?:[^"\\]|\\.)*"|[^)]*)\)|\{(?:"(?:[^"\\]|\\.)*"|[^}]*)\})?/g;

function normalizeText(text: string): string {
  return text
    .replaceAll(/<br\s*\/?>/gi, "\n")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .trim();
}

function unquote(text: string): string {
  const trimmed = text.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseNodeToken(rawId: string, rawShape?: string): NodeToken {
  if (!rawShape) {
    return {
      id: rawId,
      text: rawId,
      shape: "rectangle"
    };
  }

  const startsWith = rawShape[0];
  const endsWith = rawShape[rawShape.length - 1];
  const innerText = normalizeText(unquote(rawShape.slice(1, -1)));

  let shape: ShapeKind = "rectangle";

  if (startsWith === "(" && endsWith === ")") {
    shape = "rounded-rectangle";
  } else if (startsWith === "{" && endsWith === "}") {
    shape = "diamond";
  }

  return {
    id: rawId,
    text: innerText || rawId,
    shape
  };
}

function registerChild(
  flowchart: MutableFlowchart,
  parentGroupId: string | undefined,
  childId: string
): void {
  if (parentGroupId) {
    const parent = flowchart.groups.get(parentGroupId);
    if (parent && !parent.children.includes(childId)) {
      parent.children.push(childId);
    }
    return;
  }

  if (!flowchart.rootChildren.includes(childId)) {
    flowchart.rootChildren.push(childId);
  }
}

function ensureNode(
  flowchart: MutableFlowchart,
  token: NodeToken,
  parentGroupId: string | undefined,
  order: number
): ParsedFlowchartNode {
  const existing = flowchart.nodes.get(token.id);

  if (existing) {
    if (!existing.text || existing.text === existing.id) {
      existing.text = token.text ?? existing.id;
    }
    if (existing.shape === "rectangle" && token.shape !== "rectangle") {
      existing.shape = token.shape;
    }
    if (!existing.parentGroupId && parentGroupId) {
      existing.parentGroupId = parentGroupId;
      registerChild(flowchart, parentGroupId, existing.id);
    }
    return existing;
  }

  const created: ParsedFlowchartNode = {
    id: token.id,
    text: token.text ?? token.id,
    shape: token.shape,
    parentGroupId,
    order
  };

  flowchart.nodes.set(token.id, created);
  registerChild(flowchart, parentGroupId, token.id);
  return created;
}

function parseSubgraphDeclaration(line: string): { id: string; title: string } | null {
  const declaration = line.replace(/^subgraph\s+/, "").trim();

  if (!declaration) {
    return null;
  }

  const tokenMatch = /^([A-Za-z][A-Za-z0-9_]*)(.*)$/.exec(declaration);
  if (tokenMatch) {
    const [, id, rest] = tokenMatch;
    const remainder = rest.trim();

    if (!remainder) {
      return { id, title: id };
    }

    if (
      (remainder.startsWith("[") && remainder.endsWith("]")) ||
      (remainder.startsWith("(") && remainder.endsWith(")")) ||
      (remainder.startsWith("{") && remainder.endsWith("}"))
    ) {
      const title = normalizeText(unquote(remainder.slice(1, -1)));
      return { id, title: title || id };
    }
  }

  const title = normalizeText(unquote(declaration));
  if (!title) {
    return null;
  }

  const syntheticId = `group_${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "_")}`;
  return { id: syntheticId, title };
}

function maskProtectedSegments(line: string): string {
  let masked = line;

  masked = masked.replaceAll(
    /"([^"\\]|\\.)*"/g,
    (match) => `"${" ".repeat(Math.max(0, match.length - 2))}"`
  );
  masked = masked.replaceAll(
    /'([^'\\]|\\.)*'/g,
    (match) => `'${" ".repeat(Math.max(0, match.length - 2))}'`
  );
  masked = masked.replaceAll(/\|[^|]*\|/g, (match) => `|${" ".repeat(Math.max(0, match.length - 2))}|`);
  masked = masked.replaceAll(
    /-\.\s*(.*?)\s*\.-/g,
    (match) => {
      const innerLength = Math.max(0, match.length - 4);
      return `-.${" ".repeat(innerLength)}.-`;
    }
  );

  return masked;
}

function extractNodeTokens(line: string): Array<NodeToken & { index: number; raw: string }> {
  const matches: Array<NodeToken & { index: number; raw: string }> = [];
  const maskedLine = maskProtectedSegments(line);

  for (const match of maskedLine.matchAll(nodeTokenPattern)) {
    const raw = line.slice(match.index ?? 0, (match.index ?? 0) + match[0].length);
    const rawMatch = /^([A-Za-z][A-Za-z0-9_]*)(.*)$/.exec(raw);
    const id = rawMatch?.[1] ?? match[1];
    const shapeToken = rawMatch?.[2] ? rawMatch[2] : match[2];
    const parsed = parseNodeToken(id, shapeToken);
    matches.push({
      ...parsed,
      index: match.index ?? 0,
      raw
    });
  }

  return matches;
}

function parseEdgeLabel(segment: string): string | undefined {
  const pipeMatch = /\|([^|]+)\|/.exec(segment);
  if (pipeMatch) {
    return normalizeText(unquote(pipeMatch[1]));
  }

  const dottedLabelMatch = /-\.\s*(.*?)\s*\.-/.exec(segment);
  if (dottedLabelMatch) {
    return normalizeText(unquote(dottedLabelMatch[1]));
  }

  return undefined;
}

function parseEdgeStyle(segment: string): "solid" | "dashed" {
  return segment.includes(".-") ? "dashed" : "solid";
}

export function parseFlowchart(sourceText: string): ParsedFlowchart {
  const lines = sourceText.replaceAll("\r\n", "\n").split("\n");
  const flowchart: MutableFlowchart = {
    direction: "TB",
    nodes: new Map(),
    edges: [],
    groups: new Map(),
    rootChildren: []
  };
  const groupStack: string[] = [];
  let order = 0;
  let edgeId = 1;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("%%")) {
      continue;
    }

    if (line.startsWith("flowchart") || line.startsWith("graph")) {
      const parts = line.split(/\s+/);
      if (parts[1]) {
        flowchart.direction = parts[1];
      }
      continue;
    }

    if (line.startsWith("direction ")) {
      const direction = line.slice("direction ".length).trim();
      const currentGroupId = groupStack[groupStack.length - 1];

      if (currentGroupId) {
        const group = flowchart.groups.get(currentGroupId);
        if (group && direction) {
          group.direction = direction;
        }
      } else if (direction) {
        flowchart.direction = direction;
      }

      continue;
    }

    if (line === "end") {
      groupStack.pop();
      continue;
    }

    if (line.startsWith("subgraph ")) {
      const group = parseSubgraphDeclaration(line);
      if (!group) {
        continue;
      }

      const parentGroupId = groupStack[groupStack.length - 1];
      const parsedGroup: ParsedFlowchartGroup = {
        id: group.id,
        title: group.title,
        parentGroupId,
        children: [],
        direction: undefined,
        order: order++
      };
      flowchart.groups.set(group.id, parsedGroup);
      registerChild(flowchart, parentGroupId, group.id);
      groupStack.push(group.id);
      continue;
    }

    const tokens = extractNodeTokens(line);
    if (tokens.length === 0) {
      continue;
    }

    const parentGroupId = groupStack[groupStack.length - 1];
    for (const token of tokens) {
      ensureNode(flowchart, token, parentGroupId, order++);
    }

    if (tokens.length < 2) {
      continue;
    }

    for (let index = 0; index < tokens.length - 1; index += 1) {
      const current = tokens[index];
      const next = tokens[index + 1];
      const segment = line.slice(current.index + current.raw.length, next.index);

      if (!segment.includes("-") && !segment.includes("=") && !segment.includes(".")) {
        continue;
      }

      flowchart.edges.push({
        id: `edge-${edgeId++}`,
        from: current.id,
        to: next.id,
        label: parseEdgeLabel(segment),
        style: parseEdgeStyle(segment),
        order: order++
      });
    }
  }

  return {
    direction: flowchart.direction,
    nodes: [...flowchart.nodes.values()].sort((left, right) => left.order - right.order),
    edges: flowchart.edges.sort((left, right) => left.order - right.order),
    groups: [...flowchart.groups.values()].sort((left, right) => left.order - right.order)
  };
}

export function parseMermaidDocument(sourceText: string): ParsedMermaidDocument {
  const diagramKind = detectDiagramKind(sourceText);

  return {
    sourceText,
    diagramKind,
    flowchart: diagramKind === "flowchart" ? parseFlowchart(sourceText) : undefined
  };
}
