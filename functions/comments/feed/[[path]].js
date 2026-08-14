export function onRequest() {
  return new Response("This retired feed is no longer available.", {
    status: 410,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
