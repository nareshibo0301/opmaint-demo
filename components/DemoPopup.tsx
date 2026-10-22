"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { checkWorkEmail, REASON_MESSAGE } from "@/lib/workEmail";

type Values = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  companyName: string;
  source: string;
  description: string;
};
type FieldErrors = Partial<Record<keyof Values, string>>;
type AvailabilitySlot = { startTime: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONSENT_KEY = "opm_consent";

const SOURCES = [
  "Select one",
  "Google Search",
  "LinkedIn",
  "Word of mouth",
  "Advertisement",
  "Other",
];

const PARTNERS = [
  { name: "Stanson", logo: "https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=Stanson%20logo%20clean%20minimal&image_size=landscape_4_3" },
  { name: "Jain", logo: "https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=Jain%20logo%20clean%20minimal&image_size=landscape_4_3" },
  { name: "Medimix", logo: "https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=Medimix%20logo%20clean%20minimal&image_size=landscape_4_3" },
  { name: "Stanson2", logo: "https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=Stanson%20logo%20clean%20minimal&image_size=landscape_4_3" },
  { name: "Jain2", logo: "https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=Jain%20logo%20clean%20minimal&image_size=landscape_4_3" },
  { name: "Medimix2", logo: "https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=Medimix%20logo%20clean%20minimal&image_size=landscape_4_3" },
];

function validPhone(v: string): boolean {
  const d = v.replace(/\D/g, "");
  return d.length >= 7 && d.length <= 15;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const IDLE_STATUS =
  "Your details are saved as you type so you can edit them before submitting. We'll only use them to arrange the demo.";

export default function DemoPopup() {
  const [open, setOpen] = useState(false);
  const [step2, setStep2] = useState(false);
  const [showCalendly, setShowCalendly] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [bookingWarning, setBookingWarning] = useState("");
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [values, setValues] = useState<Values>({
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    companyName: "",
    source: "",
    description: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [status, setStatus] = useState(IDLE_STATUS);
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
  const firstNameRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!showCalendly) return;

    const controller = new AbortController();
    const now = new Date();
    const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const rangeStart = new Date(Math.max(monthStart.getTime(), now.getTime() + 60_000));
    const monthEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    monthEnd.setMilliseconds(-1);
    const rangeEnd = new Date(Math.min(monthEnd.getTime(), now.getTime() + 30 * 24 * 60 * 60 * 1000));

    setAvailability([]);
    setSelectedDate("");
    setSelectedSlot("");
    setAvailabilityError("");
    setAvailabilityLoading(true);

    if (rangeEnd <= rangeStart) {
      setAvailabilityLoading(false);
      return () => controller.abort();
    }

    const query = new URLSearchParams({
      startTime: rangeStart.toISOString(),
      endTime: rangeEnd.toISOString(),
    });
    fetch(`/api/calendly/availability?${query.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Availability could not be loaded.");
        return data as { slots: AvailabilitySlot[] };
      })
      .then((data) => setAvailability(data.slots))
      .catch((error: Error) => {
        if (error.name !== "AbortError") setAvailabilityError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setAvailabilityLoading(false);
      });

    return () => controller.abort();
  }, [calendarMonth, showCalendly]);

  /* ---------------- save helpers ---------------- */
  const send = useCallback(
    (partial: Partial<Values>, opts: { submit?: boolean; beacon?: boolean } = {}) => {
      const sessionId = sessionRef.current;
      if (!sessionId) {
        return opts.submit
          ? Promise.reject(new Error("Your session is still starting. Please try again."))
          : Promise.resolve({ ok: false });
      }

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
    setTimeout(() => (step2 ? firstNameRef.current : emailRef.current)?.focus(), 60);
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
        setShowCalendly(false);
        setSelectedDate("");
        setSelectedSlot("");
        setBookingError("");
        setBookingWarning("");
        setValues({
          email: "",
          firstName: "",
          lastName: "",
          phone: "",
          companyName: "",
          source: "",
          description: "",
        });
        setErrors({});
        setSending(false);
        setStatus(IDLE_STATUS);
      }
      openPopup();
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [openPopup, closePopup, done]);

  /* Focus trap */
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closePopup();
        return;
      }
      if (e.key === "Tab" && rootRef.current) {
        const nodes = Array.from(
          rootRef.current.querySelectorAll<HTMLElement>('button, input, textarea, [href], select'),
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
    const check = checkWorkEmail(values.email);
    if (!check.ok) {
      setErrors((e) => ({ ...e, email: REASON_MESSAGE[check.reason] }));
      emailRef.current?.focus();
      return false;
    }
    setErrors((e) => ({ ...e, email: "" }));
    setStep2(true);
    setTimeout(() => firstNameRef.current?.focus(), 350);
    return true;
  }

  function onField(field: keyof Values, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: "" }));
    if (submitError) setSubmitError("");
    if (field === "email") {
      const check = checkWorkEmail(value);
      if (!step2 && check.ok) {
        goStep2();
      }
    }
    scheduleSave({ [field]: value });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!step2) {
      goStep2();
      return;
    }
    const emailCheck = checkWorkEmail(values.email);
    const next: FieldErrors = {
      email: emailCheck.ok ? "" : REASON_MESSAGE[emailCheck.reason],
      firstName: values.firstName.trim() ? "" : "First name is required.",
      lastName: values.lastName.trim() ? "" : "Last name is required.",
      phone: validPhone(values.phone) ? "" : "Please enter a valid phone number.",
      companyName: values.companyName.trim() ? "" : "Company name is required.",
    };
    setErrors(next);
    if (next.email || next.firstName || next.lastName || next.phone || next.companyName) {
      const firstErr = next.email ? emailRef : next.firstName ? firstNameRef : null;
      firstErr?.current?.focus();
      return;
    }

    setSending(true);
    setSubmitError("");
    if (timerRef.current) clearTimeout(timerRef.current);
    send({}, { submit: true })
      .then(() => {
        setSending(false);
        setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
        setBookingError("");
        setBookingWarning("");
        setShowCalendly(true);
      })
      .catch((err: Error) => {
        setSending(false);
        setSubmitError(err?.message || "Failed to submit. Please check your connection and try again.");
      });
  }

  async function confirmBooking() {
    if (!selectedSlot || !sessionRef.current) return;

    setBooking(true);
    setBookingError("");
    try {
      const response = await fetch("/api/calendly/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: selectedSlot,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your booking could not be completed.");
      setBookingWarning(data.warning || "");
      setShowCalendly(false);
      setDone(true);
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : "Your booking could not be completed.");
    } finally {
      setBooking(false);
    }
  }

  const calendarDays = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const calendarOffset = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay();
  const slotsByDate = new Map<string, AvailabilitySlot[]>();
  availability.forEach((slot) => {
    const key = localDateKey(new Date(slot.startTime));
    slotsByDate.set(key, [...(slotsByDate.get(key) ?? []), slot]);
  });
  const selectedDateSlots = slotsByDate.get(selectedDate) ?? [];
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(calendarMonth);
  const currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const nextMonthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
  const bookingWindowEnd = Date.now() + 30 * 24 * 60 * 60 * 1000;

  const cls = ["odp", open && "is-open", step2 && "is-step2", showCalendly && "is-calendly", done && "is-done"].filter(Boolean).join(" ");

  return (
    <>
      <div className={cls} ref={rootRef} role="dialog" aria-modal="true" aria-labelledby="odp-title" aria-hidden={!open}>
        <div className="odp__overlay" onClick={closePopup} />

        <div className="odp__dialog">
          <div className="odp__main">
            {done ? (
              <div className="odp__done" role="status" aria-live="polite">
                <h2 className="odp__title">Thank you for<br />booking a demo!</h2>
                <p className="odp__sub">
                  {bookingWarning || "A member of our sales team will be in touch with you shortly."}
                </p>
                <button className="odp__btn" style={{ marginBottom: 64, width: 'fit-content', padding: '14px 28px' }} onClick={() => window.location.href = "/"}>
                  Visit Website <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 18l6-6-6-6"/></svg>
                </button>

                <h3 className="odp__next-title">What&apos;s Next?</h3>
                <div className="odp__next-steps">
                  <div className="odp__step-box">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                    <p>You&apos;ll receive a confirmation email shortly with the details of your scheduled demo.</p>
                  </div>
                  <div className="odp__step-box">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                    <p>Our team will get back to with a tailored demo</p>
                  </div>
                </div>
              </div>
            ) : showCalendly ? (
              <div className="odp__booking">
                <h2 className="odp__title">Choose a date and time</h2>
                <p className="odp__sub">All times are shown in {timezone}.</p>
                <div className="odp__booking-layout">
                  <section className="odp__calendar" aria-label="Choose a date">
                    <div className="odp__calendar-header">
                      <button
                        type="button"
                        className="odp__calendar-nav"
                        aria-label="Previous month"
                        disabled={calendarMonth <= currentMonth}
                        onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                      >
                        ‹
                      </button>
                      <strong>{monthLabel}</strong>
                      <button
                        type="button"
                        className="odp__calendar-nav"
                        aria-label="Next month"
                        disabled={nextMonthStart.getTime() > bookingWindowEnd}
                        onClick={() => setCalendarMonth(nextMonthStart)}
                      >
                        ›
                      </button>
                    </div>
                    <div className="odp__calendar-grid odp__calendar-weekdays" aria-hidden="true">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                        <span key={day}>{day}</span>
                      ))}
                    </div>
                    <div className="odp__calendar-grid">
                      {Array.from({ length: calendarOffset }, (_, index) => (
                        <span className="odp__calendar-empty" key={`empty-${index}`} />
                      ))}
                      {Array.from({ length: calendarDays }, (_, index) => {
                        const day = index + 1;
                        const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
                        const key = localDateKey(date);
                        const hasSlots = (slotsByDate.get(key)?.length ?? 0) > 0;
                        const isPast = date < new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
                        return (
                          <button
                            type="button"
                            className={`odp__calendar-day${selectedDate === key ? " is-selected" : ""}`}
                            key={key}
                            disabled={!hasSlots || isPast || availabilityLoading}
                            aria-pressed={selectedDate === key}
                            aria-label={new Intl.DateTimeFormat(undefined, {
                              weekday: "long",
                              month: "long",
                              day: "numeric",
                            }).format(date)}
                            onClick={() => {
                              setSelectedDate(key);
                              setSelectedSlot("");
                              setBookingError("");
                            }}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                    {availabilityLoading && <p className="odp__availability-message">Loading available dates…</p>}
                    {availabilityError && <p className="odp__availability-error" role="alert">{availabilityError}</p>}
                    {!availabilityLoading && !availabilityError && availability.length === 0 && (
                      <p className="odp__availability-message">No available times this month. Try another month.</p>
                    )}
                  </section>

                  <section className="odp__times" aria-label="Choose a time">
                    <h3>{selectedDate ? new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date(`${selectedDate}T12:00:00`)) : "Available times"}</h3>
                    {selectedDateSlots.length ? (
                      <div className="odp__time-list">
                        {selectedDateSlots.map((slot) => (
                          <button
                            type="button"
                            className={`odp__time-slot${selectedSlot === slot.startTime ? " is-selected" : ""}`}
                            key={slot.startTime}
                            aria-pressed={selectedSlot === slot.startTime}
                            onClick={() => {
                              setSelectedSlot(slot.startTime);
                              setBookingError("");
                            }}
                          >
                            {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(slot.startTime))}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="odp__availability-message">
                        {selectedDate ? "No times available for this date." : "Select an available date to see times."}
                      </p>
                    )}
                  </section>
                </div>
                {bookingError && <p className="odp__availability-error" role="alert">{bookingError}</p>}
                <button
                  type="button"
                  className="odp__btn odp__btn--block odp__confirm-booking"
                  disabled={!selectedSlot || booking}
                  onClick={confirmBooking}
                >
                  {booking ? "Booking…" : "Confirm demo time"}
                </button>
              </div>
            ) : (
              <form className="odp__form" onSubmit={onSubmit} noValidate>
                <h2 className="odp__title" id="odp-title">Schedule Demo</h2>
                <p className="odp__sub">Book a 1:1 demo with an expert & experience the full potential of Opmaint.</p>

                <label className={`odp__field${errors.email ? " has-error" : ""}`}>
                  <span>Work email *</span>
                  <input
                    className={`odp__input${errors.email ? " is-invalid" : ""}`}
                    type="email"
                    ref={emailRef}
                    value={values.email}
                    placeholder="name@company.com"
                    autoComplete="email"
                    required
                    onChange={(e) => onField("email", e.target.value)}
                  />
                  {errors.email && <div className="odp__error-msg">{errors.email}</div>}
                </label>

                <div className="odp__more">
                  <div>
                    <div className="odp__row">
                      <label className={`odp__field${errors.firstName ? " has-error" : ""}`}>
                        <span>First name *</span>
                        <input
                          className={`odp__input${errors.firstName ? " is-invalid" : ""}`}
                          type="text"
                          ref={firstNameRef}
                          value={values.firstName}
                          placeholder="Type you first name"
                          autoComplete="given-name"
                          onChange={(e) => onField("firstName", e.target.value)}
                        />
                        {errors.firstName && <div className="odp__error-msg">{errors.firstName}</div>}
                      </label>
                      <label className={`odp__field${errors.lastName ? " has-error" : ""}`}>
                        <span>Last name *</span>
                        <input
                          className={`odp__input${errors.lastName ? " is-invalid" : ""}`}
                          type="text"
                          value={values.lastName}
                          placeholder="Type you last name"
                          autoComplete="family-name"
                          onChange={(e) => onField("lastName", e.target.value)}
                        />
                        {errors.lastName && <div className="odp__error-msg">{errors.lastName}</div>}
                      </label>
                    </div>

                    <label className={`odp__field${errors.phone ? " has-error" : ""}`}>
                      <span>Phone number *</span>
                      <div className="odp__row" style={{ gap: 0 }}>
                        <div style={{ padding: "0 12px", border: "1px solid var(--odp-line)", borderRight: 0, borderRadius: "8px 0 0 8px", display: "flex", alignItems: "center", gap: 8, background: "#fff" }}>
                          <span style={{ width: 20, height: 14, background: "#ff9900", borderRadius: 2 }}></span>
                          <span style={{ fontWeight: 600 }}>+91</span>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6"/></svg>
                        </div>
                        <input
                          className={`odp__input${errors.phone ? " is-invalid" : ""}`}
                          style={{ borderRadius: "0 8px 8px 0" }}
                          type="tel"
                          value={values.phone}
                          placeholder="Your number"
                          autoComplete="tel"
                          inputMode="tel"
                          onChange={(e) => onField("phone", e.target.value)}
                        />
                      </div>
                      {errors.phone && <div className="odp__error-msg">{errors.phone}</div>}
                    </label>

                    <label className={`odp__field${errors.companyName ? " has-error" : ""}`}>
                      <span>Company name *</span>
                      <input
                        className={`odp__input${errors.companyName ? " is-invalid" : ""}`}
                        type="text"
                        value={values.companyName}
                        placeholder="Your company name"
                        onChange={(e) => onField("companyName", e.target.value)}
                      />
                      {errors.companyName && <div className="odp__error-msg">{errors.companyName}</div>}
                    </label>

                    <label className="odp__field">
                      <span>Where did you find us?</span>
                      <select
                        className="odp__input"
                        value={values.source}
                        onChange={(e) => onField("source", e.target.value)}
                      >
                        {SOURCES.map((s) => (
                          <option key={s} value={s === "Select one" ? "" : s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                {submitError && <p className="odp__availability-error" role="alert" style={{ marginTop: 16 }}>{submitError}</p>}

                <button className="odp__btn odp__btn--block" type="submit" disabled={sending} style={{ marginTop: 24 }}>
                  {sending ? "Sending…" : "Book a free demo"} <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 18l6-6-6-6"/></svg>
                </button>

                <div className="odp__privacy">
                  <span>By checking the box, you are agreeing to Opmaint&apos;s <a href="/privacy">Privacy Statement.</a></span>
                </div>

                <p className="odp__fine" style={{ marginTop: 24 }}>Fields marked with (*) are mandatory to fill.</p>
              </form>
            )}
          </div>

          <aside className="odp__side">
            <div>
              <h3>Opmaint remembers,<br />so machines don&apos;t stop.</h3>
              <ul className="odp__points">
                {[
                  "Every breakdown, fix and part used, recorded against the asset.",
                  "Spares and purchase requests inside the work order itself.",
                  "Built for the floor, technicians log and close jobs from their phone.",
                ].map((t) => (
                  <li key={t}>
                    <span className="check">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="odp__partners">
              <p className="odp__partners-title">We partner with the world&apos;s leading organizations to advance their industries:</p>
              <div className="odp__logo-grid">
                {PARTNERS.map((p, idx) => (
                  <div className="odp__logo-box" key={idx}>
                    <img src={p.logo} alt={p.name} />
                  </div>
                ))}
              </div>
            </div>
          </aside>
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
