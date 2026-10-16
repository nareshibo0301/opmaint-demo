import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdminAuthed } from "@/lib/auth";
import AdminLogin from "@/components/AdminLogin";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

const STATUSES = ["all", "submitted", "draft", "rejected"] as const;

function fmt(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  if (!isAdminAuthed()) return <AdminLogin />;

  const status = searchParams.status && STATUSES.includes(searchParams.status as any) ? searchParams.status : "all";
  const q = (searchParams.q || "").trim();

  const where: Prisma.LeadWhereInput = {};
  if (status !== "all") where.status = status;
  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
    ];
  }

  const [leads, totalLeads, submitted, draft, rejected, visits, events] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { lastActivityAt: "desc" },
      take: 200,
      include: { enrichment: true, visit: true, _count: { select: { events: true } } },
    }),
    prisma.lead.count(),
    prisma.lead.count({ where: { status: "submitted" } }),
    prisma.lead.count({ where: { status: "draft" } }),
    prisma.lead.count({ where: { status: "rejected" } }),
    prisma.visit.count(),
    prisma.leadEvent.count(),
  ]);

  const qs = (s: string) => {
    const p = new URLSearchParams();
    if (s !== "all") p.set("status", s);
    if (q) p.set("q", q);
    const str = p.toString();
    return str ? `/admin?${str}` : "/admin";
  };

  return (
    <div className="adm-wrap">
      <div className="adm-head">
        <div>
          <h1>Leads</h1>
          <p className="adm-sub">
            Every captured visitor, every keystroke change. Autosaved drafts included.
          </p>
        </div>
        <LogoutButton />
      </div>

      <div className="adm-stats">
        <div className="adm-stat">
          <b>{visits}</b>
          <span>Sessions (incl. anonymous)</span>
        </div>
        <div className="adm-stat">
          <b>{totalLeads}</b>
          <span>Leads with data</span>
        </div>
        <div className="adm-stat">
          <b>{submitted}</b>
          <span>Submitted</span>
        </div>
        <div className="adm-stat">
          <b>{draft}</b>
          <span>Draft</span>
        </div>
        <div className="adm-stat">
          <b>{rejected}</b>
          <span>Rejected email</span>
        </div>
        <div className="adm-stat">
          <b>{events}</b>
          <span>Logged changes</span>
        </div>
      </div>

      <form className="adm-filters" action="/admin" method="get">
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search email, name or phone…"
          style={{ font: "inherit", fontSize: 13, padding: "8px 12px", border: "1px solid var(--adm-line)", borderRadius: 10, minWidth: 240 }}
        />
        <button type="submit" className="adm-btn-ghost">
          Search
        </button>
      </form>

      <div className="adm-filters">
        {STATUSES.map((s) => (
          <Link key={s} href={qs(s)} className={status === s ? "active" : ""}>
            {s}
          </Link>
        ))}
      </div>

      <div className="adm-table-wrap">
        {leads.length === 0 ? (
          <div className="adm-empty">No leads match this filter yet.</div>
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Company / LinkedIn</th>
                <th>Status</th>
                <th>Changes</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <Link href={`/admin/leads/${lead.id}`}>{lead.email || <span className="muted">—</span>}</Link>
                  </td>
                  <td>
                    {lead.firstName || lead.lastName ? (
                      `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim()
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="mono">{lead.phone || <span className="muted">—</span>}</td>
                  <td>
                    {lead.enrichment?.company ? (
                      <>
                        <div>{lead.enrichment.company}</div>
                        {lead.enrichment.linkedinUrl ? (
                          <a href={lead.enrichment.linkedinUrl} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 12 }}>
                            LinkedIn profile ↗
                          </a>
                        ) : lead.enrichment.companyLinkedinUrl ? (
                          <a href={lead.enrichment.companyLinkedinUrl} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 12 }}>
                            Company page ↗
                          </a>
                        ) : null}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge badge--${lead.status}`}>{lead.status}</span>
                    {lead.rejectReason && <div className="muted" style={{ fontSize: 11.5 }}>{lead.rejectReason.replace("_", " ")}</div>}
                  </td>
                  <td className="muted">{lead._count.events}</td>
                  <td className="muted">{fmt(lead.lastActivityAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="adm-sub" style={{ marginTop: 14 }}>
        {leads.length} row(s) shown. Anonymous sessions with no typed data are counted in the stats but have no lead row.
      </p>
    </div>
  );
}
