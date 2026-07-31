import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const policy = JSON.parse(await readFile(new URL("../security/advisory-exceptions.json", import.meta.url), "utf8"));
const npmCli = process.env.npm_execpath;
const command = npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const args = npmCli ? [npmCli, "audit", "--omit=dev", "--json"] : ["audit", "--omit=dev", "--json"];
const result = spawnSync(command, args, { encoding: "utf8", shell: false, maxBuffer: 10 * 1024 * 1024 });

if (result.error || !result.stdout) throw new Error("Unable to run the runtime dependency audit.");
const report = JSON.parse(result.stdout);
const vulnerabilities = report.vulnerabilities ?? {};
const severityRank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

function acceptedAdvisory(via, packageName) {
  if (typeof via === "string") return acceptedPackage(via, new Set([packageName]));
  const advisory = typeof via?.url === "string" ? via.url.split("/").at(-1) : null;
  if (!advisory) return false;
  return policy.exceptions.some((exception) => {
    const unexpired = Date.parse(`${exception.expiresOn}T23:59:59Z`) >= Date.now();
    return exception.advisory === advisory &&
      exception.package === packageName &&
      unexpired &&
      severityRank[via.severity] <= severityRank[exception.maximumSeverity];
  });
}

function acceptedPackage(packageName, seen = new Set()) {
  if (seen.has(packageName)) return false;
  const vulnerability = vulnerabilities[packageName];
  if (!vulnerability || vulnerability.severity === "critical") return false;
  const nextSeen = new Set(seen).add(packageName);
  return Array.isArray(vulnerability.via) && vulnerability.via.length > 0 && vulnerability.via.every((via) =>
    typeof via === "string" ? acceptedPackage(via, nextSeen) : acceptedAdvisory(via, packageName));
}

const unaccepted = Object.entries(vulnerabilities)
  .filter(([, vulnerability]) => severityRank[vulnerability.severity] >= severityRank.high)
  .filter(([packageName]) => !acceptedPackage(packageName));

if (unaccepted.length > 0) {
  throw new Error(`Unaccepted high/critical runtime advisories: ${unaccepted.map(([name]) => name).join(", ")}`);
}

console.log(`Runtime dependency policy passed (${Object.keys(vulnerabilities).length} reported package findings, all accepted or below threshold).`);
