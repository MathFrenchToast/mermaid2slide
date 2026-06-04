import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { resolve, basename } from "node:path";
import { convertMermaidFileToScene } from "./pipeline/converter.js";
import { createExporter } from "./backends/create-exporter.js";
import { readdir, stat, unlink, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Setup Multer for file uploads
const uploadDir = resolve("uploads");
const outputDir = resolve("outputs");
const frontendDist = resolve("frontend/dist");

// Serve frontend static files
app.use(express.static(frontendDist));

// Ensure directories exist
if (!existsSync(uploadDir)) {
  mkdir(uploadDir, { recursive: true }).catch(console.error);
}
if (!existsSync(outputDir)) {
  mkdir(outputDir, { recursive: true }).catch(console.error);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  }
});

const upload = multer({ storage });

// Cleanup function for temporary files
async function cleanupOldFiles(directory: string, maxAgeMinutes: number) {
  try {
    const files = await readdir(directory);
    const now = Date.now();
    for (const file of files) {
      if (file === ".gitkeep" || file === ".gitignore") continue;
      const filePath = resolve(directory, file);
      const fileStat = await stat(filePath);
      const ageMinutes = (now - fileStat.mtimeMs) / (1000 * 60);
      if (ageMinutes > maxAgeMinutes) {
        await unlink(filePath);
        console.log(`Cleaned up old file: ${filePath}`);
      }
    }
  } catch (error) {
    console.error(`Error during cleanup in ${directory}:`, error);
  }
}

// Run cleanup every minute
setInterval(() => {
  cleanupOldFiles(uploadDir, 5);
  cleanupOldFiles(outputDir, 5);
}, 60 * 1000);

// API Route for conversion
app.post("/api/convert", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const token = req.body["cf-turnstile-response"];
    if (!token) {
      return res.status(400).json({ error: "Captcha token missing" });
    }

    const secretKey = process.env.TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA'; // Testing secret key

    const verifyResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secret: secretKey,
        response: token,
      }),
    });

    const verifyData = await verifyResponse.json();
    if (!verifyData.success) {
      return res.status(403).json({ error: "Captcha validation failed" });
    }

    const inputPath = req.file.path;
    const originalName = req.file.originalname;
    const outputName = `${basename(originalName, ".mermaid")}.scene.pptx`;
    const outputPath = resolve(outputDir, `${Date.now()}-${outputName}`);

    const scene = await convertMermaidFileToScene(inputPath);
    const exporter = createExporter("pptx");
    const artifact = await exporter.export({ scene, outputPath });

    res.download(artifact.outputPath, outputName, (err) => {
      if (err) {
        console.error("Error sending file:", err);
      }
    });
  } catch (error) {
    console.error("Conversion error:", error);
    res.status(500).json({ error: "Conversion failed" });
  }
});

// Fallback to serve index.html for SPA
app.get("*", (req, res) => {
  res.sendFile(resolve(frontendDist, "index.html"));
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
