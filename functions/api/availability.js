const WINDOWS = [
  { label: "8 AM - 10 AM", start: "08:00", end: "10:00" },
  { label: "8:30 AM - 10:30 AM", start: "08:30", end: "10:30" },
  { label: "9 AM - 11 AM", start: "09:00", end: "11:00" },
  { label: "9:30 AM - 11:30 AM", start: "09:30", end: "11:30" },
  { label: "10 AM - 12 PM", start: "10:00", end: "12:00" },
  { label: "10:30 AM - 12:30 PM", start: "10:30", end: "12:30" },
  { label: "11 AM - 1 PM", start: "11:00", end: "13:00" },
  { label: "11:30 AM - 1:30 PM", start: "11:30", end: "13:30" },
  { label: "12 PM - 2 PM", start: "12:00", end: "14:00" },
  { label: "12:30 PM - 2:30 PM", start: "12:30", end: "14:30" },
  { label: "1 PM - 3 PM", start: "13:00", end: "15:00" },
  { label: "1:30 PM - 3:30 PM", start: "13:30", end: "15:30" },
  { label: "2 PM - 4 PM", start: "14:00", end: "16:00" },
  { label: "2:30 PM - 4:30 PM", start: "14:30", end: "16:30" },
  { label: "3 PM - 5 PM", start: "15:00", end: "17:00" },
  { label: "3:30 PM - 5:30 PM", start: "15:30", end: "17:30" },
  { label: "4 PM - 6 PM", start: "16:00", end: "18:00" },
];

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TIME_ZONE = "America/Detroit";
const MIN_LEAD_TIME_MINUTES = 120;
let tokenCache = null;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  },
});

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "");

const base64Url = (value) => {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const pemToArrayBuffer = (pem) => {
  const base64 = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
};

const getAccessToken = async (env) => {
  const now = Math.floor(Date.now() / 1000);

  if (tokenCache && tokenCache.expiresAt > now + 60) {
    return tokenCache.accessToken;
  }

  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
    throw new Error("Google Calendar service account is not configured.");
  }

  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: CALENDAR_SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  }));
  const unsignedJwt = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(env.GOOGLE_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedJwt)
  );
  const assertion = `${unsignedJwt}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + Number(data.expires_in || 3600),
  };

  return tokenCache.accessToken;
};

const googleRequest = async (env, path, options = {}) => {
  if (!env.GOOGLE_CALENDAR_ID) {
    throw new Error("Google Calendar ID is not configured.");
  }

  const accessToken = await getAccessToken(env);
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
};

const zonedTimeToUtc = (date, time, timeZone) => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(utcGuess);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asZoneTime = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  const offset = asZoneTime - utcGuess.getTime();

  return new Date(utcGuess.getTime() - offset);
};

const slotRange = (date, slot, timeZone) => ({
  start: zonedTimeToUtc(date, slot.start, timeZone),
  end: zonedTimeToUtc(date, slot.end, timeZone),
});

const hasMinimumLeadTime = (slotStart, now = Date.now()) => (
  slotStart.getTime() >= now + MIN_LEAD_TIME_MINUTES * 60 * 1000
);

export const rangesOverlap = (slot, busy) => {
  const busyStart = new Date(busy.start);
  const busyEnd = new Date(busy.end);

  return slot.start.getTime() < busyEnd.getTime() && slot.end.getTime() > busyStart.getTime();
};

const eventDate = (eventTime) => eventTime?.dateTime || (eventTime?.date ? `${eventTime.date}T00:00:00` : "");

const activeEventBusyRanges = async (env, firstSlot, lastSlot, timeZone) => {
  const calendar = encodeURIComponent(env.GOOGLE_CALENDAR_ID);
  const params = new URLSearchParams({
    timeMin: firstSlot.start.toISOString(),
    timeMax: lastSlot.end.toISOString(),
    timeZone,
    singleEvents: "true",
    showDeleted: "false",
    orderBy: "startTime",
  });
  const data = await googleRequest(env, `/calendars/${calendar}/events?${params.toString()}`);

  return (data.items || [])
    .filter((event) => event.status !== "cancelled")
    .filter((event) => event.transparency !== "transparent")
    .map((event) => ({
      start: eventDate(event.start),
      end: eventDate(event.end),
    }))
    .filter((event) => event.start && event.end);
};

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date");

  if (!isIsoDate(date)) {
    return json({ message: "Please choose a valid pickup date." }, 400);
  }

  try {
    const timeZone = env.GOOGLE_CALENDAR_TIME_ZONE || TIME_ZONE;
    const firstSlot = slotRange(date, WINDOWS[0], timeZone);
    const lastSlot = slotRange(date, WINDOWS[WINDOWS.length - 1], timeZone);
    const busy = await activeEventBusyRanges(env, firstSlot, lastSlot, timeZone);
    const now = Date.now();
    const windows = WINDOWS.map((window) => {
      const range = slotRange(date, window, timeZone);
      const tooSoon = !hasMinimumLeadTime(range.start, now);
      const booked = busy.some((busyWindow) => rangesOverlap(range, busyWindow));

      return {
        window: window.label,
        available: !tooSoon && !booked,
        reason: tooSoon ? "too_soon" : (booked ? "booked" : null),
      };
    });

    return json({ date, windows });
  } catch (error) {
    return json({ message: "Booking calendar is not configured yet." }, 503);
  }
}
