export type StyleTokenId =
  | "group.domain"
  | "group.cluster"
  | "node.default"
  | "node.external"
  | "node.network"
  | "node.process"
  | "node.decision"
  | "node.actor"
  | "node.system"
  | "node.database"
  | "edge.default"
  | "edge.emphasis"
  | "text.title"
  | "text.label"
  | "text.note";

export interface ColorSet {
  fill?: string;
  stroke?: string;
  text?: string;
}

export interface FontStyle {
  family?: string;
  size?: number;
  weight?: "normal" | "medium" | "bold";
  italic?: boolean;
  underline?: boolean;
}

export interface StrokeStyle {
  width?: number;
  dash?: "solid" | "dashed" | "dotted";
}

export interface ShapeStyle {
  colors?: ColorSet;
  font?: FontStyle;
  stroke?: StrokeStyle;
  cornerRadius?: number;
  opacity?: number;
}

export interface StyleToken {
  id: StyleTokenId | string;
  style: ShapeStyle;
  basedOn?: string;
  semanticRoles?: string[];
}
