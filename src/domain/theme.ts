import type { StyleToken } from "./style.js";

export const defaultTheme: StyleToken[] = [
  {
    id: "group.domain",
    style: {
      colors: { fill: "#F7F5EC", stroke: "#8D7B55", text: "#2A251B" },
      stroke: { width: 1.5, dash: "solid" },
      font: { family: "Aptos", size: 16, weight: "bold" },
      cornerRadius: 10
    }
  },
  {
    id: "group.cluster",
    style: {
      colors: { fill: "#FCFBF7", stroke: "#B6AA87", text: "#2A251B" },
      stroke: { width: 1, dash: "dashed" },
      font: { family: "Aptos", size: 13, weight: "bold" },
      cornerRadius: 8
    }
  },
  {
    id: "node.default",
    style: {
      colors: { fill: "#FFFFFF", stroke: "#5E6472", text: "#1F2430" },
      stroke: { width: 1, dash: "solid" },
      font: { family: "Aptos", size: 12, weight: "medium" },
      cornerRadius: 6
    }
  },
  {
    id: "node.external",
    basedOn: "node.default",
    style: {
      colors: { fill: "#F6EFE3", stroke: "#A36A1F", text: "#5C3707" }
    }
  },
  {
    id: "node.network",
    basedOn: "node.default",
    style: {
      colors: { fill: "#EAF3F0", stroke: "#3E7A6A", text: "#1D433A" }
    }
  },
  {
    id: "node.process",
    basedOn: "node.default",
    style: {
      colors: { fill: "#E8F1FB", stroke: "#3F6EA8", text: "#17314F" }
    }
  },
  {
    id: "node.decision",
    basedOn: "node.default",
    style: {
      colors: { fill: "#FFF0CC", stroke: "#A96A00", text: "#5E3B00" }
    }
  },
  {
    id: "node.actor",
    basedOn: "node.default",
    style: {
      colors: { fill: "#FCE8E6", stroke: "#A6473D", text: "#5A231E" }
    }
  },
  {
    id: "node.system",
    basedOn: "node.default",
    style: {
      colors: { fill: "#E7F7EE", stroke: "#2E7D55", text: "#153E2B" }
    }
  },
  {
    id: "node.database",
    basedOn: "node.default",
    style: {
      colors: { fill: "#EFEAFE", stroke: "#6D56B3", text: "#35235F" }
    }
  },
  {
    id: "edge.default",
    style: {
      colors: { stroke: "#5E6472", text: "#3B4252" },
      stroke: { width: 1.25, dash: "solid" },
      font: { family: "Aptos", size: 11, weight: "normal" }
    }
  },
  {
    id: "edge.emphasis",
    basedOn: "edge.default",
    style: {
      colors: { stroke: "#A6473D", text: "#5A231E" },
      stroke: { width: 1.5, dash: "dashed" }
    }
  },
  {
    id: "text.title",
    style: {
      colors: { text: "#1F2430" },
      font: { family: "Aptos Display", size: 20, weight: "bold" }
    }
  },
  {
    id: "text.label",
    style: {
      colors: { text: "#283142" },
      font: { family: "Aptos", size: 11, weight: "normal" }
    }
  },
  {
    id: "text.note",
    style: {
      colors: { text: "#4B5563" },
      font: { family: "Aptos", size: 10, weight: "normal", italic: true }
    }
  }
];
