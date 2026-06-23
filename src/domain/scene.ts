import type { EdgePath, Rect } from "./geometry.js";

export type DiagramKind =
  | "flowchart"
  | "sequence"
  | "class"
  | "state"
  | "unknown";

export type SemanticType =
  | "group"
  | "cluster"
  | "external"
  | "network"
  | "process"
  | "decision"
  | "actor"
  | "system"
  | "database"
  | "note"
  | "edge"
  | "label"
  | "unknown";

export type ShapeKind =
  | "rectangle"
  | "rounded-rectangle"
  | "diamond"
  | "circle"
  | "cylinder"
  | "line"
  | "polyline"
  | "text"
  | "container"
  | "hexagon"
  | "double-circle"
  | "parallelogram"
  | "parallelogram-reversed"
  | "subprocess"
  | "unknown";

export interface SourceRef {
  documentPath?: string;
  diagramKind: DiagramKind;
  sourceText?: string;
  sourceLineStart?: number;
  sourceLineEnd?: number;
}

export interface SceneMetadata {
  generator: string;
  version: string;
  source: SourceRef;
}

export interface PortRef {
  nodeId: string;
  side?: "top" | "right" | "bottom" | "left";
}

export interface DiagramObjectBase {
  id: string;
  name?: string;
  semanticType: SemanticType;
  styleRef?: string;
  sourceRef?: SourceRef;
  metadata?: Record<string, string | number | boolean | string[] | undefined>;
}

export interface Label extends DiagramObjectBase {
  semanticType: "label" | "note";
  text: string;
  bounds?: Rect;
  parentId?: string;
}

export interface Node extends DiagramObjectBase {
  semanticType: Exclude<SemanticType, "edge" | "label">;
  shape: ShapeKind;
  text?: string;
  bounds: Rect;
  childIds?: string[];
}

export interface Edge extends DiagramObjectBase {
  semanticType: "edge";
  from: PortRef;
  to: PortRef;
  path: EdgePath;
  labelId?: string;
}

export interface Group extends DiagramObjectBase {
  semanticType: "group" | "cluster";
  title?: string;
  bounds?: Rect;
  children: string[];
}

export interface Slide {
  id: string;
  name: string;
  width: number;
  height: number;
  groups: Group[];
  nodes: Node[];
  edges: Edge[];
  labels: Label[];
}

export interface Scene {
  metadata: SceneMetadata;
  slides: Slide[];
  styles: string[];
}
