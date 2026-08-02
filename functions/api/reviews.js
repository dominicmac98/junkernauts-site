const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVIEWS_API = "https://mybusiness.googleapis.com/v4";
const GOOGLE_REVIEWS_URL = "https://www.google.com/maps/place/Junkernauts+Junk+Removal/@42.2068029,-83.405485,10z/data=!3m1!4b1!4m6!3m5!1s0x269dd473619aca25:0x666cf24569d9cf63!8m2!3d42.2068029!4d-83.405485!16s%2Fg%2F11nr10jbj7";
const CACHE_SECONDS = 300;
const MAX_PAGES = 10;

const json = (body, status = 200, cacheControl = "no-store") => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": cacheControl,
  },
});

const configured = (env) => [
  "GOOGLE_BUSINESS_CLIENT_ID",
  "GOOGLE_BUSINESS_CLIENT_SECRET",
  "GOOGLE_BUSINESS_REFRESH_TOKEN",
  "GOOGLE_BUSINESS_ACCOUNT_ID",
  "GOOGLE_BUSINESS_LOCATION_ID",
].every((key) => Boolean(env[key]));

const resourcePart = (value, prefix) => String(value || "")
  .trim()
  .replace(new RegExp(`^${prefix}/`), "");

const starNumber = (rating) => {
  const values = {
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5,
  };

  return values[rating] || 0;
};

const refreshAccessToken = async (env) => {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_BUSINESS_CLIENT_ID,
    client_secret: env.GOOGLE_BUSINESS_CLIENT_SECRET,
    refresh_token: env.GOOGLE_BUSINESS_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    console.error(`Google OAuth refresh failed: ${response.status} ${await response.text()}`);
    throw new Error("Google authorization is unavailable.");
  }

  const data = await response.json();
  if (!data.access_token) throw new Error("Google did not return an access token.");

  return data.access_token;
};

const normalizeReview = (review) => {
  const rating = starNumber(review.starRating);
  const reviewer = review.reviewer || {};

  return {
    id: review.reviewId || review.name || crypto.randomUUID(),
    author: reviewer.displayName || "Google customer",
    authorPhoto: reviewer.profilePhotoUrl || "",
    rating,
    comment: String(review.comment || "").trim() || `Rated Junkernauts ${rating} out of 5 stars.`,
    createTime: review.createTime || review.updateTime || "",
    updateTime: review.updateTime || review.createTime || "",
    reviewUrl: GOOGLE_REVIEWS_URL,
  };
};

const fetchGoogleReviews = async (env) => {
  const accessToken = await refreshAccessToken(env);
  const accountId = resourcePart(env.GOOGLE_BUSINESS_ACCOUNT_ID, "accounts");
  const locationId = resourcePart(env.GOOGLE_BUSINESS_LOCATION_ID, "locations");
  const parent = `accounts/${accountId}/locations/${locationId}`;
  const reviews = [];
  let pageToken = "";
  let averageRating = 0;
  let totalReviewCount = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      pageSize: "50",
      orderBy: "updateTime desc",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(
      `${GOOGLE_REVIEWS_API}/${parent}/reviews?${params.toString()}`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      console.error(`Google reviews request failed: ${response.status} ${await response.text()}`);
      throw new Error("Google reviews are unavailable.");
    }

    const data = await response.json();
    reviews.push(...(data.reviews || []).map(normalizeReview));
    averageRating = Number(data.averageRating || averageRating || 0);
    totalReviewCount = Number(data.totalReviewCount || totalReviewCount || reviews.length);
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }

  return {
    source: "google-business-profile",
    averageRating,
    totalReviewCount,
    reviews,
    reviewUrl: GOOGLE_REVIEWS_URL,
    refreshedAt: new Date().toISOString(),
  };
};

export async function onRequestGet(context) {
  const { env, request } = context;

  if (!configured(env)) {
    return json({
      configured: false,
      message: "Google Business Profile reviews are not connected yet.",
    }, 503);
  }

  const cache = caches.default;
  const cacheKey = new Request(new URL("/api/reviews", request.url), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const payload = await fetchGoogleReviews(env);
    const response = json(
      payload,
      200,
      `public, max-age=120, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600`,
    );

    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    console.error("Review feed failed.", error);
    return json({
      configured: true,
      message: "Live Google reviews are temporarily unavailable.",
    }, 502);
  }
}
