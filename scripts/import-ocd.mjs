import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const sourceDir =
  process.argv[2] || "/private/tmp/ocd-mindmaps/excalimap/mindmap/ad";
const output = process.argv[3] || "app/ocd-mindmap.json";

const existingUserCommands = new Map();
try {
  const existingData = JSON.parse(await readFile(output, "utf8"));
  for (const phase of existingData.phases ?? []) {
    for (const check of phase.checks ?? []) {
      if (Array.isArray(check.userCommands)) {
        existingUserCommands.set(check.id, check.userCommands);
      }
    }
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const order = [
  "no_creds", "valid_user", "low_hanging", "mitm", "crack_hash",
  "authenticated", "low_access", "know_vuln_auth", "acl", "delegation",
  "adcs", "sccm", "admin", "lat_move", "dom_admin", "trusts", "persistence",
];

const meta = {
  no_creds: ["01 · Initial access", "#f59e0b"],
  valid_user: ["02 · Identity", "#f97316"],
  low_hanging: ["03 · Quick compromise", "#eab308"],
  mitm: ["04 · Network position", "#ef4444"],
  crack_hash: ["05 · Credential recovery", "#ec4899"],
  authenticated: ["06 · Domain context", "#8b5cf6"],
  low_access: ["07 · Host escalation", "#22c55e"],
  know_vuln_auth: ["08 · Known vulnerabilities", "#f43f5e"],
  acl: ["09 · Directory permissions", "#06b6d4"],
  delegation: ["10 · Ticket paths", "#3b82f6"],
  adcs: ["11 · Certificate paths", "#14b8a6"],
  sccm: ["12 · Management plane", "#84cc16"],
  admin: ["13 · Credential access", "#a855f7"],
  lat_move: ["14 · Expansion", "#6366f1"],
  dom_admin: ["15 · Domain control", "#dc2626"],
  trusts: ["16 · Cross-boundary", "#0ea5e9"],
  persistence: ["17 · Post-exploitation", "#64748b"],
};

const slug = (value) =>
  value.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const clean = (value) =>
  value
    .replace(/>>>.*$/g, "")
    .replace(/\|\|.*$/g, "")
    .replace(/@CVE@/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();

function extractCommands(line) {
  const values = [];
  for (const match of line.matchAll(/`([^`]+)`/g)) {
    const command = match[1].trim();
    if (command) values.push(command);
  }
  return values;
}

function extractTargets(line) {
  const marker = line.indexOf(">>>");
  if (marker === -1) return [];
  return line
    .slice(marker + 3)
    .split("||")
    .map(clean)
    .filter(Boolean);
}

function toolFrom(command) {
  const normalized = command.replace(/^(sudo|proxychains)\s+/, "").trim();
  return normalized.split(/\s+/)[0].replace(/^\.\\/, "").replace(/^.*\//, "");
}

async function parseFile(file) {
  const key = basename(file, ".md");
  const lines = (await readFile(join(sourceDir, file), "utf8")).split(/\r?\n/);
  const title = clean(lines.find((line) => line.startsWith("# "))?.slice(2) || key);
  const phase = {
    id: key.replaceAll("_", "-"),
    sourceKey: key,
    title,
    eyebrow: meta[key]?.[0] || "Reference",
    color: meta[key]?.[1] || "#64748b",
    description: "Original Orange Cyberdefense v2025.03 checks and commands.",
    checks: [],
  };
  let current = null;
  for (const line of lines) {
    if (line.startsWith("## ")) {
      const raw = line.slice(3).trim();
      const checkId = `${key}-${slug(raw)}`;
      current = {
        id: checkId,
        title: clean(raw),
        detail: "",
        commands: [],
        userCommands: existingUserCommands.get(checkId) ?? [],
        tools: [],
        nextLabels: extractTargets(raw),
        source: file,
      };
      phase.checks.push(current);
      continue;
    }
    if (!current || line.startsWith("# ")) continue;
    for (const target of extractTargets(line)) {
      if (!current.nextLabels.includes(target)) current.nextLabels.push(target);
    }
    const commands = extractCommands(line);
    for (const command of commands) {
      if (!current.commands.includes(command)) current.commands.push(command);
      const tool = toolFrom(command);
      if (tool && !current.tools.includes(tool)) current.tools.push(tool);
    }
    if (commands.length === 0 && /^\s*-\s+/.test(line)) {
      const text = clean(line.replace(/^\s*-\s+/, ""));
      if (text && current.detail.length < 420) {
        current.detail = [current.detail, text].filter(Boolean).join(" · ");
      }
    }
  }
  for (const check of phase.checks) {
    if (!check.detail) check.detail = "Review the source condition and record the result.";
  }
  return phase;
}

const files = (await readdir(sourceDir)).filter(
  (file) => file.endsWith(".md") && !["authors.md"].includes(file),
);
const phases = (await Promise.all(files.map(parseFile)))
  .filter((phase) => phase.checks.length)
  .sort((a, b) => order.indexOf(a.sourceKey) - order.indexOf(b.sourceKey));

const routeAliases = {
  "domain admin": "dom-admin",
  dcsync: "dom-admin",
  "lateral move": "lat-move",
  "lat move": "lat-move",
  "pass the ticket": "lat-move",
  "pass the hash": "lat-move",
  passthehash: "lat-move",
  "pass the certificate": "lat-move",
  "clear text move": "lat-move",
  "smb socks": "lat-move",
  "mssql socks": "lat-move",
  "low access": "low-access",
  "vulnerable host": "low-hanging",
  username: "valid-user",
  "user account": "authenticated",
  "valid user": "authenticated",
  "simple user": "authenticated",
  "clear text credentials": "authenticated",
  "clear text pass": "authenticated",
  "user with clear text pass": "authenticated",
  "user + pass": "authenticated",
  credentials: "authenticated",
  "hash found": "crack-hash",
  "hash ntlm": "crack-hash",
  "pxe hash": "crack-hash",
  "timeroast hash": "crack-hash",
  "mscache 2": "crack-hash",
  "crack hash": "crack-hash",
  poisoning: "mitm",
  "coerce smb": "mitm",
  "coerce http": "mitm",
  "relay ntlm": "mitm",
  "ldap shell": "acl",
  "shadow credentials": "delegation",
  rbcd: "delegation",
  delegation: "delegation",
  esc: "adcs",
  "web enrollement": "adcs",
  "web enrollment": "adcs",
  "vulnerable template": "adcs",
  "vulnerable ca": "adcs",
  "pki object": "adcs",
  "naa account": "sccm",
  "naa credentials": "sccm",
  "sccm admin": "sccm",
  trust: "trusts",
  persistence: "persistence",
  admin: "admin",
  adcs: "adcs",
  acl: "acl",
  access: "low-access",
};
const orderedRouteAliases = Object.entries(routeAliases).sort(
  ([left], [right]) => right.length - left.length,
);
for (const phase of phases) {
  for (const check of phase.checks) {
    check.next = [...new Set(check.nextLabels.map((label) => {
      const normalized = label.toLowerCase();
      return orderedRouteAliases.find(([alias]) => normalized.includes(alias))?.[1];
    }).filter(Boolean))];
    delete check.nextLabels;
  }
}

await writeFile(
  output,
  `${JSON.stringify(
    {
      source: "Orange-Cyberdefense/ocd-mindmaps",
      version: "2025.03",
      generatedAt: new Date().toISOString(),
      phases,
    },
    null,
    2,
  )}\n`,
);

console.log(`Imported ${phases.length} phases and ${phases.reduce((n, phase) => n + phase.checks.length, 0)} checks.`);
