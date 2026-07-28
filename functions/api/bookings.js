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
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const DEFAULT_NOTIFY_TO = "info@puremittenjunkremoval.com,contact@puremittenjunkremoval.com";
const DEFAULT_BOOKING_FROM = "Pure Mitten Junk Removal <contact@puremittenjunkremoval.com>";
let tokenCache = null;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  },
});

const clean = (value) => String(value || "").trim();
const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "");
const field = (formData, name) => clean(formData.get(name));
const notificationRecipients = (env) => (env.BOOKING_NOTIFY_TO || DEFAULT_NOTIFY_TO)
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const missingCalendarConfig = (env) => [
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "GOOGLE_CALENDAR_ID",
].filter((name) => !env[name]);

const escapeHtml = (value) => clean(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const plainText = (value) => clean(value).replace(/\r?\n/g, "\n");

const base64Url = (value) => {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const bytesToBase64 = (bytes) => {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
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

  return fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
};

const zonedDateTime = (date, time) => `${date}T${time}:00`;

const slotRange = (date, slot) => ({
  start: zonedDateTime(date, slot.start),
  end: zonedDateTime(date, slot.end),
});

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

const slotUtcRange = (date, slot, timeZone) => ({
  start: zonedTimeToUtc(date, slot.start, timeZone),
  end: zonedTimeToUtc(date, slot.end, timeZone),
});

const hasMinimumLeadTime = (slotStart, now = Date.now()) => (
  slotStart.getTime() >= now + MIN_LEAD_TIME_MINUTES * 60 * 1000
);

const bookingEventId = () => {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");

  return `pmjr${Date.now().toString(16)}${suffix}`;
};

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
  const response = await googleRequest(env, `/calendars/${calendar}/events?${params.toString()}`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();

  return (data.items || [])
    .filter((event) => event.status !== "cancelled")
    .filter((event) => event.transparency !== "transparent")
    .map((event) => ({
      start: eventDate(event.start),
      end: eventDate(event.end),
    }))
    .filter((event) => event.start && event.end);
};

const isFileUpload = (value) => (
  value &&
  typeof value === "object" &&
  typeof value.name === "string" &&
  typeof value.size === "number" &&
  value.size > 0
);

const isSlotBusy = async (env, date, slot, timeZone) => {
  const range = slotUtcRange(date, slot, timeZone);
  const busy = await activeEventBusyRanges(env, range, range, timeZone);

  return busy.some((busyWindow) => rangesOverlap(range, busyWindow));
};

const buildDescription = (booking) => [
  "New on-site quote appointment",
  "",
  `Name: ${booking.name}`,
  `Phone: ${booking.phone}`,
  `Email: ${booking.email}`,
  `Pickup address: ${booking.pickup_address}`,
  `City / ZIP: ${booking.pickup_city} ${booking.pickup_zip}`,
  `Location type: ${booking.location_type}`,
  `Customer present: ${booking.customer_present}`,
  `Estimated load: ${booking.estimated_load || "Not sure yet"}`,
  `Job notes: ${booking.job_notes || "None selected"}`,
  `Photos attached to email: ${booking.photo_count}`,
  "",
  "Items to remove:",
  plainText(booking.items_to_remove),
].join("\n");

const buildEmailHtml = (booking) => `
  <h1>New on-site quote appointment</h1>
  <p><strong>Preferred window:</strong> ${escapeHtml(booking.preferred_day)} ${escapeHtml(booking.preferred_window)}</p>
  <p><strong>Name:</strong> ${escapeHtml(booking.name)}</p>
  <p><strong>Phone:</strong> ${escapeHtml(booking.phone)}</p>
  <p><strong>Email:</strong> ${escapeHtml(booking.email)}</p>
  <p><strong>Pickup address:</strong> ${escapeHtml(booking.pickup_address)}</p>
  <p><strong>City / ZIP:</strong> ${escapeHtml(booking.pickup_city)} ${escapeHtml(booking.pickup_zip)}</p>
  <p><strong>Location type:</strong> ${escapeHtml(booking.location_type)}</p>
  <p><strong>Customer present:</strong> ${escapeHtml(booking.customer_present)}</p>
  <p><strong>Estimated load:</strong> ${escapeHtml(booking.estimated_load || "Not sure yet")}</p>
  <p><strong>Job notes:</strong> ${escapeHtml(booking.job_notes || "None selected")}</p>
  <p><strong>Items to remove:</strong><br>${escapeHtml(booking.items_to_remove).replace(/\n/g, "<br>")}</p>
  <p><strong>Photos attached:</strong> ${booking.photo_count}</p>
`;

const collectAttachments = async (files) => {
  const attachments = [];
  let totalBytes = 0;

  for (const file of files.slice(0, MAX_ATTACHMENTS)) {
    totalBytes += file.size;
    if (totalBytes > MAX_ATTACHMENT_BYTES) break;

    const bytes = new Uint8Array(await file.arrayBuffer());
    attachments.push({
      filename: file.name,
      content: bytesToBase64(bytes),
    });
  }

  return attachments;
};

const sendNotificationEmail = async (env, booking, files) => {
  if (!env.RESEND_API_KEY) {
    console.error("Booking email skipped: RESEND_API_KEY is not configured.");
    return { sent: false, reason: "RESEND_API_KEY is not configured." };
  }

  const attachments = await collectAttachments(files);
  const bookingFrom = env.BOOKING_FROM || DEFAULT_BOOKING_FROM;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: bookingFrom,
      to: notificationRecipients(env),
      subject: `New on-site quote appointment: ${booking.preferred_day} ${booking.preferred_window}`,
      html: buildEmailHtml(booking),
      attachments,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    console.error(`Booking email failed: ${message}`);
    return { sent: false, reason: message };
  }

  return { sent: true };
};

export async function onRequestPost({ request, env }) {
  const missingConfig = missingCalendarConfig(env);

  if (missingConfig.length) {
    console.error(`Booking calendar config missing: ${missingConfig.join(", ")}`);
    return json({
      message: "Online booking is being finished. Please call or text 734-480-8190 and we will get you scheduled.",
      code: "calendar_config_missing",
      missing: missingConfig,
    }, 503);
  }

  const formData = await request.formData();

  if (field(formData, "_honey")) {
    return json({ ok: true });
  }

  const files = formData.getAll("attachment").filter(isFileUpload);
  const booking = {
    pickup_city: field(formData, "pickup_city"),
    pickup_zip: field(formData, "pickup_zip"),
    preferred_day: field(formData, "preferred_day"),
    preferred_window: field(formData, "preferred_window"),
    location_type: field(formData, "location_type"),
    customer_present: field(formData, "customer_present"),
    pickup_address: field(formData, "pickup_address"),
    name: field(formData, "name"),
    phone: field(formData, "phone"),
    email: field(formData, "email"),
    estimated_load: field(formData, "estimated_load"),
    job_notes: formData.getAll("job_notes[]").map(clean).filter(Boolean).join(", "),
    items_to_remove: field(formData, "items_to_remove"),
    photo_count: files.length,
  };
  const required = [
    "pickup_city",
    "preferred_day",
    "preferred_window",
    "location_type",
    "customer_present",
    "pickup_address",
    "name",
    "phone",
    "email",
    "items_to_remove",
  ];
  const missing = required.filter((name) => !booking[name]);

  if (missing.length) {
    return json({ message: "Please fill out all required booking fields." }, 400);
  }

  if (!isIsoDate(booking.preferred_day)) {
    return json({ message: "Please choose a valid pickup date." }, 400);
  }

  const selectedSlot = WINDOWS.find((slot) => slot.label === booking.preferred_window);
  if (!selectedSlot) {
    return json({ message: "Please choose a valid pickup window." }, 400);
  }

  try {
    const timeZone = env.GOOGLE_CALENDAR_TIME_ZONE || TIME_ZONE;
    const range = slotRange(booking.preferred_day, selectedSlot);
    const calendar = encodeURIComponent(env.GOOGLE_CALENDAR_ID);
    const eventId = bookingEventId();
    const utcRange = slotUtcRange(booking.preferred_day, selectedSlot, timeZone);

    if (!hasMinimumLeadTime(utcRange.start)) {
      return json({ message: "Please choose a pickup window that starts at least 2 hours from now." }, 409);
    }

    if (await isSlotBusy(env, booking.preferred_day, selectedSlot, timeZone)) {
      return json({ message: "That pickup window is no longer available. Please choose another time." }, 409);
    }

    const response = await googleRequest(env, `/calendars/${calendar}/events?sendUpdates=none`, {
      method: "POST",
      body: JSON.stringify({
        id: eventId,
        summary: `On-site quote - ${booking.name} - ${booking.pickup_city}`,
        location: booking.pickup_address,
        description: buildDescription(booking),
        start: { dateTime: range.start, timeZone },
        end: { dateTime: range.end, timeZone },
        extendedProperties: {
          private: {
            source: "pure-mitten-booking-form",
            preferred_day: booking.preferred_day,
            preferred_window: booking.preferred_window,
            customer_phone: booking.phone,
            customer_email: booking.email,
          },
        },
      }),
    });

    if (response.status === 409) {
      return json({ message: "That pickup window is no longer available. Please choose another time." }, 409);
    }

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const event = await response.json();
    const email = await sendNotificationEmail(env, booking, files);
    const confirmationNumber = event.id ? event.id.slice(0, 12).toUpperCase() : null;

    return json({
      ok: true,
      confirmationNumber,
      eventId: event.id,
      eventLink: event.htmlLink,
      emailSent: email.sent,
    });
  } catch (error) {
    console.error(`Booking submission failed: ${error?.stack || error?.message || error}`);
    return json({
      message: "Something went wrong sending the on-site quote request. Please call or text 734-480-8190.",
      code: "booking_submit_failed",
    }, 500);
  }
}
