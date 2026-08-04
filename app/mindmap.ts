export type CommandInfo = {
  text: string;
  references: string[];
};

export type CommandEntry = string | {
  command: string;
  info?: CommandInfo;
};

export type Check = {
  id: string;
  title: string;
  detail: string;
  commands: CommandEntry[];
  userCommands: CommandEntry[];
  next: string[];
  caution?: string;
};

export type Phase = {
  id: string;
  sourceKey: string;
  title: string;
  color: string;
  checks: Check[];
};

const phaseColors = [
  "#f59e0b", "#f97316", "#eab308", "#ef4444", "#ec4899", "#8b5cf6",
  "#22c55e", "#f43f5e", "#06b6d4", "#3b82f6", "#14b8a6", "#84cc16",
  "#a855f7", "#6366f1", "#dc2626", "#0ea5e9", "#64748b",
];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function slug(value: string, fallback: string) {
  return value.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || fallback;
}

function uniqueId(preferred: string, used: Set<string>) {
  let id = preferred;
  let suffix = 2;
  while (used.has(id)) id = `${preferred}-${suffix++}`;
  used.add(id);
  return id;
}

function command(entry: unknown): CommandEntry | null {
  if (typeof entry === "string") return entry.trim() || null;
  const raw = record(entry);
  const value = text(raw.command);
  if (!value) return null;
  const rawInfo = record(raw.info);
  const references = Array.isArray(rawInfo.references)
    ? rawInfo.references.filter((reference): reference is string => typeof reference === "string")
    : [];
  return {
    command: value,
    info: {
      text: typeof rawInfo.text === "string" ? rawInfo.text : "",
      references,
    },
  };
}

function commands(value: unknown) {
  return Array.isArray(value) ? value.map(command).filter((entry): entry is CommandEntry => entry !== null) : [];
}

export function normalizeMindmap(value: unknown): Phase[] {
  const rawPhases = record(value).phases;
  if (!Array.isArray(rawPhases) || rawPhases.length === 0) throw new Error("Mindmap JSON must contain a non-empty phases array.");

  const usedPhaseIds = new Set<string>();
  const usedCheckIds = new Set<string>();
  const phases = rawPhases.map((phaseValue, phaseIndex) => {
    const rawPhase = record(phaseValue);
    const title = text(rawPhase.title, `Phase ${phaseIndex + 1}`);
    const suggestedPhaseId = text(rawPhase.id) || slug(title, `phase-${phaseIndex + 1}`);
    const id = uniqueId(suggestedPhaseId, usedPhaseIds);
    const rawChecks = Array.isArray(rawPhase.checks) ? rawPhase.checks : [];
    const checks = rawChecks.map((checkValue, checkIndex) => {
      const rawCheck = record(checkValue);
      const checkTitle = text(rawCheck.title, `Check ${checkIndex + 1}`);
      const suggestedCheckId = text(rawCheck.id) || slug(`${id}-${checkTitle}`, `${id}-check-${checkIndex + 1}`);
      return {
        id: uniqueId(suggestedCheckId, usedCheckIds),
        title: checkTitle,
        detail: typeof rawCheck.detail === "string" ? rawCheck.detail : "",
        commands: commands(rawCheck.commands),
        userCommands: commands(rawCheck.userCommands),
        next: Array.isArray(rawCheck.next) ? rawCheck.next.filter((next): next is string => typeof next === "string") : [],
        caution: typeof rawCheck.caution === "string" && rawCheck.caution.trim() ? rawCheck.caution : undefined,
      };
    });
    const sourceKey = text(rawPhase.sourceKey, id.replaceAll("-", "_"));
    const color = text(rawPhase.color, phaseColors[phaseIndex % phaseColors.length]);
    return { id, sourceKey, title, color, checks };
  });

  const phaseIds = new Set(phases.map((phase) => phase.id));
  phases.forEach((phase) => phase.checks.forEach((check) => {
    check.next = [...new Set(check.next.map((next) => phaseIds.has(next) ? next : slug(next, "")).filter((next) => phaseIds.has(next)))];
  }));
  return phases;
}
