import type { EdgePath, Point, Rect } from "../domain/geometry.js";
import type { Edge, Group, Label, Node, Scene, Slide } from "../domain/scene.js";
import { defaultTheme } from "../domain/theme.js";
import type {
  ParsedFlowchart,
  ParsedFlowchartEdge,
  ParsedFlowchartGroup,
  ParsedFlowchartNode,
  ParsedMermaidDocument
} from "./parse.js";

function createRect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

type NodeSemanticType = Node["semanticType"];
type LayoutDirection = "LR" | "RL" | "TB" | "BT";
type ElementRef = ParsedFlowchartGroup | ParsedFlowchartNode;

type LayoutState = {
  nodes: Node[];
  groups: Group[];
  labels: Label[];
  nodeBounds: Map<string, Rect>;
};

type MeasuredNode = {
  kind: "node";
  node: ParsedFlowchartNode;
  width: number;
  height: number;
};

type MeasuredGroup = {
  kind: "group";
  group: ParsedFlowchartGroup;
  width: number;
  height: number;
  direction: LayoutDirection;
  children: Array<MeasuredNode | MeasuredGroup>;
  childOffsets: Map<string, Point>;
};

type MeasuredElement = MeasuredNode | MeasuredGroup;

function normalizeDirection(direction?: string): LayoutDirection {
  switch ((direction ?? "").toUpperCase()) {
    case "LR":
    case "RL":
    case "BT":
      return direction!.toUpperCase() as LayoutDirection;
    case "TB":
    default:
      return "TB";
  }
}

function isHorizontal(direction: LayoutDirection): boolean {
  return direction === "LR" || direction === "RL";
}

function inferNodeSemantics(node: ParsedFlowchartNode): {
  semanticType: NodeSemanticType;
  iconKey?: string;
} {
  let iconKey: string | undefined = node.iconKey;

  // Priority 1: metadata.mermaidShape
  if (node.mermaidShape) {
    const lowered = node.mermaidShape.toLowerCase();
    if (["db", "database", "cylinder", "datastore", "data-store"].includes(lowered)) {
      return { semanticType: "database", iconKey: iconKey ?? "database" };
    }
    if (["disk", "lin-cyl", "h-cyl", "storage"].includes(lowered)) {
      return { semanticType: "database", iconKey: iconKey ?? "disk" };
    }
    if (lowered === "cloud") {
      return { semanticType: "network", iconKey: iconKey ?? "cloud" };
    }
    if (["server", "process", "rect", "procs", "subprocess"].includes(lowered)) {
      return { semanticType: "system", iconKey: iconKey ?? "server" };
    }
    if (["decision", "diamond", "diam"].includes(lowered)) {
      return { semanticType: "decision", iconKey };
    }
  }

  // Priority 2: classic parsed shape
  if (node.shape === "cylinder") {
    return { semanticType: "database", iconKey: iconKey ?? "database" };
  }
  if (node.shape === "diamond") {
    return { semanticType: "decision", iconKey };
  }

  // Priority 3: classes Mermaid
  if (node.classes && node.classes.length > 0) {
    for (const cls of node.classes) {
      const clsLower = cls.toLowerCase();
      if (["db", "database", "cylinder", "datastore", "data-store"].includes(clsLower)) {
        return { semanticType: "database", iconKey: iconKey ?? "database" };
      }
      if (["disk", "lin-cyl", "h-cyl", "storage"].includes(clsLower)) {
        return { semanticType: "database", iconKey: iconKey ?? "disk" };
      }
      if (clsLower === "cloud") {
        return { semanticType: "network", iconKey: iconKey ?? "cloud" };
      }
      if (["server", "process", "rect", "procs", "subprocess"].includes(clsLower)) {
        return { semanticType: "system", iconKey: iconKey ?? "server" };
      }
      if (["decision", "diamond", "diam"].includes(clsLower)) {
        return { semanticType: "decision", iconKey };
      }
      if (clsLower === "security" || clsLower === "firewall" || clsLower === "shield") {
        return { semanticType: "network", iconKey: iconKey ?? "shield" };
      }
      if (clsLower === "cluster") {
        return { semanticType: "cluster", iconKey };
      }
    }
  }

  // Priority 4: existing heuristics on id and text
  const identity = `${node.id} ${node.text}`.toLowerCase();
  const hasInfrastructureHint =
    /\b(vpc|vpn|gateway|load balancer|lb_|lb\b|route table|router|vrouter|peering|network|security group|sg_|cluster|node|control plane|api|vm|bastion|proxy|service|system)\b/.test(
      identity
    );

  if (
    /\b(internet|external|externes|api externes|registry|registries)\b/.test(
      identity
    )
  ) {
    return { semanticType: "external", iconKey: iconKey ?? (identity.includes("internet") ? "cloud" : undefined) };
  }

  if (
    /\b(vpc|vpn|gateway|load balancer|lb_|lb\b|route table|router|vrouter|peering|network|security group|sg_)\b/.test(identity)
  ) {
    return { semanticType: "network", iconKey: iconKey ?? (identity.includes("load balancer") || identity.includes("lb") ? "server" : undefined) };
  }

  if (
    /\b(db|database|postgres|mysql|redis|mongodb|storage|bucket)\b/.test(identity)
  ) {
    return { semanticType: "database", iconKey: iconKey ?? "database" };
  }

  if (
    /\b(api|cluster|kapsule|node|control plane|system|service|proxy|bastion|vm)\b/.test(
      identity
    )
  ) {
    const semanticType = identity.includes("cluster") ? "cluster" : "system";
    return { semanticType, iconKey: iconKey ?? "server" };
  }

  if (
    !hasInfrastructureHint &&
    /\b(admin|admins|user|users|utilisateur|utilisateurs|devops|browser|navigateur|client)\b/.test(
      identity
    )
  ) {
    return { semanticType: "actor", iconKey };
  }

  if (/\b(shield|firewall)\b/.test(identity)) {
    return { semanticType: "network", iconKey: iconKey ?? "shield" };
  }

  return { semanticType: "process", iconKey };
}

function inferNodeSemanticType(node: ParsedFlowchartNode): NodeSemanticType {
  return inferNodeSemantics(node).semanticType;
}

function inferNodeStyle(semanticType: NodeSemanticType): string {
  switch (semanticType) {
    case "external":
      return "node.external";
    case "network":
      return "node.network";
    case "decision":
      return "node.decision";
    case "database":
      return "node.database";
    case "actor":
      return "node.actor";
    case "system":
      return "node.system";
    default:
      return "node.process";
  }
}

function measureNode(node: ParsedFlowchartNode): MeasuredNode {
  const lines = node.text.split("\n");
  const maxLineLength = lines.reduce(
    (longest, line) => Math.max(longest, line.length),
    12
  );
  const width = Math.min(420, Math.max(140, maxLineLength * 7.2 + 32));
  const height = Math.max(52, lines.length * 18 + 24);

  return {
    kind: "node",
    node,
    width,
    height
  };
}

function getChildrenInOrder(
  group: ParsedFlowchartGroup,
  flowchart: ParsedFlowchart
): ElementRef[] {
  const childGroups = new Map(flowchart.groups.map((entry) => [entry.id, entry]));
  const childNodes = new Map(flowchart.nodes.map((entry) => [entry.id, entry]));

  return group.children
    .map((childId) => childGroups.get(childId) ?? childNodes.get(childId))
    .filter((entry): entry is ElementRef => Boolean(entry));
}

function measureElement(
  element: ElementRef,
  flowchart: ParsedFlowchart,
  inheritedDirection: LayoutDirection
): MeasuredElement {
  if ("children" in element) {
    return measureGroup(element, flowchart, inheritedDirection);
  }

  return measureNode(element);
}

function measureGroup(
  group: ParsedFlowchartGroup,
  flowchart: ParsedFlowchart,
  inheritedDirection: LayoutDirection
): MeasuredGroup {
  const direction = normalizeDirection(group.direction ?? inheritedDirection);
  const padding = 18;
  const titleHeight = 30;
  const gap = 18;
  const children = getChildrenInOrder(group, flowchart).map((child) =>
    measureElement(child, flowchart, direction)
  );
  const childOffsets = new Map<string, Point>();

  if (children.length === 0) {
    return {
      kind: "group",
      group,
      width: 280,
      height: 90,
      direction,
      children,
      childOffsets
    };
  }

  const horizontal = isHorizontal(direction);
  const orderedChildren = direction === "RL" || direction === "BT"
    ? [...children].reverse()
    : children;

  let cursorPrimary = padding;
  let maxSecondary = 0;

  for (const child of orderedChildren) {
    const offset = horizontal
      ? { x: cursorPrimary, y: titleHeight + padding }
      : { x: padding, y: titleHeight + cursorPrimary };

    childOffsets.set(
      child.kind === "group" ? child.group.id : child.node.id,
      offset
    );

    cursorPrimary += (horizontal ? child.width : child.height) + gap;
    maxSecondary = Math.max(
      maxSecondary,
      horizontal ? child.height : child.width
    );
  }

  const contentPrimary = cursorPrimary - gap + padding;
  const width = horizontal
    ? Math.max(280, contentPrimary)
    : Math.max(280, maxSecondary + padding * 2);
  const height = horizontal
    ? Math.max(90, titleHeight + maxSecondary + padding * 2)
    : Math.max(90, titleHeight + contentPrimary + padding);

  if (!horizontal) {
    for (const child of children) {
      const key = child.kind === "group" ? child.group.id : child.node.id;
      const current = childOffsets.get(key);
      if (!current) {
        continue;
      }
      childOffsets.set(key, {
        x: padding + (width - padding * 2 - child.width) / 2,
        y: current.y
      });
    }
  } else {
    for (const child of children) {
      const key = child.kind === "group" ? child.group.id : child.node.id;
      const current = childOffsets.get(key);
      if (!current) {
        continue;
      }
      childOffsets.set(key, {
        x: current.x,
        y: titleHeight + padding + (maxSecondary - child.height) / 2
      });
    }
  }

  return {
    kind: "group",
    group,
    width,
    height,
    direction,
    children,
    childOffsets
  };
}

function applyMeasuredNode(
  measuredNode: MeasuredNode,
  x: number,
  y: number,
  state: LayoutState
): Rect {
  const semantics = inferNodeSemantics(measuredNode.node);
  const semanticType = semantics.semanticType;
  const iconKey = measuredNode.node.iconKey ?? semantics.iconKey;

  const bounds = createRect(x, y, measuredNode.width, measuredNode.height);

  state.nodes.push({
    id: measuredNode.node.id,
    name: measuredNode.node.id,
    semanticType,
    shape: measuredNode.node.shape,
    text: measuredNode.node.text,
    bounds,
    styleRef: inferNodeStyle(semanticType),
    metadata: {
      sourceId: measuredNode.node.id,
      parentGroupId: measuredNode.node.parentGroupId ?? "",
      mermaidShape: measuredNode.node.mermaidShape,
      iconKey,
      classes: measuredNode.node.classes,
      rawShapeSyntax: measuredNode.node.rawShapeSyntax
    }
  });

  state.nodeBounds.set(measuredNode.node.id, bounds);
  return bounds;
}

function applyMeasuredGroup(
  measuredGroup: MeasuredGroup,
  x: number,
  y: number,
  state: LayoutState
): Rect {
  const bounds = createRect(x, y, measuredGroup.width, measuredGroup.height);

  state.groups.push({
    id: measuredGroup.group.id,
    name: measuredGroup.group.id,
    semanticType: measuredGroup.group.parentGroupId ? "cluster" : "group",
    title: measuredGroup.group.title,
    bounds,
    children: [...measuredGroup.group.children],
    styleRef: measuredGroup.group.parentGroupId ? "group.cluster" : "group.domain",
    metadata: {
      sourceId: measuredGroup.group.id,
      parentGroupId: measuredGroup.group.parentGroupId ?? "",
      direction: measuredGroup.direction
    }
  });

  for (const child of measuredGroup.children) {
    const childId = child.kind === "group" ? child.group.id : child.node.id;
    const offset = measuredGroup.childOffsets.get(childId);
    if (!offset) {
      continue;
    }

    if (child.kind === "group") {
      applyMeasuredGroup(child, x + offset.x, y + offset.y, state);
    } else {
      applyMeasuredNode(child, x + offset.x, y + offset.y, state);
    }
  }

  return bounds;
}

function getRootElements(flowchart: ParsedFlowchart): ElementRef[] {
  return [
    ...flowchart.groups.filter((group) => !group.parentGroupId),
    ...flowchart.nodes.filter((node) => !node.parentGroupId)
  ].sort((left, right) => left.order - right.order);
}

function layoutRoot(
  flowchart: ParsedFlowchart,
  state: LayoutState
): { width: number; height: number } {
  const direction = normalizeDirection(flowchart.direction);
  const elements = getRootElements(flowchart).map((element) =>
    measureElement(element, flowchart, direction)
  );
  const margin = 40;
  const gap = 28;
  const horizontal = isHorizontal(direction);
  const orderedElements = direction === "RL" || direction === "BT"
    ? [...elements].reverse()
    : elements;

  let cursorPrimary = margin;
  let maxSecondary = 0;
  let maxPrimary = margin;

  for (const element of orderedElements) {
    const x = horizontal ? cursorPrimary : margin;
    const y = horizontal ? margin : cursorPrimary;

    if (element.kind === "group") {
      applyMeasuredGroup(element, x, y, state);
    } else {
      applyMeasuredNode(element, x, y, state);
    }

    cursorPrimary += (horizontal ? element.width : element.height) + gap;
    maxSecondary = Math.max(
      maxSecondary,
      horizontal ? element.height : element.width
    );
    maxPrimary = Math.max(
      maxPrimary,
      horizontal ? x + element.width : y + element.height
    );
  }

  return horizontal
    ? {
        width: Math.max(1280, maxPrimary + margin),
        height: Math.max(720, maxSecondary + margin * 2)
      }
    : {
        width: Math.max(1280, maxSecondary + margin * 2),
        height: Math.max(720, maxPrimary + margin)
      };
}

function resolveEdgeAnchors(from: Rect, to: Rect): {
  start: Point;
  end: Point;
  fromSide: "top" | "right" | "bottom" | "left";
  toSide: "top" | "right" | "bottom" | "left";
} {
  const fromCenter = {
    x: from.x + from.width / 2,
    y: from.y + from.height / 2
  };
  const toCenter = {
    x: to.x + to.width / 2,
    y: to.y + to.height / 2
  };
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? {
          start: { x: from.x + from.width, y: fromCenter.y },
          end: { x: to.x, y: toCenter.y },
          fromSide: "right",
          toSide: "left"
        }
      : {
          start: { x: from.x, y: fromCenter.y },
          end: { x: to.x + to.width, y: toCenter.y },
          fromSide: "left",
          toSide: "right"
        };
  }

  return dy >= 0
    ? {
        start: { x: fromCenter.x, y: from.y + from.height },
        end: { x: toCenter.x, y: to.y },
        fromSide: "bottom",
        toSide: "top"
      }
    : {
        start: { x: fromCenter.x, y: from.y },
        end: { x: toCenter.x, y: to.y + to.height },
        fromSide: "top",
        toSide: "bottom"
      };
}

function createEdgePath(from: Rect, to: Rect): {
  path: EdgePath;
  fromSide: "top" | "right" | "bottom" | "left";
  toSide: "top" | "right" | "bottom" | "left";
} {
  const anchors = resolveEdgeAnchors(from, to);
  const horizontal =
    anchors.fromSide === "left" || anchors.fromSide === "right";

  const points = horizontal
    ? [
        anchors.start,
        { x: (anchors.start.x + anchors.end.x) / 2, y: anchors.start.y },
        { x: (anchors.start.x + anchors.end.x) / 2, y: anchors.end.y },
        anchors.end
      ]
    : [
        anchors.start,
        { x: anchors.start.x, y: (anchors.start.y + anchors.end.y) / 2 },
        { x: anchors.end.x, y: (anchors.start.y + anchors.end.y) / 2 },
        anchors.end
      ];

  return {
    path: { points },
    fromSide: anchors.fromSide,
    toSide: anchors.toSide
  };
}

function buildEdgeLabel(
  labelId: string,
  parsedEdge: ParsedFlowchartEdge,
  fromBounds: Rect,
  toBounds: Rect
): Label {
  const centerX = (fromBounds.x + fromBounds.width / 2 + toBounds.x + toBounds.width / 2) / 2;
  const centerY = (fromBounds.y + fromBounds.height / 2 + toBounds.y + toBounds.height / 2) / 2;
  const text = parsedEdge.label ?? "";
  const lines = text.split("\n");
  const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 10);
  const width = Math.max(90, Math.min(240, longestLine * 6.5 + 18));
  const height = Math.max(24, lines.length * 14 + 8);

  return {
    id: labelId,
    semanticType: "label",
    text,
    bounds: createRect(centerX - width / 2, centerY - height / 2, width, height),
    parentId: parsedEdge.id,
    styleRef: "text.label"
  };
}

function buildFlowchartSlide(parsed: ParsedMermaidDocument, flowchart: ParsedFlowchart): Slide {
  const state: LayoutState = {
    nodes: [],
    groups: [],
    labels: [],
    nodeBounds: new Map()
  };
  const size = layoutRoot(flowchart, state);
  const edges: Edge[] = [];

  for (const parsedEdge of flowchart.edges) {
    const fromBounds = state.nodeBounds.get(parsedEdge.from);
    const toBounds = state.nodeBounds.get(parsedEdge.to);

    if (!fromBounds || !toBounds) {
      continue;
    }

    const routedEdge = createEdgePath(fromBounds, toBounds);
    let labelId: string | undefined;

    if (parsedEdge.label) {
      labelId = `label-${parsedEdge.id}`;
      state.labels.push(buildEdgeLabel(labelId, parsedEdge, fromBounds, toBounds));
    }

    edges.push({
      id: parsedEdge.id,
      semanticType: "edge",
      from: { nodeId: parsedEdge.from, side: routedEdge.fromSide },
      to: { nodeId: parsedEdge.to, side: routedEdge.toSide },
      path: routedEdge.path,
      labelId,
      styleRef: parsedEdge.style === "dashed" ? "edge.emphasis" : "edge.default",
      metadata: {
        sourceId: parsedEdge.id
      }
    });
  }

  return {
    id: "slide-1",
    name: parsed.title ?? "Scene",
    width: size.width,
    height: size.height,
    groups: state.groups,
    nodes: state.nodes,
    edges,
    labels: state.labels
  };
}

function buildFallbackSlide(parsed: ParsedMermaidDocument): Slide {
  return {
    id: "slide-1",
    name: "Scene",
    width: 1280,
    height: 720,
    groups: [],
    nodes: [
      {
        id: "node-source",
        semanticType: "note",
        shape: "rounded-rectangle",
        text:
          "Unsupported Mermaid dialect for now. Next step: branch a dedicated extractor for this diagram kind.",
        bounds: createRect(70, 110, 760, 120),
        styleRef: "node.default",
        metadata: {
          placeholder: true,
          diagramKind: parsed.diagramKind
        }
      }
    ],
    edges: [],
    labels: []
  };
}

export function buildScene(
  parsed: ParsedMermaidDocument,
  documentPath?: string
): Scene {
  return {
    metadata: {
      generator: "mermaid-editable-export",
      version: "0.1.0",
      source: {
        documentPath,
        diagramKind: parsed.diagramKind,
        sourceText: parsed.sourceText
      }
    },
    slides: [
      parsed.flowchart
        ? buildFlowchartSlide(parsed, parsed.flowchart)
        : buildFallbackSlide(parsed)
    ],
    styles: defaultTheme.map((token) => token.id)
  };
}
