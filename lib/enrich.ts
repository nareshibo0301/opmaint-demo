// ------------------------------------------------------------------
// Enrichment: email -> LinkedIn / company.
//
// The provider is SWAPPABLE so we never lock the rest of the app to one
// vendor. Pick via ENRICH_PROVIDER env var:
//   "domain"    free  – company inferred from the email domain (default)
//   "proxycurl" paid  – real person lookup, needs PROXYCURL_API_KEY
//   "scrape"    experimental – direct LinkedIn scrape (see notes below)
// ------------------------------------------------------------------

export interface EnrichmentResult {
  provider: string;
  fullName: string | null;
  title: string | null;
  linkedinUrl: string | null;
  company: string | null;
  companyDomain: string | null;
  companyLinkedinUrl: string | null;
  raw: unknown;
  error?: string;
}

function titleCaseDomain(domain: string): string {
  const base = domain.split(".")[0] ?? domain;
  return base
    .split(/[-_]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/** Free provider: infer the company from the email domain only. */
function enrichByDomain(email: string, domain: string): EnrichmentResult {
  const slug = domain.split(".")[0] ?? domain;
  return {
    provider: "domain",
    fullName: null,
    title: null,
    linkedinUrl: null,
    company: titleCaseDomain(domain),
    companyDomain: domain,
    companyLinkedinUrl: `https://www.linkedin.com/company/${slug}`,
    raw: { email, domain, method: "domain-inference" },
  };
}

/** Paid provider: Proxycurl "role lookup" resolves a work email to a profile. */
async function enrichByProxycurl(email: string, domain: string): Promise<EnrichmentResult> {
  const key = process.env.PROXYCURL_API_KEY;
  const base: EnrichmentResult = {
    provider: "proxycurl",
    fullName: null,
    title: null,
    linkedinUrl: null,
    company: titleCaseDomain(domain),
    companyDomain: domain,
    companyLinkedinUrl: `https://www.linkedin.com/company/${domain.split(".")[0]}`,
    raw: null,
  };
  if (!key) return { ...base, error: "PROXYCURL_API_KEY is not set." };

  try {
    const url = `https://nubela.co/proxycurl/api/v2/linkedin/role/resolve?work_email=${encodeURIComponent(email)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const data: any = await res.json();
    if (!res.ok) return { ...base, raw: data, error: data?.message || `Proxycurl HTTP ${res.status}` };
    return {
      ...base,
      linkedinUrl: data?.linkedin_profile_url ?? null,
      raw: data,
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "Proxycurl request failed" };
  }
}

/**
 * Experimental direct-LinkedIn scrape.
 *
 * WARNING: this will very likely be blocked in production. LinkedIn serves a
 * login "authwall" to datacenter IPs, and Vercel functions run on exactly those.
 * Without a logged-in session cookie there is no profile HTML to parse. Kept
 * here as a single, isolated function so you can experiment locally (where your
 * IP may be allowed) without touching the DB / dashboard code.
 */
async function enrichByScrape(email: string, domain: string): Promise<EnrichmentResult> {
  const base: EnrichmentResult = {
    provider: "scrape",
    fullName: null,
    title: null,
    linkedinUrl: null,
    company: titleCaseDomain(domain),
    companyDomain: domain,
    companyLinkedinUrl: `https://www.linkedin.com/company/${domain.split(".")[0]}`,
    raw: null,
  };
  try {
    const res = await fetch(
      `https://www.linkedin.com/pub/dir?firstName=&lastName=&trk=people-guest_people-search-bar_search-submit&q=${encodeURIComponent(email)}`,
      {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
          accept: "text/html",
          "accept-language": "en-US,en;q=0.9",
        },
        redirect: "manual",
      },
    );
    const body = await res.text();
    const authwall = res.status === 999 || res.status === 302 || /authwall|sign in/i.test(body.slice(0, 2000));
    if (authwall) {
      return { ...base, error: "LinkedIn returned an auth wall (blocked). Use a provider instead.", raw: { status: res.status } };
    }
    // Guest pages that DO load expose a public profile link in this shape:
    const m = body.match(/https:\/\/[a-z]{2,3}\.linkedin\.com\/in\/[A-Za-z0-9\-_%]+/);
    return { ...base, linkedinUrl: m ? m[0] : null, raw: { status: res.status } };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "Scrape failed" };
  }
}

/** Run enrichment using the configured provider. Never throws. */
export async function enrichFromEmail(email: string, domain: string): Promise<EnrichmentResult> {
  const provider = (process.env.ENRICH_PROVIDER || "domain").toLowerCase();
  try {
    if (provider === "proxycurl") return await enrichByProxycurl(email, domain);
    if (provider === "scrape") return await enrichByScrape(email, domain);
    return enrichByDomain(email, domain);
  } catch (e) {
    return {
      provider,
      fullName: null,
      title: null,
      linkedinUrl: null,
      company: null,
      companyDomain: domain,
      companyLinkedinUrl: null,
      raw: null,
      error: e instanceof Error ? e.message : "Enrichment failed",
    };
  }
}
