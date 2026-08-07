"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import ocdMindmap from "./ocd-mindmap.json";
import { normalizeMindmap, type CommandEntry, type CommandInfo } from "./mindmap";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const ocdAdSourceUrl = "https://github.com/Orange-Cyberdefense/ocd-mindmaps/blob/main/excalimap/mindmap/ad";

type Status = "todo" | "found" | "clear";

type AttackConnector = {
  id: string;
  path: string;
  originX: number;
  originY: number;
  color: string;
};

const phases = normalizeMindmap(ocdMindmap);
const allChecks = phases.flatMap((phase) => phase.checks);
const initialPhaseId = phases[0].id;
const phaseById = Object.fromEntries(phases.map((phase) => [phase.id, phase]));
const knownCheckIds = new Set(allChecks.map((check) => check.id));

function commandText(entry: CommandEntry) {
  return typeof entry === "string" ? entry : entry.command;
}

function populatedCommandInfo(entry: CommandEntry) {
  if (typeof entry === "string" || !entry.info?.text.trim()) return null;
  const references = entry.info.references.filter((reference) => /^https?:\/\//i.test(reference.trim()));
  return references.length > 0 ? { text: entry.info.text.trim(), references } : null;
}

const commandVariableNames = Array.from(new Set(
  allChecks
    .flatMap((check) => [...(check.commands ?? []), ...(check.userCommands ?? [])])
    .flatMap((command) => Array.from(commandText(command).matchAll(/<([A-Za-z0-9_]+)>/g), (match) => match[1])),
)).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
const knownVariableNames = new Set(commandVariableNames);
const backupFormat = "ad-pathfinder-engagement";
const backupVersion = 1;

function isSensitiveVariable(name: string) {
  return /pass(word)?/i.test(name);
}

function sanitizeVariables(value: unknown) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([name, variableValue]) => knownVariableNames.has(name) && typeof variableValue === "string")
      .map(([name, variableValue]) => [name, (variableValue as string).slice(0, 2_000)]),
  );
}

function MetasploitLogo() {
  return (
    <svg className="metasploit-logo" role="img" viewBox="0 0 24 24" aria-label="Metasploit">
      <path d="M11.353 0h1.368q4.19.218 8.144 1.616.217.077.216.309-.015 4.033-.002 12.102 0 .81-.093 1.173c-.217.845-.76 1.635-1.326 2.325q-.318.388-1.024 1.046-2.955 2.75-6.01 5.094-.183.14-.516.335h-.17q-.627-.42-.945-.673-3.992-3.184-5.442-4.459-1.348-1.185-2.169-2.611c-.369-.64-.466-1.287-.465-2.099q.01-6.048.002-12.218c0-.183.09-.264.261-.325Q7.145.227 11.352 0ZM7.474 7.864q0-.094.069-.031l2.797 2.516a.374.372 21.2 0 1 .122.276l-.006 4.333a.182.182 0 0 0 .183.184l2.524-.018a.11.11 89.8 0 0 .108-.11q-.007-2.201.01-4.461.002-.173.146-.29 1.397-1.145 2.946-2.393.068-.055.068.032v10.881q0 .092.063.024.794-.865 1.628-1.838.71-.83.984-1.87.26-.989.262-1.997.007-4.754.009-9.768a.136.136 0 0 0-.137-.136q-1.15.004-2.424 0c-.287-.002-.441-.022-.619.149Q14.16 5.317 11.982 7.4a.046.046 0 0 1-.062 0Q9.782 5.437 7.769 3.525c-.234-.222-.515-.381-.843-.373q-1.09.026-2.33.005-.184-.004-.184.18-.003 4.54.005 9.032.002.536.036 1.027c.076 1.093.2 2.126.803 3.021.574.852 1.329 1.656 2.126 2.405q.023.022.054.026.04.006.04-.034z" />
    </svg>
  );
}

export default function Home() {
  const [activeId, setActiveId] = useState(initialPhaseId);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState("");
  const [query, setQuery] = useState("");
  const [showClear, setShowClear] = useState(true);
  const [showAttackPaths, setShowAttackPaths] = useState(true);
  const [showVariables, setShowVariables] = useState(false);
  const [variableQuery, setVariableQuery] = useState("");
  const [showInformation, setShowInformation] = useState(false);
  const [activeCommandInfo, setActiveCommandInfo] = useState<CommandInfo | null>(null);
  const [attackConnectors, setAttackConnectors] = useState<AttackConnector[]>([]);
  const [ready, setReady] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const phaseButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const checkCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const workspaceRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const phase = phaseById[activeId];

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("ad-pathfinder-v1") || "{}");
      setStatuses(saved.statuses || {});
      setNotes(saved.notes || {});
      const savedVariables = sanitizeVariables(saved.variables);
      if (saved.profile && typeof saved.profile === "object") {
        if (!savedVariables.domain && typeof saved.profile.domain === "string") savedVariables.domain = saved.profile.domain;
        if (!savedVariables.username && typeof saved.profile.username === "string") savedVariables.username = saved.profile.username;
      }
      setVariables(savedVariables);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem("ad-pathfinder-v1", JSON.stringify({ statuses, notes, variables }));
  }, [statuses, notes, variables, ready]);

  useEffect(() => {
    if (!showInformation && !activeCommandInfo) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowInformation(false);
        setActiveCommandInfo(null);
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showInformation, activeCommandInfo]);

  useEffect(() => {
    let frame = 0;
    function updateConnectors() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!showAttackPaths || window.innerWidth <= 760) {
          setAttackConnectors([]);
          return;
        }

        const workspace = workspaceRef.current;
        if (!workspace) return;
        const workspaceRect = workspace.getBoundingClientRect();
        const nextConnectors: AttackConnector[] = [];
        for (const check of phase.checks) {
          if (statuses[check.id] !== "found" || check.next.length === 0) continue;
          const card = checkCardRefs.current[check.id];
          if (!card) continue;
          const cardRect = card.getBoundingClientRect();

          const originX = cardRect.left - workspaceRect.left;
          const originY = cardRect.top - workspaceRect.top + Math.min(32, cardRect.height / 2);
          for (const targetId of check.next) {
            const target = phaseButtonRefs.current[targetId];
            if (!target) continue;
            const targetRect = target.getBoundingClientRect();
            const targetX = targetRect.right - workspaceRect.left + 4;
            const targetY = targetRect.top - workspaceRect.top + targetRect.height / 2;
            const bend = Math.max(24, (originX - targetX) * .45);
            nextConnectors.push({
              id: `${check.id}-${targetId}`,
              path: `M ${originX} ${originY} C ${originX - bend} ${originY}, ${targetX + bend} ${targetY}, ${targetX} ${targetY}`,
              originX,
              originY,
              color: "#ff7900",
            });
          }
        }
        setAttackConnectors(nextConnectors);
      });
    }

    updateConnectors();
    window.addEventListener("resize", updateConnectors);
    window.addEventListener("scroll", updateConnectors, true);
    const observer = new ResizeObserver(updateConnectors);
    if (workspaceRef.current) observer.observe(workspaceRef.current);
    if (contentRef.current) observer.observe(contentRef.current);
    if (sidebarRef.current) observer.observe(sidebarRef.current);
    Object.values(checkCardRefs.current).forEach((card) => card && observer.observe(card));
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateConnectors);
      window.removeEventListener("scroll", updateConnectors, true);
      observer.disconnect();
    };
  }, [activeId, phase, query, showAttackPaths, showClear, statuses]);

  const foundChecks = allChecks.filter((check) => statuses[check.id] === "found");
  const unlocked = useMemo(() => {
    const ids = new Set([initialPhaseId]);
    foundChecks.forEach((check) => check.next?.forEach((id) => ids.add(id)));
    return ids;
  }, [foundChecks]);
  const phaseNumber = String(phases.findIndex((item) => item.id === phase.id) + 1).padStart(2, "0");
  const visibleChecks = phase.checks.filter((check) => {
    const haystack = `${check.title} ${check.detail} ${check.commands.map(commandText).join(" ")} ${check.userCommands.map(commandText).join(" ")}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (showClear || statuses[check.id] !== "clear");
  });
  const completed = allChecks.filter((check) => statuses[check.id] && statuses[check.id] !== "todo").length;
  const progress = Math.round((completed / allChecks.length) * 100);
  const configuredVariableCount = Object.values(variables).filter(Boolean).length;
  const visibleVariableNames = commandVariableNames.filter((name) => name.toLowerCase().includes(variableQuery.toLowerCase()));

  function setStatus(id: string, status: Status) {
    setStatuses((current) => ({ ...current, [id]: current[id] === status ? "todo" : status }));
  }

  function resetEngagement() {
    if (!window.confirm("Reset every check and note for this engagement?")) return;
    setStatuses({});
    setNotes({});
    setVariables({});
  }

  function exportEngagement() {
    const accepted = window.confirm(
      "Exported engagement data is not encrypted and may contain sensitive client information. Keep the file secure and only import it into AD Pathfinder deployments you trust. Continue?",
    );
    if (!accepted) return;

    const backup = {
      format: backupFormat,
      version: backupVersion,
      exportedAt: new Date().toISOString(),
      data: { statuses, notes, variables },
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ad-pathfinder-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function requestImport() {
    const accepted = window.confirm(
      "Only import engagement files into AD Pathfinder deployments you trust. The file may contain sensitive client data. Continue and choose a file?",
    );
    if (accepted) importInputRef.current?.click();
  }

  async function importEngagement(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      if (file.size > 1024 * 1024) throw new Error("The backup is larger than 1 MB.");
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      if (parsed.format !== backupFormat || parsed.version !== backupVersion || !parsed.data || typeof parsed.data !== "object") {
        throw new Error("This is not a supported AD Pathfinder engagement backup.");
      }

      const data = parsed.data as Record<string, unknown>;
      const rawStatuses = data.statuses && typeof data.statuses === "object" ? data.statuses as Record<string, unknown> : {};
      const rawNotes = data.notes && typeof data.notes === "object" ? data.notes as Record<string, unknown> : {};
      const rawProfile = data.profile && typeof data.profile === "object" ? data.profile as Record<string, unknown> : {};
      const importedVariables = sanitizeVariables(data.variables);
      if (!importedVariables.domain && typeof rawProfile.domain === "string") importedVariables.domain = rawProfile.domain.slice(0, 2_000);
      if (!importedVariables.username && typeof rawProfile.username === "string") importedVariables.username = rawProfile.username.slice(0, 2_000);
      const importedStatuses = Object.fromEntries(
        Object.entries(rawStatuses).filter(([id, status]) => knownCheckIds.has(id) && ["todo", "found", "clear"].includes(String(status))),
      ) as Record<string, Status>;
      const importedNotes = Object.fromEntries(
        Object.entries(rawNotes)
          .filter(([id, note]) => knownCheckIds.has(id) && typeof note === "string")
          .map(([id, note]) => [id, (note as string).slice(0, 100_000)]),
      );
      const importedSensitiveValues = Object.entries(importedVariables).filter(([name, value]) => isSensitiveVariable(name) && value);

      if (importedSensitiveValues.length > 0 && !window.confirm(
        `This backup contains ${importedSensitiveValues.length} password-like variable value${importedSensitiveValues.length === 1 ? "" : "s"}. These values will be stored unencrypted in this browser. Continue?`,
      )) return;

      const accepted = window.confirm(
        `Import ${Object.keys(importedStatuses).length} check statuses, ${Object.keys(importedNotes).length} notes, and ${Object.values(importedVariables).filter(Boolean).length} variable values? This replaces the current engagement data.`,
      );
      if (!accepted) return;
      setStatuses(importedStatuses);
      setNotes(importedNotes);
      setVariables(importedVariables);
      window.alert("Engagement imported successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The file could not be read.";
      window.alert(`Import failed: ${message}`);
    }
  }

  function hydrateCommand(command: string) {
    let value = command;
    Object.entries(variables).forEach(([name, variableValue]) => {
      if (variableValue) value = value.replaceAll(`<${name}>`, variableValue);
    });
    if (variables.domain) {
      value = value
        .replaceAll("<domain>", variables.domain)
        .replaceAll("<target_domain>", variables.domain)
        .replaceAll("FQDN_DOMAIN", variables.domain);
    }
    if (variables.username) {
      value = value
        .replaceAll("<user>", variables.username)
        .replaceAll("<username>", variables.username)
        .replaceAll("<login>", variables.username);
    }
    return value;
  }

  function updateVariable(name: string, value: string) {
    if (value && !variables[name] && isSensitiveVariable(name)) {
      const accepted = window.confirm(
        `The value for <${name}> will be stored unencrypted in this browser and included unencrypted in engagement exports. Continue?`,
      );
      if (!accepted) return;
    }
    setVariables((current) => ({ ...current, [name]: value }));
  }

  function withoutMetasploitPrompt(command: string) {
    return command.startsWith("msf>") ? command.slice(4).trimStart() : command;
  }

  function renderCommand(command: string) {
    const isMetasploit = command.startsWith("msf>");
    return (
      <code className={isMetasploit ? "metasploit-command" : undefined}>
        {isMetasploit && <MetasploitLogo />}
        <span>{hydrateCommand(withoutMetasploitPrompt(command))}</span>
      </code>
    );
  }

  async function copyCommand(id: string, command: string) {
    await navigator.clipboard.writeText(hydrateCommand(withoutMetasploitPrompt(command)));
    setCopied(id);
    window.setTimeout(() => setCopied(""), 1400);
  }

  return (
    <main className="app-shell">
      <section className="workspace" ref={workspaceRef}>
        <aside className="sidebar" ref={sidebarRef}>
          <div className="sidebar-heading">
            <p>Attack path</p>
            <span>{unlocked.size} phases open</span>
          </div>
          <nav aria-label="Engagement phases">
            {phases.map((item, index) => {
              const isOpen = unlocked.has(item.id);
              const count = item.checks.filter((check) => statuses[check.id] && statuses[check.id] !== "todo").length;
              return (
                <button
                  key={item.id}
                  ref={(element) => { phaseButtonRefs.current[item.id] = element; }}
                  className={`nav-item ${activeId === item.id ? "active" : ""} ${isOpen ? "" : "locked"}`}
                  onClick={() => setActiveId(item.id)}
                >
                  <span className="nav-number" style={{ "--phase-color": item.color } as React.CSSProperties}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="nav-copy"><strong>{item.title}</strong><small>{isOpen ? `${count}/${item.checks.length} reviewed` : "Not suggested yet"}</small></span>
                  {isOpen && count > 0 ? <span className="mini-ring">{count}</span> : <span className="chevron">›</span>}
                </button>
              );
            })}
          </nav>
          <div className="source-card">
            <strong>Based on OCD Mindmaps</strong>
            <p>Active Directory v2025.03</p>
            <a href="https://github.com/Orange-Cyberdefense/ocd-mindmaps" target="_blank" rel="noreferrer">View original ↗</a>
          </div>
        </aside>

        <section className="content" ref={contentRef}>
          <div className="operator-bar">
            <div className="operator-actions">
              <label className="search compact-search">
                <span>⌕</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search checks, tools, protocols…" aria-label="Search checks" />
              </label>
              <button
                className={`icon-button compact-reset path-toggle ${showAttackPaths ? "active" : ""}`}
                type="button"
                onClick={() => setShowAttackPaths((current) => !current)}
                aria-pressed={showAttackPaths}
                title={`${showAttackPaths ? "Hide" : "Show"} attack path connectors`}
              >
                ⌁ <span>PATHS</span>
              </button>
              <button className="icon-button compact-reset" onClick={exportEngagement} title="Export engagement">↓ <span>EXPORT</span></button>
              <button className="icon-button compact-reset" onClick={requestImport} title="Import engagement">↑ <span>IMPORT</span></button>
              <input
                ref={importInputRef}
                className="import-file-input"
                type="file"
                accept="application/json,.json"
                onChange={importEngagement}
                tabIndex={-1}
                aria-hidden="true"
              />
              <button className="icon-button compact-reset" onClick={resetEngagement} title="Reset engagement">↻ <span>RESET</span></button>
            </div>
            <button
              className="information-button"
              type="button"
              onClick={() => setShowInformation(true)}
              aria-label="About AD Pathfinder"
              title="About AD Pathfinder"
            >
              i
            </button>
          </div>
          <div className="content-head">
            <div>
              <h1 className="phase-title"><span style={{ color: phase.color }}>{phaseNumber}</span>{phase.title}</h1>
              <p className="description">
                <a href={`${ocdAdSourceUrl}/${phase.sourceKey}.md`} target="_blank" rel="noreferrer">
                  {phase.sourceKey}.md ↗
                </a>
              </p>
            </div>
            <div className="progress-card">
              <div className="progress-copy"><strong>{progress}%</strong><span>engagement reviewed</span></div>
              <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
            </div>
          </div>

          <div className={`engagement-profile ${showVariables ? "expanded" : ""}`}>
            <button
              className="variable-toggle"
              type="button"
              onClick={() => setShowVariables((current) => !current)}
              aria-expanded={showVariables}
              aria-controls="command-variable-menu"
            >
              <span className="profile-icon">⌘</span>
              <span className="variable-toggle-copy"><strong>Command variables</strong><small>Optional · stored on this device only</small></span>
              <span className="variable-count">{configuredVariableCount} configured</span>
              <span className="variable-chevron" aria-hidden="true">⌄</span>
            </button>
            {showVariables && (
              <div className="variable-menu" id="command-variable-menu">
                <label className="variable-search">
                  <span>Find a variable</span>
                  <input
                    value={variableQuery}
                    onChange={(event) => setVariableQuery(event.target.value)}
                    placeholder="Search domain, dc_ip, computer…"
                    autoComplete="off"
                  />
                </label>
                <div className="variable-grid">
                  {visibleVariableNames.map((name) => {
                    const sensitive = isSensitiveVariable(name);
                    return (
                      <label className={sensitive ? "sensitive-variable" : ""} key={name}>
                        <span>&lt;{name}&gt;{sensitive && <em title="Stored unencrypted">⚠</em>}</span>
                        <input
                          type={sensitive ? "password" : "text"}
                          value={variables[name] ?? ""}
                          onChange={(event) => updateVariable(name, event.target.value)}
                          placeholder="Not set"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </label>
                    );
                  })}
                </div>
                {visibleVariableNames.length === 0 && <p className="variable-empty">No command variables match this search.</p>}
              </div>
            )}
          </div>

          {foundChecks.some((check) => check.next?.length) && (
            <div className="next-steps">
              <div><span className="pulse-dot" /><strong>Suggested next phases</strong><small>Unlocked by confirmed findings</small></div>
              <div className="next-chips">
                {[...unlocked].filter((id) => ![initialPhaseId, activeId].includes(id)).slice(0, 5).map((id) => (
                  <button key={id} onClick={() => setActiveId(id)} style={{ "--chip-color": phaseById[id].color } as React.CSSProperties}>
                    {phaseById[id].title}<span>→</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="list-toolbar">
            <div><strong>Assessment checks</strong><span>{visibleChecks.length} in this phase</span></div>
            <label className="toggle-label">
              <input type="checkbox" checked={showClear} onChange={(event) => setShowClear(event.target.checked)} />
              <span className="toggle" /> Show cleared
            </label>
          </div>

          <div className="check-list">
            {visibleChecks.map((check, index) => {
              const status = statuses[check.id] || "todo";
              return (
                <article
                  className={`check-card status-${status}`}
                  key={check.id}
                  ref={(element) => { checkCardRefs.current[check.id] = element; }}
                >
                  <div className="check-index">{String(index + 1).padStart(2, "0")}</div>
                  <div className="check-body">
                    <div className="check-title-row">
                      <div>
                        <h2>{check.title}</h2>
                        <p>{check.detail}</p>
                      </div>
                      <div className="status-actions" aria-label={`Status for ${check.title}`}>
                        <button className={status === "clear" ? "selected clear" : ""} onClick={() => setStatus(check.id, "clear")}>✓ Clear</button>
                        <button className={status === "found" ? "selected found" : ""} onClick={() => setStatus(check.id, "found")}>● Found</button>
                      </div>
                    </div>
                    {check.caution && <div className="caution">⚠ {check.caution}</div>}
                    {check.next && status === "found" && (
                      <div className="check-meta">
                        <div className="reveals">Reveals {check.next.map((id) => <button key={id} onClick={() => setActiveId(id)}>{phaseById[id].title} ↗</button>)}</div>
                      </div>
                    )}
                    {check.id === "mitm-ntlm-relay" && (
                      <figure className="reference-chart">
                        <div className="reference-chart-head">
                          <div><span>REFERENCE FLOW</span><strong>NTLM relay decision chart</strong></div>
                          <a href="https://beta.hackndo.com/assets/uploads/2020/03/ntlm_resume.png" target="_blank" rel="noreferrer">Original ↗</a>
                        </div>
                        <div className="reference-chart-canvas">
                          <Image
                            src={`${basePath}/ntlm-relay-flow.png`}
                            alt="Decision chart showing NTLM relay paths between SMB, HTTP, LDAP, LDAPS and other services"
                            width="950"
                            height="936"
                            loading="lazy"
                          />
                        </div>
                        <figcaption>Reference chart by Hackndo. Open the original for full resolution.</figcaption>
                      </figure>
                    )}
                    {check.commands && check.commands.length > 0 && (
                      <div className="command-panel">
                        <div className="command-head">
                          <div><strong>Commands from OCD Mindmaps</strong><span>{check.commands.length}</span></div>
                        </div>
                        <div className="commands">
                          {check.commands.map((commandEntry, commandIndex) => {
                            const commandId = `${check.id}-${commandIndex}`;
                            const command = commandText(commandEntry);
                            const info = populatedCommandInfo(commandEntry);
                            return (
                              <div className="command-row" key={commandId}>
                                {renderCommand(command)}
                                <div className="command-row-actions">
                                  {info && <button className="command-info-button" onClick={() => setActiveCommandInfo(info)} aria-label="Show command information">i</button>}
                                  <button onClick={() => copyCommand(commandId, command)} aria-label="Copy command">
                                    {copied === commandId ? "Copied" : "Copy"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {check.userCommands && check.userCommands.length > 0 && (
                      <div className="command-panel user-command-panel">
                        <div className="command-head">
                          <div><strong>User-submitted commands</strong><span>{check.userCommands.length}</span></div>
                        </div>
                        <div className="commands">
                          {check.userCommands.map((commandEntry, commandIndex) => {
                            const commandId = `${check.id}-user-${commandIndex}`;
                            const command = commandText(commandEntry);
                            const info = populatedCommandInfo(commandEntry);
                            return (
                              <div className="command-row" key={commandId}>
                                {renderCommand(command)}
                                <div className="command-row-actions">
                                  {info && <button className="command-info-button" onClick={() => setActiveCommandInfo(info)} aria-label="Show command information">i</button>}
                                  <button onClick={() => copyCommand(commandId, command)} aria-label="Copy user-submitted command">
                                    {copied === commandId ? "Copied" : "Copy"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {(status !== "todo" || notes[check.id]) && (
                      <textarea
                        value={notes[check.id] || ""}
                        onChange={(event) => setNotes((current) => ({ ...current, [check.id]: event.target.value }))}
                        placeholder="Add evidence, target, result or cleanup note…"
                        aria-label={`Notes for ${check.title}`}
                      />
                    )}
                  </div>
                </article>
              );
            })}
            {visibleChecks.length === 0 && <div className="empty">No checks match this view.</div>}
          </div>
        </section>
        {attackConnectors.length > 0 && (
          <svg className="attack-connector-layer" aria-hidden="true">
            {attackConnectors.map((connector) => (
              <g key={connector.id}>
                <path className="attack-connector-path" d={connector.path} stroke={connector.color} />
                <circle className="attack-connector-origin" cx={connector.originX} cy={connector.originY} r="3" fill={connector.color} />
              </g>
            ))}
          </svg>
        )}
      </section>
      {showInformation && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowInformation(false)}>
          <section className="information-modal" role="dialog" aria-modal="true" aria-labelledby="information-title">
            <div className="information-modal-head">
              <div>
                <span>About this project</span>
                <h2 id="information-title">AD Pathfinder</h2>
              </div>
              <button type="button" onClick={() => setShowInformation(false)} aria-label="Close information">×</button>
            </div>

            <div className="information-modal-body">
              <section>
                <h3>Authorized testing only</h3>
                <p>
                  AD Pathfinder is intended for security testing performed with explicit permission. You are responsible for ensuring that its use is lawful and remains within the agreed scope.
                </p>
              </section>

              <section>
                <h3>With gratitude</h3>
                <p>
                  This interface builds on the research and project published by Orange Cyberdefense through OCD Mindmaps. Thank you to the original authors and contributors.
                </p>
              </section>

              <dl className="credit-list">
                <div>
                  <dt>Original research</dt>
                  <dd><a href="https://github.com/Orange-Cyberdefense/ocd-mindmaps" target="_blank" rel="noreferrer">Orange Cyberdefense OCD Mindmaps ↗</a></dd>
                </div>
                <div>
                  <dt>Project source</dt>
                  <dd><a href="https://github.com/Klepvink/ad_pathfinder" target="_blank" rel="noreferrer">Klepvink/ad_pathfinder ↗</a></dd>
                </div>
                <div>
                  <dt>Metasploit icon</dt>
                  <dd><a href="https://simpleicons.org/?q=metasploit" target="_blank" rel="noreferrer">Simple Icons ↗</a><span>License: CC0</span></dd>
                </div>
              </dl>
            </div>
          </section>
        </div>
      )}
      {activeCommandInfo && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setActiveCommandInfo(null)}>
          <section className="information-modal command-information-modal" role="dialog" aria-modal="true" aria-labelledby="command-information-title">
            <div className="information-modal-head">
              <div>
                <span>Command reference</span>
                <h2 id="command-information-title">Additional information</h2>
              </div>
              <button type="button" onClick={() => setActiveCommandInfo(null)} aria-label="Close command information">×</button>
            </div>
            <div className="information-modal-body">
              <p className="command-information-text">{activeCommandInfo.text}</p>
              <section>
                <h3>References</h3>
                <ul className="command-reference-list">
                  {activeCommandInfo.references.map((reference, index) => (
                    <li key={`${reference}-${index}`}>
                      <a href={reference} target="_blank" rel="noreferrer">{reference} ↗</a>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
