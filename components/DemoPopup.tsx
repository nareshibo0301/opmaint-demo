"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Values = { email: string; name: string; phone: string; description: string };
type FieldErrors = Partial<Record<keyof Values, boolean>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONSENT_KEY = "opm_consent";

function validPhone(v: string): boolean {
  const d = v.replace(/\D/g, "");
  return d.length >= 7 && d.length <= 15;
}

const IDLE_STATUS =
  "Your details are saved as you type so you can edit them before submitting. We'll only use them to arrange the demo.";

export default function DemoPopup() {
  const [open, setOpen] = useState(false);
  const [step2, setStep2] = useState(false);
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [values, setValues] = useState<Values>({ email: "", name: "", phone: "", description: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState(IDLE_STATUS);
  const [thanksName, setThanksName] = useState("");
  const [consent, setConsent] = useState<boolean>(false);
  const [bannerOpen, setBannerOpen] = useState(false);

  const sessionRef = useRef<string | null>(null);
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const pendingRef = useRef<Partial<Values>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  /* ---------------- session + consent on mount ---------------- */
  useEffect(() => {
    fetch("/api/visit", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        sessionRef.current = d.sessionId ?? null;
      })
      .catch(() => {});

    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored === "yes") setConsent(true);
    else if (stored === "no") setConsent(false);
    else setBannerOpen(true);
  }, []);

  function decideConsent(allow: boolean) {
    setConsent(allow);
    localStorage.setItem(CONSENT_KEY, allow ? "yes" : "no");
    setBannerOpen(false);
  }

  /* ---------------- save helpers ---------------- */
  const send = useCallback(
    (partial: Partial<Values>, opts: { submit?: boolean; beacon?: boolean } = {}) => {
      const sessionId = sessionRef.current;
      if (!sessionId) return Promise.resolve({ ok: false });

      const payload = {
        sessionId,
        fields: { ...valuesRef.current, ...partial },
        consent,
        ...(opts.submit ? { submit: true } : {}),
        ...(opts.beacon ? { source: "beacon" } : {}),
      };
      const body = JSON.stringify(payload);

      // sendBeacon has no response handling — fire and forget.
      if (opts.beacon) {
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/lead", new Blob([body], { type: "application/json" }));
        } else {
          fetch("/api/lead", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
        }
        return Promise.resolve({ ok: true });
      }

      setStatus("Saving your details…");
      const request = queueRef.current
        .catch(() => {})
        .then(() =>
          fetch("/api/lead", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          }).then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Your details could not be saved.");
            return data;
          }),
        );
      queueRef.current = request;
      return request.then(
        (data: any) => {
          setStatus(data.message || IDLE_STATUS);
          return data;
        },
        (err: Error) => {
          setStatus(err.message);
          throw err;
        },
      );
    },
    [consent],
  );

  const scheduleSave = useCallback(
    (partial: Partial<Values>) => {
      pendingRef.current = { ...pendingRef.current, ...partial };
      if (!EMAIL_RE.test((pendingRef.current.email ?? valuesRef.current.email).trim())) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const batch = pendingRef.current;
        pendingRef.current = {};
        send(batch).catch(() => {});
      }, 450);
    },
    [send],
  );

  /* ---------------- flush on leave ---------------- */
  useEffect(() => {
    function flush() {
      if (!sessionRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      const batch = { ...pendingRef.current };
      pendingRef.current = {};
      send(batch, { beacon: true });
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") flush();
    }
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [send]);

  /* ---------------- open / close ---------------- */
  const openPopup = useCallback(() => {
    lastFocusRef.current = document.activeElement as HTMLElement;
    setOpen(true);
    document.documentElement.style.overflow = "hidden";
    setTimeout(() => (step2 ? nameRef.current : emailRef.current)?.focus(), 60);
  }, [step2]);

  const closePopup = useCallback(() => {
    setOpen(false);
    document.documentElement.style.overflow = "";
    lastFocusRef.current?.focus?.();
  }, []);

  useEffect(() => {
    (window as any).openDemoPopup = openPopup;
    (window as any).closeDemoPopup = closePopup;

    function onClick(e: MouseEvent) {
      const t = (e.target as HTMLElement)?.closest?.('[data-demo-popup], a[href*="/book-demo"]');
      if (!t) return;
      e.preventDefault();
      if (done) {
        setDone(false);
        setStep2(false);
        setValues({ email: "", name: "", phone: "", description: "" });
        setErrors({});
        setSending(false);
        setStatus(IDLE_STATUS);
      }
      openPopup();
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [openPopup, closePopup, done]);

  /* Escape + focus trap */
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePopup();
      if (e.key === "Tab" && rootRef.current) {
        const nodes = Array.from(
          rootRef.current.querySelectorAll<HTMLElement>('button, input, textarea, [href]'),
        ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null && el.tabIndex !== -1);
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closePopup]);

  /* ---------------- field handling ---------------- */
  function goStep2(): boolean {
    if (!EMAIL_RE.test(values.email.trim())) {
      setErrors((e) => ({ ...e, email: true }));
      emailRef.current?.focus();
      return false;
    }
    setErrors((e) => ({ ...e, email: false }));
    setStep2(true);
    setTimeout(() => nameRef.current?.focus(), 350);
    return true;
  }

  function onField(field: keyof Values, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: false }));
    if (field === "email") {
      if (!step2 && EMAIL_RE.test(value.trim())) goStep2();
    }
    scheduleSave({ [field]: value });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!step2) {
      goStep2();
      return;
    }
    const next: FieldErrors = {
      email: !EMAIL_RE.test(values.email.trim()),
      name: !values.name.trim(),
      phone: !validPhone(values.phone),
    };
    setErrors(next);
    if (next.email || next.name || next.phone) {
      (next.email ? emailRef : next.name ? nameRef : null)?.current?.focus();
      return;
    }
    setSending(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    send({}, { submit: true })
      .then(() => {
        setThanksName(values.name.trim().split(" ")[0] || "");
        setDone(true);
      })
      .catch(() => {
        setSending(false);
      });
  }

  const cls = ["odp", open && "is-open", step2 && "is-step2", done && "is-done"].filter(Boolean).join(" ");

  return (
    <>
      <div className={cls} ref={rootRef} role="dialog" aria-modal="true" aria-labelledby="odp-title" aria-hidden={!open}>
        <div className="odp__overlay" data-odp-close onClick={closePopup} />

        <div className="odp__dialog">
          <button className="odp__close" type="button" aria-label="Close" onClick={closePopup}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          <aside className="odp__side">
            <div style={{ position: "relative", zIndex: 1 }}>
              <span className="odp__tag">Book a demo</span>
              <h2 id="odp-title">See the CMMS your plant will actually use.</h2>
              <p>
                A quick walkthrough of work orders, preventive maintenance and asset history, built around your plant.
              </p>
            </div>
            <ul className="odp__points">
              {[
                "We migrate your data from MaintainX or UpKeep",
                "Flat pricing: the whole plant, no per-seat rationing",
                "Free training for admins and technicians",
              ].map((t) => (
                <li key={t}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M8 12.5l2.7 2.7L16 9.5" />
                  </svg>
                  {t}
                </li>
              ))}
            </ul>
          </aside>

          <div className="odp__main">
            <form className="odp__form" onSubmit={onSubmit} noValidate>
              <h3 className="odp__title">Schedule your demo</h3>
              <p className="odp__sub">{step2 ? "Great! Just a few more details so we can set this up." : "Start with your work email. It takes under a minute."}</p>

              <label className={`odp__field${errors.email ? " has-error" : ""}`}>
                <span>Work email</span>
                <div className="odp__row">
                  <input
                    className={`odp__input${errors.email ? " is-invalid" : ""}`}
                    type="email"
                    ref={emailRef}
                    value={values.email}
                    placeholder="you@company.com"
                    autoComplete="email"
                    required
                    onChange={(e) => onField("email", e.target.value)}
                  />
                </div>
                <button className="odp__edit" type="button" onClick={() => { setStep2(false); emailRef.current?.focus(); }}>
                  Not you? Edit email
                </button>
                <small className="odp__err">Please use your work email.</small>
              </label>

              <div className="odp__more">
                <div>
                  <label className={`odp__field${errors.name ? " has-error" : ""}`}>
                    <span>Full name</span>
                    <input
                      className={`odp__input${errors.name ? " is-invalid" : ""}`}
                      type="text"
                      ref={nameRef}
                      value={values.name}
                      placeholder="Your name"
                      autoComplete="name"
                      onChange={(e) => onField("name", e.target.value)}
                    />
                    <small className="odp__err">Please enter your name.</small>
                  </label>

                  <label className={`odp__field${errors.phone ? " has-error" : ""}`}>
                    <span>Phone number</span>
                    <input
                      className={`odp__input${errors.phone ? " is-invalid" : ""}`}
                      type="tel"
                      value={values.phone}
                      placeholder="+91 98765 43210"
                      autoComplete="tel"
                      inputMode="tel"
                      onChange={(e) => onField("phone", e.target.value)}
                    />
                    <small className="odp__err">Please enter a valid phone number.</small>
                  </label>

                  <label className="odp__field">
                    <span>
                      What would you like to see? <em>(optional)</em>
                    </span>
                    <textarea
                      className="odp__input"
                      rows={3}
                      value={values.description}
                      placeholder="Tell us about your plant, team size or current system…"
                      onChange={(e) => onField("description", e.target.value)}
                    />
                  </label>
                </div>
              </div>

              <input className="odp__hp" type="text" name="company_website" tabIndex={-1} autoComplete="off" aria-hidden="true" />

              <button className="odp__btn odp__btn--block odp__submit" type="submit" disabled={sending}>
                {sending ? "Sending…" : "Book my demo"}
              </button>
              <p className="odp__fine" role="status" aria-live="polite">
                {status}
              </p>
            </form>

            <div className="odp__done" role="status" aria-live="polite">
              <div className="odp__tick">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </div>
              <h3 className="odp__title">You&apos;re on the list!</h3>
              <p className="odp__sub" style={{ marginBottom: 22 }}>
                Thanks <b>{thanksName}</b>, our team will reach out shortly to confirm a time.
              </p>
              <button className="odp__btn" type="button" onClick={closePopup}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {bannerOpen && (
        <div className="odp-consent" role="dialog" aria-live="polite">
          <span>
            We save what you type in this form so we can follow up, and we may look up your company from your email.{" "}
            <a href="/privacy">Privacy policy</a>
          </span>
          <span style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => decideConsent(false)} style={{ background: "rgba(255,255,255,.14)", color: "#fff" }}>
              Essential only
            </button>
            <button type="button" onClick={() => decideConsent(true)}>
              Allow
            </button>
          </span>
        </div>
      )}
    </>
  );
}
