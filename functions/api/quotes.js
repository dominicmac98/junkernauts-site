const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const DEFAULT_NOTIFY_TO = "info@getjunkernauts.com,contact@getjunkernauts.com";
const DEFAULT_FROM = "Junkernauts Junk Removal <contact@getjunkernauts.com>";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  },
});

const clean = (value) => String(value || "").trim();
const field = (formData, name) => clean(formData.get(name));
const escapeHtml = (value) => clean(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const recipients = (env) => (env.BOOKING_NOTIFY_TO || DEFAULT_NOTIFY_TO)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const isFile = (value) => (
  value &&
  typeof value === "object" &&
  typeof value.name === "string" &&
  typeof value.size === "number" &&
  value.size > 0
);

const bytesToBase64 = (bytes) => {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
};

const quoteId = () => {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();

  return `PMQ-${Date.now().toString(36).toUpperCase()}-${suffix}`;
};

const collectAttachments = async (files) => {
  if (files.length > MAX_ATTACHMENTS) {
    throw new Error(`Please upload no more than ${MAX_ATTACHMENTS} photos.`);
  }

  let totalBytes = 0;
  const attachments = [];

  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      throw new Error("Please upload JPG, PNG, WebP, or HEIC photos only.");
    }

    totalBytes += file.size;
    if (totalBytes > MAX_ATTACHMENT_BYTES) {
      throw new Error("Please keep the total photo upload under 8 MB.");
    }

    attachments.push({
      filename: file.name,
      content: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
    });
  }

  return attachments;
};

const buildEmailHtml = (quote) => `
  <h1>New fast estimate request</h1>
  <p><strong>Estimate ID:</strong> ${escapeHtml(quote.id)}</p>
  <p><strong>Name:</strong> ${escapeHtml(quote.name)}</p>
  <p><strong>Phone:</strong> ${escapeHtml(quote.phone)}</p>
  <p><strong>City or ZIP:</strong> ${escapeHtml(quote.location)}</p>
  <p><strong>Preferred contact:</strong> ${escapeHtml(quote.contactMethod)}</p>
  <p><strong>Items to remove:</strong><br>${escapeHtml(quote.items).replace(/\n/g, "<br>")}</p>
  <p><strong>Photos attached:</strong> ${quote.photoCount}</p>
`;

export async function onRequestPost({ request, env }) {
  if (!env.RESEND_API_KEY) {
    console.error("Quote email unavailable: RESEND_API_KEY is not configured.");
    return json({
      message: "Online estimates are temporarily unavailable. Please call or text 734-480-8190.",
      code: "email_config_missing",
    }, 503);
  }

  try {
    const formData = await request.formData();

    if (field(formData, "_honey")) return json({ ok: true });

    const files = formData.getAll("attachment").filter(isFile);
    const quote = {
      id: quoteId(),
      name: field(formData, "name"),
      phone: field(formData, "phone"),
      location: field(formData, "location"),
      contactMethod: field(formData, "contact_method"),
      items: field(formData, "items_to_remove"),
      photoCount: files.length,
    };
    const missing = ["name", "phone", "location", "contactMethod", "items"]
      .filter((name) => !quote[name]);

    if (missing.length) {
      return json({ message: "Please fill out all required estimate fields." }, 400);
    }

    if (!["Text message", "Phone call"].includes(quote.contactMethod)) {
      return json({ message: "Please choose whether you prefer a call or text." }, 400);
    }

    const attachments = await collectAttachments(files);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.BOOKING_FROM || DEFAULT_FROM,
        to: recipients(env),
        subject: `Fast estimate request: ${quote.location} - ${quote.name}`,
        html: buildEmailHtml(quote),
        attachments,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      console.error(`Quote email failed: ${message}`);
      return json({
        message: "We could not send the estimate request. Please call or text 734-480-8190.",
        code: "quote_email_failed",
      }, 502);
    }

    return json({ ok: true, quoteId: quote.id, emailSent: true });
  } catch (error) {
    const message = error?.message || "Estimate request failed.";
    const isUploadError = message.startsWith("Please upload") || message.includes("photo upload");
    console.error(`Quote submission failed: ${error?.stack || message}`);

    return json({
      message: isUploadError ? message : "Something went wrong sending the estimate request. Please call or text 734-480-8190.",
      code: isUploadError ? "invalid_upload" : "quote_submit_failed",
    }, isUploadError ? 400 : 500);
  }
}
