export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

export interface EdgePath {
  points: Point[];
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
