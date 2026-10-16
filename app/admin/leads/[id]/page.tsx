import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed } from "@/lib/auth";
import AdminLogin from "@/components/AdminLogin";

export const dynamic = "force-dynamic";

function fmt(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function Value({ v }: { v: string | null }) {
  if (v === null || v === "") return <span className="val empty">(empty)</span>;
  return <span className="val">{v}</span>;
}

export default async function LeadDetail({ params }: { params: { id: string } }) {
  if (!isAdminAuthed()) return <AdminLogin />;

  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: {
      events: { orderBy: { createdAt: "asc" } },
      enrichment: true,
      visit: true,
    },
  });
  if (!lead) notFound();

  const e = lead.enrichment;
  const v = lead.visit;

  return (
    <div className="adm-wrap">
      <div className="adm-head">
        <div>
          <Link href="/admin" className="adm-back">
            ← All leads
          </Link>
          <h1 style={{ marginTop: 8 }}>
            {lead.email || "Unknown visitor"}{" "}
            <span className={`badge badge--${lead.status}`}>{lead.status}</span>
          </h1>
          <p className="adm-sub">
            Session {lead.sessionId} · {lead.events.length} logged change(s)
          </p>
        </div>
      </div>

      <div className="adm-grid">
        <div className="adm-panel">
          <h3>Current values</h3>
          <dl className="adm-kv">
            <dt>Email</dt>
            <dd>{lead.email || <span className="muted">—</span>}</dd>
            <dt>Work email?</dt>
            <dd>
              {lead.isWorkEmail === null ? <span className="muted">—</span> : lead.isWorkEmail ? "Yes" : `No (${lead.rejectReason || "personal"})`}
            </dd>
            <dt>Name</dt>
            <dd>{lead.name || <span className="muted">—</span>}</dd>
            <dt>Phone</dt>
            <dd className="mono">{lead.phone || <span className="muted">—</span>}</dd>
            <dt>Notes</dt>
            <dd style={{ whiteSpace: "pre-wrap" }}>{lead.description || <span className="muted">—</span>}</dd>
            <dt>First seen</dt>
            <dd>{fmt(lead.firstSeenAt)}</dd>
            <dt>Last activity</dt>
            <dd>{fmt(lead.lastActivityAt)}</dd>
            <dt>Submitted</dt>
            <dd>{fmt(lead.submittedAt)}</dd>
          </dl>
        </div>

        <div className="adm-panel">
          <h3>Enrichment</h3>
          {!e ? (
            <p className="muted" style={{ fontSize: 13.5 }}>
              No enrichment yet (needs a valid work email and visitor consent).
            </p>
          ) : (
            <dl className="adm-kv">
              <dt>Provider</dt>
              <dd>{e.provider}</dd>
              <dt>Full name</dt>
              <dd>{e.fullName || <span className="muted">—</span>}</dd>
              <dt>Title</dt>
              <dd>{e.title || <span className="muted">—</span>}</dd>
              <dt>LinkedIn</dt>
              <dd>
                {e.linkedinUrl ? (
                  <a href={e.linkedinUrl} target="_blank" rel="noreferrer">
                    {e.linkedinUrl} ↗
                  </a>
                ) : (
                  <span className="muted">—</span>
                )}
              </dd>
              <dt>Company</dt>
              <dd>{e.company || <span className="muted">—</span>}</dd>
              <dt>Company domain</dt>
              <dd>{e.companyDomain || <span className="muted">—</span>}</dd>
              <dt>Company page</dt>
              <dd>
                {e.companyLinkedinUrl ? (
                  <a href={e.companyLinkedinUrl} target="_blank" rel="noreferrer">
                    open ↗
                  </a>
                ) : (
                  <span className="muted">—</span>
                )}
              </dd>
              {e.error && (
                <>
                  <dt>Note</dt>
                  <dd className="muted">{e.error}</dd>
                </>
              )}
            </dl>
          )}
        </div>
      </div>

      <div className="adm-panel" style={{ marginTop: 18 }}>
        <h3>Visit metadata (captured without interaction)</h3>
        {!v ? (
          <p className="muted" style={{ fontSize: 13.5 }}>
            No visit record.
          </p>
        ) : (
          <dl className="adm-kv">
            <dt>IP</dt>
            <dd className="mono">{v.ip || "—"}</dd>
            <dt>Location</dt>
            <dd>{[v.city, v.region, v.country].filter(Boolean).join(", ") || <span className="muted">—</span>}</dd>
            <dt>Device</dt>
            <dd>
              {v.device} · {v.os} · {v.browser}
            </dd>
            <dt>Language</dt>
            <dd>{v.language || "—"}</dd>
            <dt>Referrer</dt>
            <dd style={{ wordBreak: "break-all" }}>{v.referrer || <span className="muted">direct</span>}</dd>
            <dt>Landing URL</dt>
            <dd>{v.landingUrl || "—"}</dd>
            <dt>Cookie consent</dt>
            <dd>{v.consentGiven ? "Allowed" : "Essential only"}</dd>
          </dl>
        )}
      </div>

      <div className="adm-panel" style={{ marginTop: 18 }}>
        <h3>Change timeline</h3>
        {lead.events.length === 0 ? (
          <p className="muted" style={{ fontSize: 13.5 }}>
            No changes logged.
          </p>
        ) : (
          <ul className="tl">
            {lead.events.map((ev) => (
              <li key={ev.id} className={`is-${ev.changeType}`}>
                <div>
                  <b>{ev.field}</b>
                  {ev.changeType === "erase" ? (
                    <>
                      <span className="arrow">·</span>
                      <span className="muted">erased</span>
                      <span className="arrow">→</span>
                      <Value v={ev.oldValue} />
                    </>
                  ) : ev.changeType === "submit" ? (
                    <>
                      <span className="arrow">·</span>
                      <span className="muted">submitted</span>
                    </>
                  ) : (
                    <>
                      <span className="arrow">·</span>
                      <Value v={ev.oldValue} />
                      <span className="arrow">→</span>
                      <Value v={ev.newValue} />
                    </>
                  )}
                </div>
                <div className="tl-meta">
                  {fmt(ev.createdAt)} · {ev.source}
                  {ev.ip ? ` · ${ev.ip}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
