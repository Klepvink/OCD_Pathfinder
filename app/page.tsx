"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import ocdMindmap from "./ocd-mindmap.json";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Status = "todo" | "found" | "clear";

type Check = {
  id: string;
  title: string;
  detail: string;
  tags: string[];
  commands?: string[];
  tools?: string[];
  source?: string;
  next?: string[];
  caution?: string;
};

type Phase = {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  color: string;
  checks: Check[];
};

const phases = ocdMindmap.phases as Phase[];
const allChecks = phases.flatMap((phase) => phase.checks);
const phaseById = Object.fromEntries(phases.map((phase) => [phase.id, phase]));

export default function Home() {
  const [activeId, setActiveId] = useState("no-creds");
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [profile, setProfile] = useState({ domain: "", username: "" });
  const [copied, setCopied] = useState("");
  const [query, setQuery] = useState("");
  const [showClear, setShowClear] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("ad-pathfinder-v1") || "{}");
      setStatuses(saved.statuses || {});
      setNotes(saved.notes || {});
      setProfile(saved.profile || { domain: "", username: "" });
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem("ad-pathfinder-v1", JSON.stringify({ statuses, notes, profile }));
  }, [statuses, notes, profile, ready]);

  const foundChecks = allChecks.filter((check) => statuses[check.id] === "found");
  const unlocked = useMemo(() => {
    const ids = new Set(["no-creds"]);
    foundChecks.forEach((check) => check.next?.forEach((id) => ids.add(id)));
    return ids;
  }, [foundChecks]);
  const phase = phaseById[activeId];
  const visibleChecks = phase.checks.filter((check) => {
    const haystack = `${check.title} ${check.detail} ${check.tags.join(" ")}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (showClear || statuses[check.id] !== "clear");
  });
  const completed = allChecks.filter((check) => statuses[check.id] && statuses[check.id] !== "todo").length;
  const progress = Math.round((completed / allChecks.length) * 100);

  function setStatus(id: string, status: Status) {
    setStatuses((current) => ({ ...current, [id]: current[id] === status ? "todo" : status }));
  }

  function resetEngagement() {
    if (!window.confirm("Reset every check and note for this engagement?")) return;
    setStatuses({});
    setNotes({});
    setProfile({ domain: "", username: "" });
  }

  function hydrateCommand(command: string) {
    let value = command;
    if (profile.domain) {
      value = value
        .replaceAll("<domain>", profile.domain)
        .replaceAll("<target_domain>", profile.domain)
        .replaceAll("FQDN_DOMAIN", profile.domain);
    }
    if (profile.username) {
      value = value
        .replaceAll("<user>", profile.username)
        .replaceAll("<username>", profile.username)
        .replaceAll("<login>", profile.username);
    }
    return value;
  }

  async function copyCommand(id: string, command: string) {
    await navigator.clipboard.writeText(hydrateCommand(command));
    setCopied(id);
    window.setTimeout(() => setCopied(""), 1400);
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="sidebar">
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
            <span>OPEN SOURCE</span>
            <strong>Based on OCD Mindmaps</strong>
            <p>Active Directory v2025.03</p>
            <a href="https://github.com/Orange-Cyberdefense/ocd-mindmaps" target="_blank" rel="noreferrer">View original ↗</a>
          </div>
        </aside>

        <section className="content">
          <div className="operator-bar">
            <div className="operator-actions">
              <label className="search compact-search">
                <span>⌕</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search checks, tools, protocols…" aria-label="Search checks" />
              </label>
              <button className="icon-button compact-reset" onClick={resetEngagement} title="Reset engagement">↻ <span>RESET</span></button>
            </div>
          </div>
          <div className="content-head">
            <div>
              <p className="eyebrow" style={{ color: phase.color }}>{phase.eyebrow}</p>
              <h1>{phase.title}</h1>
              <p className="description">{phase.description}</p>
            </div>
            <div className="progress-card">
              <div className="progress-copy"><strong>{progress}%</strong><span>engagement reviewed</span></div>
              <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
            </div>
          </div>

          <div className="engagement-profile">
            <div>
              <span className="profile-icon">⌘</span>
              <div><strong>Command variables</strong><small>Optional · stored on this device only</small></div>
            </div>
            <label>
              <span>DOMAIN</span>
              <input
                value={profile.domain}
                onChange={(event) => setProfile((current) => ({ ...current, domain: event.target.value }))}
                placeholder="corp.local"
                autoComplete="off"
              />
            </label>
            <label>
              <span>USERNAME</span>
              <input
                value={profile.username}
                onChange={(event) => setProfile((current) => ({ ...current, username: event.target.value }))}
                placeholder="jsmith"
                autoComplete="off"
              />
            </label>
          </div>

          {foundChecks.some((check) => check.next?.length) && (
            <div className="next-steps">
              <div><span className="pulse-dot" /><strong>Suggested next phases</strong><small>Unlocked by confirmed findings</small></div>
              <div className="next-chips">
                {[...unlocked].filter((id) => !["no-creds", activeId].includes(id)).slice(0, 5).map((id) => (
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
                <article className={`check-card status-${status}`} key={check.id}>
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
                    <div className="check-meta">
                      <div className="tags">{check.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                      {check.next && status === "found" && (
                        <div className="reveals">Reveals {check.next.map((id) => <button key={id} onClick={() => setActiveId(id)}>{phaseById[id].title} ↗</button>)}</div>
                      )}
                    </div>
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
                          {check.tools && check.tools.length > 0 && (
                            <div className="tool-list">{check.tools.map((tool) => <span key={tool}>{tool}</span>)}</div>
                          )}
                        </div>
                        <div className="commands">
                          {check.commands.map((command, commandIndex) => {
                            const commandId = `${check.id}-${commandIndex}`;
                            return (
                              <div className="command-row" key={commandId}>
                                <code>{hydrateCommand(command)}</code>
                                <button onClick={() => copyCommand(commandId, command)} aria-label="Copy command">
                                  {copied === commandId ? "Copied" : "Copy"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {check.source && <div className="source-line">Source: <code>{check.source}</code> · Orange Cyberdefense v{ocdMindmap.version}</div>}
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

      </section>
    </main>
  );
}
