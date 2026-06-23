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
  mermaidShape?: string;
  iconKey?: string;
  classes?: string[];
  rawShapeSyntax?: string;
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
  mermaidShape?: string;
  iconKey?: string;
  classes?: string[];
  rawShapeSyntax?: string;
};

const nodeTokenPattern =
  /([A-Za-z][A-Za-z0-9_]*)((?:@\{(?:"(?:[^"\\]|\\.)*"|[^}])*\}|\(\(\((?:"(?:[^"\\]|\\.)*"|[^)])*\)\)\)|\[\((?:"(?:[^"\\]|\\.)*"|[^)])*\)\]|\(\((?:"(?:[^"\\]|\\.)*"|[^)])*\)\)|\[\[(?:"(?:[^"\\]|\\.)*"|[^\]]*)\]\]|\[\/(?:"(?:[^"\\]|\\.)*"|[^\/]*)\/\]|\[\\(?:"(?:[^"\\]|\\.)*"|[^\\]*)\\\]|\{\{(?:"(?:[^"\\]|\\.)*"|[^}]*)\}\}|\[(?:"(?:[^"\\]|\\.)*"|[^\]]*)\]|\((?:"(?:[^"\\]|\\.)*"|[^)]*)\)|\{(?:"(?:[^"\\]|\\.)*"|[^}]*)\}))?/g;

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

function parseMetadataBlock(content: string): { shape?: string; label?: string; icon?: string } {
  const result: { shape?: string; label?: string; icon?: string } = {};
  const inner = content.slice(2, -1).trim();
  const pairRegex = /\b(shape|label|icon)\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^,]+))/g;

  let match;
  while ((match = pairRegex.exec(inner)) !== null) {
    const key = match[1];
    const val = match[2] ?? match[3] ?? match[4];
    if (val !== undefined) {
      result[key as "shape" | "label" | "icon"] = val.trim();
    }
  }
  return result;
}

function parseNodeToken(rawId: string, rawShape?: string): NodeToken {
  if (!rawShape) {
    return {
      id: rawId,
      text: rawId,
      shape: "rectangle"
    };
  }

  let shape: ShapeKind = "rectangle";
  let innerText = "";
  let mermaidShape: string | undefined;
  let iconKey: string | undefined;
  const rawShapeSyntax = rawShape;

  if (rawShape.startsWith("@{") && rawShape.endsWith("}")) {
    const meta = parseMetadataBlock(rawShape);
    if (meta.shape) {
      mermaidShape = meta.shape;
      const lowered = meta.shape.toLowerCase();
      if (lowered === "rect" || lowered === "process") {
        shape = "rectangle";
      } else if (lowered === "cloud") {
        shape = "rounded-rectangle";
      } else if (["db", "database", "cylinder", "datastore", "data-store", "disk", "lin-cyl", "h-cyl", "storage"].includes(lowered)) {
        shape = "cylinder";
      } else if (["decision", "diamond", "diam"].includes(lowered)) {
        shape = "diamond";
      } else if (lowered === "circle") {
        shape = "circle";
      } else if (lowered === "subprocess" || lowered === "procs") {
        shape = "subprocess";
      } else {
        shape = "rectangle";
      }
    }
    if (meta.icon) {
      iconKey = meta.icon;
    }
    if (meta.label) {
      innerText = normalizeText(meta.label);
    }
  } else if (rawShape.startsWith("(((") && rawShape.endsWith(")))")) {
    shape = "double-circle";
    innerText = normalizeText(unquote(rawShape.slice(3, -3)));
  } else if (rawShape.startsWith("[(") && rawShape.endsWith(")]")) {
    shape = "cylinder";
    innerText = normalizeText(unquote(rawShape.slice(2, -2)));
  } else if (rawShape.startsWith("((") && rawShape.endsWith("))")) {
    shape = "circle";
    innerText = normalizeText(unquote(rawShape.slice(2, -2)));
  } else if (rawShape.startsWith("[[") && rawShape.endsWith("]]")) {
    shape = "subprocess";
    innerText = normalizeText(unquote(rawShape.slice(2, -2)));
  } else if (rawShape.startsWith("[/") && rawShape.endsWith("/]")) {
    shape = "parallelogram";
    innerText = normalizeText(unquote(rawShape.slice(2, -2)));
  } else if (rawShape.startsWith("[\\") && rawShape.endsWith("\\]")) {
    shape = "parallelogram-reversed";
    innerText = normalizeText(unquote(rawShape.slice(2, -2)));
  } else if (rawShape.startsWith("{{") && rawShape.endsWith("}}")) {
    shape = "hexagon";
    innerText = normalizeText(unquote(rawShape.slice(2, -2)));
  } else if (rawShape.startsWith("[") && rawShape.endsWith("]")) {
    shape = "rectangle";
    innerText = normalizeText(unquote(rawShape.slice(1, -1)));
  } else if (rawShape.startsWith("(") && rawShape.endsWith(")")) {
    shape = "rounded-rectangle";
    innerText = normalizeText(unquote(rawShape.slice(1, -1)));
  } else if (rawShape.startsWith("{") && rawShape.endsWith("}")) {
    shape = "diamond";
    innerText = normalizeText(unquote(rawShape.slice(1, -1)));
  }

  return {
    id: rawId,
    text: innerText || rawId,
    shape,
    mermaidShape,
    iconKey,
    rawShapeSyntax
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
    if (token.mermaidShape) existing.mermaidShape = token.mermaidShape;
    if (token.iconKey) existing.iconKey = token.iconKey;
    if (token.rawShapeSyntax) existing.rawShapeSyntax = token.rawShapeSyntax;
    return existing;
  }

  const created: ParsedFlowchartNode = {
    id: token.id,
    text: token.text ?? token.id,
    shape: token.shape,
    parentGroupId,
    order,
    mermaidShape: token.mermaidShape,
    iconKey: token.iconKey,
    rawShapeSyntax: token.rawShapeSyntax
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
  masked = masked.replaceAll(
    /:::([A-Za-z0-9_-]+(?:,[A-Za-z0-9_-]+)*)/g,
    (match) => `:::${" ".repeat(Math.max(0, match.length - 3))}`
  );

  return masked;
}

function extractNodeTokens(
  line: string,
  nodeClassesMap?: Map<string, Set<string>>
): Array<NodeToken & { index: number; raw: string }> {
  const matches: Array<NodeToken & { index: number; raw: string }> = [];
  const maskedLine = maskProtectedSegments(line);

  for (const match of maskedLine.matchAll(nodeTokenPattern)) {
    let raw = line.slice(match.index ?? 0, (match.index ?? 0) + match[0].length);
    const rawMatch = /^([A-Za-z][A-Za-z0-9_]*)(.*)$/.exec(raw);
    const id = rawMatch?.[1] ?? match[1];
    const shapeToken = rawMatch?.[2] ? rawMatch[2] : match[2];
    const parsed = parseNodeToken(id, shapeToken);

    const classMatch = /^:::([A-Za-z0-9_-]+(?:,[A-Za-z0-9_-]+)*)/.exec(
      line.slice((match.index ?? 0) + match[0].length)
    );
    if (classMatch && nodeClassesMap) {
      const classes = classMatch[1].split(",").map(c => c.trim());
      if (!nodeClassesMap.has(id)) {
        nodeClassesMap.set(id, new Set());
      }
      for (const cls of classes) {
        nodeClassesMap.get(id)!.add(cls);
      }
      raw += classMatch[0];
    }

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
  const nodeClassesMap = new Map<string, Set<string>>();
  let order = 0;
  let edgeId = 1;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("%%")) {
      continue;
    }

    if (line.startsWith("classDef ")) {
      continue;
    }

    if (line.startsWith("class ") && !line.startsWith("classDef ")) {
      const parts = line.slice("class ".length).trim().replace(/;$/, "").split(/\s+/);
      if (parts.length >= 2) {
        const ids = parts[0].split(",").map(id => id.trim());
        const classes = parts[1].split(",").map(c => c.trim());
        for (const id of ids) {
          if (!nodeClassesMap.has(id)) {
            nodeClassesMap.set(id, new Set());
          }
          for (const cls of classes) {
            nodeClassesMap.get(id)!.add(cls);
          }
        }
      }
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

    const tokens = extractNodeTokens(line, nodeClassesMap);
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

  // Assign classes to all nodes
  for (const node of flowchart.nodes.values()) {
    const classesSet = nodeClassesMap.get(node.id);
    if (classesSet && classesSet.size > 0) {
      node.classes = Array.from(classesSet);
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
