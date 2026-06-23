import assert from "node:assert/strict";

import { rewriteSlideXmlWithConnectors } from "../backends/pptx-postprocess.js";
import { buildScene } from "../pipeline/build-scene.js";
import { detectDiagramKind, parseMermaidDocument } from "../pipeline/parse.js";
import { decodeMermaidSource } from "../pipeline/source.js";

type TestCase = {
  name: string;
  run: () => void;
};

const flowchartSample = `flowchart LR
subgraph P1["Project 1"]
  A["Start"]
  B{"Decision"}
end
A -->|"go"| B
`;

const tests: TestCase[] = [
  {
    name: "detects flowchart syntax",
    run: () => {
      assert.equal(detectDiagramKind("flowchart LR\nA-->B"), "flowchart");
    }
  },
  {
    name: "detects graph alias",
    run: () => {
      assert.equal(detectDiagramKind("graph TD\nA-->B"), "flowchart");
    }
  },
  {
    name: "detects sequence diagrams",
    run: () => {
      assert.equal(detectDiagramKind("sequenceDiagram\nA->>B: hi"), "sequence");
    }
  },
  {
    name: "returns unknown for unsupported input",
    run: () => {
      assert.equal(detectDiagramKind("pie\n title demo"), "unknown");
    }
  },
  {
    name: "parses groups, nodes and edge labels from flowchart",
    run: () => {
      const parsed = parseMermaidDocument(flowchartSample);
      assert.ok(parsed.flowchart);
      assert.equal(parsed.flowchart?.groups.length, 1);
      assert.equal(parsed.flowchart?.nodes.length, 2);
      assert.equal(parsed.flowchart?.edges.length, 1);
      assert.equal(parsed.flowchart?.edges[0]?.label, "go");
      assert.equal(parsed.flowchart?.nodes[1]?.shape, "diamond");
    }
  },
  {
    name: "preserves explicit Mermaid node labels",
    run: () => {
      const parsed = parseMermaidDocument(`flowchart LR\nA["Route table VPC Admin"]`);
      assert.equal(parsed.flowchart?.nodes[0]?.text, "Route table VPC Admin");
    }
  },
  {
    name: "builds a semantic scene from a parsed flowchart",
    run: () => {
      const parsed = parseMermaidDocument(flowchartSample);
      const scene = buildScene(parsed);
      assert.equal(scene.slides.length, 1);
      assert.equal(scene.slides[0]?.groups.length, 1);
      assert.equal(scene.slides[0]?.nodes.length, 2);
      assert.equal(scene.slides[0]?.edges.length, 1);
      assert.equal(scene.slides[0]?.labels.length, 1);
    }
  },
  {
    name: "infers richer semantic types for actors and external systems",
    run: () => {
      const parsed = parseMermaidDocument(`flowchart LR
Users["Utilisateurs"]
Internet["Internet"]
LB["Load Balancer"]
Users --> LB
LB --> Internet
`);
      const scene = buildScene(parsed);
      const nodesById = new Map(scene.slides[0]?.nodes.map((node) => [node.id, node]));
      assert.equal(nodesById.get("Users")?.semanticType, "actor");
      assert.equal(nodesById.get("Internet")?.semanticType, "external");
      assert.equal(nodesById.get("LB")?.semanticType, "network");
    }
  },
  {
    name: "decodes windows-1252 Mermaid labels without mojibake",
    run: () => {
      const bytes = Buffer.from([
        0x66, 0x6c, 0x6f, 0x77, 0x63, 0x68, 0x61, 0x72, 0x74, 0x20, 0x4c, 0x52,
        0x0a, 0x41, 0x5b, 0x22, 0x52, 0xe9, 0x67, 0x69, 0x6f, 0x6e, 0x22, 0x5d
      ]);
      const decoded = decodeMermaidSource(bytes);
      assert.ok(decoded.includes("Région"));
    }
  },
  {
    name: "rewrites edge segments into attached connector XML",
    run: () => {
      const parsed = parseMermaidDocument(`flowchart LR
A["Start"]
B["End"]
A --> B
`);
      const scene = buildScene(parsed);
      const slideXml = [
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">`,
        `<p:cSld><p:spTree>`,
        `<p:sp><p:nvSpPr><p:cNvPr id="2" name="node:A"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr></p:sp>`,
        `<p:sp><p:nvSpPr><p:cNvPr id="3" name="node:B"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr></p:sp>`,
        `<p:sp><p:nvSpPr><p:cNvPr id="4" name="edge:edge-1:segment:0"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr></p:sp>`,
        `</p:spTree></p:cSld></p:sld>`
      ].join("");
      const rewritten = rewriteSlideXmlWithConnectors(slideXml, scene.slides[0]);
      assert.ok(rewritten.includes("<p:cxnSp>"));
      assert.ok(rewritten.includes('name="connector:edge-1"'));
      assert.ok(rewritten.includes("<a:stCxn id=\"2\""));
      assert.ok(!rewritten.includes('name="edge:edge-1:segment:0"'));
    }
  },
  {
    name: "merges node text boxes into node shapes",
    run: () => {
      const parsed = parseMermaidDocument(`flowchart LR\nA["Start"]`);
      const scene = buildScene(parsed);
      const slideXml = [
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">`,
        `<p:cSld><p:spTree>`,
        `<p:sp><p:nvSpPr><p:cNvPr id="2" name="node:A"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000" cy="600"/></a:xfrm></p:spPr></p:sp>`,
        `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Text 1"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="50" y="50"/><a:ext cx="900" cy="500"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Start</a:t></a:r></a:p></p:txBody></p:sp>`,
        `</p:spTree></p:cSld></p:sld>`
      ].join("");
      const rewritten = rewriteSlideXmlWithConnectors(slideXml, scene.slides[0]);
      assert.ok(rewritten.includes('name="node:A"'));
      assert.ok(rewritten.includes("<a:t>Start</a:t>"));
      assert.ok(!rewritten.includes('name="Text 1"'));
    }
  },
  {
    name: "parses flowchart nodes with classic cylinder shape syntax",
    run: () => {
      const parsed = parseMermaidDocument("flowchart TD\nA[(Database)]");
      assert.ok(parsed.flowchart);
      assert.equal(parsed.flowchart.nodes.length, 1);
      assert.equal(parsed.flowchart.nodes[0]?.id, "A");
      assert.equal(parsed.flowchart.nodes[0]?.shape, "cylinder");
      assert.equal(parsed.flowchart.nodes[0]?.text, "Database");
    }
  },
  {
    name: "parses flowchart nodes with new metadata block shapes and icons",
    run: () => {
      const parsed = parseMermaidDocument(`flowchart TD
A@{ shape: db, label: "PostgreSQL" }
B@{ shape: cloud, label: "Internet" }
C@{ icon: "shield", label: "Firewall" }
`);
      assert.ok(parsed.flowchart);
      assert.equal(parsed.flowchart.nodes.length, 3);
      
      const a = parsed.flowchart.nodes[0]!;
      assert.equal(a.id, "A");
      assert.equal(a.shape, "cylinder");
      assert.equal(a.text, "PostgreSQL");
      assert.equal(a.mermaidShape, "db");

      const b = parsed.flowchart.nodes[1]!;
      assert.equal(b.id, "B");
      assert.equal(b.shape, "rounded-rectangle");
      assert.equal(b.text, "Internet");
      assert.equal(b.mermaidShape, "cloud");

      const c = parsed.flowchart.nodes[2]!;
      assert.equal(c.id, "C");
      assert.equal(c.shape, "rectangle");
      assert.equal(c.text, "Firewall");
      assert.equal(c.iconKey, "shield");
    }
  },
  {
    name: "parses inline classes and standalone class statements",
    run: () => {
      const parsed = parseMermaidDocument(`flowchart TD
A:::database
B
class B critical,critical-style
`);
      assert.ok(parsed.flowchart);
      assert.equal(parsed.flowchart.nodes.length, 2);
      
      const a = parsed.flowchart.nodes.find(n => n.id === "A")!;
      assert.deepEqual(a.classes, ["database"]);

      const b = parsed.flowchart.nodes.find(n => n.id === "B")!;
      assert.deepEqual(b.classes, ["critical", "critical-style"]);
    }
  },
  {
    name: "parses edge declarations combined with new metadata shape blocks",
    run: () => {
      const parsed = parseMermaidDocument(`flowchart TD
A@{ shape: cloud, label: "CloudFlare" } --> B@{ shape: db, label: "Postgres" }
`);
      assert.ok(parsed.flowchart);
      assert.equal(parsed.flowchart.nodes.length, 2);
      assert.equal(parsed.flowchart.edges.length, 1);
      
      const a = parsed.flowchart.nodes[0]!;
      assert.equal(a.id, "A");
      assert.equal(a.mermaidShape, "cloud");
      assert.equal(a.text, "CloudFlare");

      const b = parsed.flowchart.nodes[1]!;
      assert.equal(b.id, "B");
      assert.equal(b.mermaidShape, "db");
      assert.equal(b.text, "Postgres");

      assert.equal(parsed.flowchart.edges[0]?.from, "A");
      assert.equal(parsed.flowchart.edges[0]?.to, "B");
    }
  },
  {
    name: "builds semantic scenes with rich node metadata and semantic types",
    run: () => {
      const parsed = parseMermaidDocument(`flowchart TD
A@{ shape: db, label: "PostgreSQL" }
B@{ shape: cloud, label: "Internet" }
C@{ icon: "shield", label: "Firewall" }
D:::database
`);
      const scene = buildScene(parsed);
      assert.equal(scene.slides.length, 1);
      const nodes = scene.slides[0]!.nodes;
      
      const a = nodes.find(n => n.id === "A")!;
      assert.equal(a.semanticType, "database");
      assert.equal(a.shape, "cylinder");
      assert.equal(a.metadata?.mermaidShape, "db");
      assert.equal(a.metadata?.iconKey, "database");

      const b = nodes.find(n => n.id === "B")!;
      assert.equal(b.semanticType, "network");
      assert.equal(b.metadata?.mermaidShape, "cloud");
      assert.equal(b.metadata?.iconKey, "cloud");

      const c = nodes.find(n => n.id === "C")!;
      assert.equal(c.semanticType, "network");
      assert.equal(c.metadata?.iconKey, "shield");

      const d = nodes.find(n => n.id === "D")!;
      assert.equal(d.semanticType, "database");
      assert.deepEqual(d.metadata?.classes, ["database"]);
    }
  }
];

let failed = 0;

for (const test of tests) {
  try {
    test.run();
    console.log(`PASS ${test.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${test.name}`);
    console.error(error);
  }
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`\n${tests.length} test(s) passed.`);
}
