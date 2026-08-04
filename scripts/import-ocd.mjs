import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const sourceDir =
  process.argv[2] || "/private/tmp/ocd-mindmaps/excalimap/mindmap/ad";
const output = process.argv[3] || "app/ocd-mindmap.json";

const existingUserCommands = new Map();
const existingCommandInfo = new Map();
const commandText = (entry) => typeof entry === "string" ? entry : entry?.command;
try {
  const existingData = JSON.parse(await readFile(output, "utf8"));
  for (const phase of existingData.phases ?? []) {
    for (const check of phase.checks ?? []) {
      if (Array.isArray(check.userCommands)) {
        existingUserCommands.set(check.id, check.userCommands);
      }
      for (const entry of check.commands ?? []) {
        const value = commandText(entry);
        if (value && entry?.info) existingCommandInfo.set(`${check.id}\0${value}`, entry.info);
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

const colors = {
  no_creds: "#f59e0b", valid_user: "#f97316", low_hanging: "#eab308",
  mitm: "#ef4444", crack_hash: "#ec4899", authenticated: "#8b5cf6",
  low_access: "#22c55e", know_vuln_auth: "#f43f5e", acl: "#06b6d4",
  delegation: "#3b82f6", adcs: "#14b8a6", sccm: "#84cc16",
  admin: "#a855f7", lat_move: "#6366f1", dom_admin: "#dc2626",
  trusts: "#0ea5e9", persistence: "#64748b",
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

async function parseFile(file) {
  const key = basename(file, ".md");
  const lines = (await readFile(join(sourceDir, file), "utf8")).split(/\r?\n/);
  const title = clean(lines.find((line) => line.startsWith("# "))?.slice(2) || key);
  const phase = {
    id: key.replaceAll("_", "-"),
    sourceKey: key,
    title,
    color: colors[key] || "#64748b",
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
        nextLabels: extractTargets(raw),
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
      if (!current.commands.some((entry) => commandText(entry) === command)) {
        current.commands.push({
          command,
          info: existingCommandInfo.get(`${current.id}\0${command}`) ?? { text: "", references: [] },
        });
      }
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
    { phases },
    null,
    2,
  )}\n`,
);

console.log(`Imported ${phases.length} phases and ${phases.reduce((n, phase) => n + phase.checks.length, 0)} checks.`);
