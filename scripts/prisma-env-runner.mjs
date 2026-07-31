#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const argv = process.argv.slice(2);

if (argv.length === 0) {
  console.error("Usage: node scripts/prisma-env-runner.mjs <prisma-args...>");
  process.exit(1);
}

const initialProcessKeys = new Set(Object.keys(process.env));
const loadedFromFiles = new Set();

for (const envFileName of [".env", ".env.local"]) {
  const filePath = resolve(ROOT, envFileName);

  if (!existsSync(filePath)) {
    continue;
  }

  const content = readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalizedLine = line.startsWith("export ") ? line.slice(7) : line;
    const delimiterIndex = normalizedLine.indexOf("=");

    if (delimiterIndex <= 0) {
      continue;
    }

    const key = normalizedLine.slice(0, delimiterIndex).trim();
    let value = normalizedLine.slice(delimiterIndex + 1).trim();

    if (!key) {
      continue;
    }

    const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');
    const isSingleQuoted = value.startsWith("'") && value.endsWith("'");

    if (isDoubleQuoted || isSingleQuoted) {
      value = value.slice(1, -1);

      if (isDoubleQuoted) {
        value = value.replace(/\\n/g, "\n");
      }
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }

    if (initialProcessKeys.has(key) && !loadedFromFiles.has(key)) {
      continue;
    }

    process.env[key] = value;
    loadedFromFiles.add(key);
  }
}

const isGenerateCommand = argv[0] === "generate";

if (!process.env.DATABASE_URL && isGenerateCommand) {
  process.env.DATABASE_URL = "postgresql://generate-only:generate-only@localhost:5432/generate-only";
}

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is still missing. Add it to .env.local or .env before running Prisma commands.",
  );
  process.exit(1);
}

const prismaCliJs = resolve(ROOT, "node_modules", "prisma", "build", "index.js");

if (!existsSync(prismaCliJs)) {
  console.error(
    "Prisma CLI not found at node_modules/prisma/build/index.js. Run npm install and try again.",
  );
  process.exit(1);
}

const result = spawnSync(process.execPath, [prismaCliJs, ...argv], {
  stdio: "inherit",
  env: process.env,
  shell: false,
});

if (result.error) {
  console.error(`Failed to run Prisma CLI: ${result.error.message}`);
}

process.exit(result.status ?? 1);
