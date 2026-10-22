const CALENDLY_API_URL = "https://api.calendly.com";

export class CalendlyConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendlyConfigurationError";
  }
}

export class CalendlyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CalendlyApiError";
  }
}

export function getCalendlyConfig() {
  const token = process.env.CALENDLY_API_KEY?.trim();
  const eventTypeUri = process.env.CALENDLY_EVENT_TYPE_URI?.trim();
  const phoneQuestion = process.env.CALENDLY_PHONE_QUESTION?.trim();
  const companyQuestion = process.env.CALENDLY_COMPANY_QUESTION?.trim();
  const sourceQuestion = process.env.CALENDLY_SOURCE_QUESTION?.trim();

  if (!token) {
    throw new CalendlyConfigurationError("CALENDLY_API_KEY is not configured.");
  }
  if (!eventTypeUri) {
    throw new CalendlyConfigurationError("CALENDLY_EVENT_TYPE_URI is not configured.");
  }
  if (!phoneQuestion || !companyQuestion || !sourceQuestion) {
    throw new CalendlyConfigurationError("Calendly custom question labels are not fully configured.");
  }
  if (!eventTypeUri.startsWith(`${CALENDLY_API_URL}/event_types/`)) {
    throw new CalendlyConfigurationError("CALENDLY_EVENT_TYPE_URI must be a Calendly event type API URI.");
  }

  return { token, eventTypeUri, phoneQuestion, companyQuestion, sourceQuestion };
}

export async function calendlyRequest<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${CALENDLY_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new CalendlyApiError("Calendly API request failed.", response.status);
  }

  return response.json() as Promise<T>;
}

export function calendlyErrorResponse(error: unknown): { status: number; message: string } {
  if (error instanceof CalendlyConfigurationError) {
    return { status: 500, message: error.message };
  }
  if (error instanceof CalendlyApiError) {
    if (error.status === 401 || error.status === 403) {
      return {
        status: 502,
        message: "Calendly rejected the request. Check the API token, required permissions, and plan.",
      };
    }
    if (error.status === 409) {
      return { status: 409, message: "That time is no longer available. Please choose another slot." };
    }
    if (error.status === 400) {
      return {
        status: 502,
        message: "Calendly rejected the booking. Check that the configured custom-question labels match the event.",
      };
    }
    return { status: 502, message: "Calendly could not complete the request. Please try again." };
  }
  return { status: 502, message: "Could not connect to Calendly. Please try again." };
}
