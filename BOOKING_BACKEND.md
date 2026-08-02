# Fast Estimate and Google Calendar On-Site Quote Setup

The site has two separate customer paths:

- `/quote` sends a no-obligation estimate request to `/api/quotes`. It does not create a calendar event.
- `/booking` uses the appointment flow below and creates a Google Calendar event after submission.

Both forms send notifications to `info@getjunkernauts.com` and `contact@getjunkernauts.com` through Resend. The quote form only needs the Resend variables; it does not need Google Calendar credentials.

The booking page uses two API routes:

- `/api/availability?date=YYYY-MM-DD`
- `/api/bookings`

These are Cloudflare Pages Functions that talk to Google Calendar. Availability checks use Google Calendar busy windows, and on-site quote requests create a calendar event for the selected appointment window.

## 1. Create the Google service account

In Google Cloud Console:

1. Create or open a Google Cloud project.
2. Enable the Google Calendar API.
3. Create a service account.
4. Create a JSON key for that service account.
5. Open the Google Calendar you want to use for bookings, then share it with the service account email and give it permission to make changes to events.

## 2. Add Cloudflare Pages environment variables

In Cloudflare Pages, open `junkernauts-site` -> Settings -> Environment variables and add these production variables:

```text
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
GOOGLE_CALENDAR_ID=your-calendar-id@group.calendar.google.com
GOOGLE_CALENDAR_TIME_ZONE=America/Detroit
```

Use the `client_email` value from the service account JSON for `GOOGLE_SERVICE_ACCOUNT_EMAIL`.

Use the `private_key` value from the service account JSON for `GOOGLE_PRIVATE_KEY`. Keep the `\n` line breaks exactly as Google provides them.

For local testing, put the same values in `.dev.vars`. Do not commit `.dev.vars`.

The booking submit route will not create calendar events unless `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, and `GOOGLE_CALENDAR_ID` are all set in the production environment.

## 3. Email notifications

The Google Calendar event itself becomes the main booking record. Resend sends both quote and booking notification emails to `info@getjunkernauts.com` and `contact@getjunkernauts.com`.

For email notifications with uploaded photos attached, add:

```text
RESEND_API_KEY=your_resend_api_key
BOOKING_NOTIFY_TO=info@getjunkernauts.com,contact@getjunkernauts.com
BOOKING_FROM=Junkernauts Junk Removal <contact@getjunkernauts.com>
```

The `BOOKING_FROM` domain needs to be verified in Resend.

If `BOOKING_NOTIFY_TO` is not set, the function defaults to `info@getjunkernauts.com,contact@getjunkernauts.com`. Uploaded photo attachments require `RESEND_API_KEY`.

## 4. Cloudflare Pages settings

Use these settings if connecting the GitHub repo in the Cloudflare dashboard:

```text
Project name: junkernauts-site
Production branch: main
Build command: npm install
Build output directory: public
Root directory: /
```

The repository includes:

- `wrangler.jsonc` for Pages project config
- `public/_routes.json` so only `/api/*` invokes Pages Functions
- `public/_headers` for basic security and static asset cache headers
- `functions/api/quotes.js` for no-obligation photo estimate requests
- `functions/api/availability.js` and `functions/api/bookings.js` for booking routes

## 5. How double-booking prevention works

Each pickup window creates one Google Calendar event with a deterministic event ID based on the day and time window. If two customers submit the same window, Google Calendar rejects the second event with a conflict, and the customer is asked to choose another time.

The availability endpoint also checks the calendar's busy windows, so manually blocked calendar time can hide slots from the form.

## 6. Test

After deployment, visit:

```text
https://getjunkernauts.com/api/booking-health
https://getjunkernauts.com/api/availability?date=2026-07-10
```

The health endpoint should show `calendarConfigured: true` and `emailConfigured: true` after the required Cloudflare production variables are saved and the site has redeployed.

Then submit the booking form twice for the same date and time window. The first request should create a Google Calendar event, show a confirmation number on the thank-you page, and send the notification email. The second request should ask the customer to pick another window.
