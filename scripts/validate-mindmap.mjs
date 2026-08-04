import { readFile } from "node:fs/promises";

const input = process.argv[2] || "app/ocd-mindmap.json";
const data = JSON.parse(await readFile(input, "utf8"));
const errors = [];
const warnings = [];
const phases = Array.isArray(data?.phases) ? data.phases : [];

if (phases.length === 0) errors.push("The file must contain a non-empty phases array.");

const slug = (value, fallback) =>
  String(value || fallback).toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || fallback;
const phaseIds = phases.map((phase, index) => phase?.id || slug(phase?.title, `phase-${index + 1}`));
const seenPhaseIds = new Set();
const seenCheckIds = new Set();
let checkCount = 0;
let commandCount = 0;

for (const [phaseIndex, phase] of phases.entries()) {
  const location = `phases[${phaseIndex}]`;
  if (!phase || typeof phase !== "object" || Array.isArray(phase)) {
    errors.push(`${location} must be an object.`);
    continue;
  }
  const phaseId = phaseIds[phaseIndex];
  if (seenPhaseIds.has(phaseId)) warnings.push(`${location} duplicates phase id "${phaseId}"; the app will add a numeric suffix.`);
  seenPhaseIds.add(phaseId);
  if (!phase.title) warnings.push(`${location} has no title; the app will generate one.`);
  const checks = Array.isArray(phase.checks) ? phase.checks : [];
  if (!Array.isArray(phase.checks)) warnings.push(`${location}.checks is missing; the phase will be empty.`);

  for (const [checkIndex, check] of checks.entries()) {
    checkCount += 1;
    const checkLocation = `${location}.checks[${checkIndex}]`;
    if (!check || typeof check !== "object" || Array.isArray(check)) {
      errors.push(`${checkLocation} must be an object.`);
      continue;
    }
    const checkId = check.id || slug(`${phaseId}-${check.title}`, `${phaseId}-check-${checkIndex + 1}`);
    if (seenCheckIds.has(checkId)) warnings.push(`${checkLocation} duplicates check id "${checkId}"; the app will add a numeric suffix.`);
    seenCheckIds.add(checkId);
    for (const key of ["commands", "userCommands"]) {
      if (check[key] === undefined) continue;
      if (!Array.isArray(check[key])) {
        errors.push(`${checkLocation}.${key} must be an array.`);
        continue;
      }
      for (const [commandIndex, entry] of check[key].entries()) {
        commandCount += 1;
        const commandLocation = `${checkLocation}.${key}[${commandIndex}]`;
        if (typeof entry === "string") continue;
        if (!entry || typeof entry !== "object" || typeof entry.command !== "string") {
          errors.push(`${commandLocation} must be a command string or an object with a command string.`);
          continue;
        }
        if (entry.info !== undefined && (
          !entry.info || typeof entry.info !== "object" ||
          (entry.info.text !== undefined && typeof entry.info.text !== "string") ||
          (entry.info.references !== undefined && (!Array.isArray(entry.info.references) || entry.info.references.some((reference) => typeof reference !== "string")))
        )) errors.push(`${commandLocation}.info must contain text and a string-array of references.`);
      }
    }
    for (const next of Array.isArray(check.next) ? check.next : []) {
      const normalizedNext = phaseIds.includes(next) ? next : slug(next, "");
      if (!phaseIds.includes(normalizedNext)) warnings.push(`${checkLocation}.next references unknown phase "${next}"; it will be ignored.`);
    }
  }
}

warnings.forEach((warning) => console.warn(`Warning: ${warning}`));
errors.forEach((error) => console.error(`Error: ${error}`));
if (errors.length) process.exit(1);
console.log(`Valid mindmap: ${phases.length} phases, ${checkCount} checks, ${commandCount} commands (${warnings.length} warnings).`);
