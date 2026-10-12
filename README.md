# Axes & Ales

Booking and membership system for a Melbourne tabletop gaming social club.
Live at [axesandales.club](https://www.axesandales.club).

![Table and terrain availability for a club night](docs/img/booking.jpg)

## Why

The club ran on Booqable plus a spreadsheet. Booqable is built for equipment rental rather than table
bookings, and the fit showed: members couldn't edit or cancel their own bookings, there was no public
view of what was on — availability was only visible by walking through the booking flow — and the
committee had to open every booking individually to work out who had which table each week.
Cancelling was possible in theory, but only by the one committee member with backend access, so in
practice members posted in a Discord channel and someone removed the booking by hand. Paid membership
was tracked separately, also by hand.

Replacing both let the club move from financial-year memberships to rolling twelve-month ones. That
wasn't really a technical limitation so much as an administrative one: tracking expiry dates manually
for every member made rolling renewals impractical. Expiry reminders now go out automatically.

## What it does

- **Table bookings** — 16 large (6×4) and 6 small (3×4) tables, with per-night availability visible to
  anyone, signed in or not
- **Terrain box bookings** — fantasy and sci-fi terrain sets bookable alongside a table
- **Membership** on rolling twelve-month terms, with automated expiry reminders
- **Swap meet stall bookings**, with member pricing calculated and validated server-side
- **Events**, club layout and usage stats
- Member and admin accounts, with roles enforced in Firestore security rules
- Transactional email: Firestore `outbox` collection → `sendQueuedEmail` Cloud Function → Resend

## Stack

React + TypeScript, built with Vite and deployed to GitHub Pages. Firebase for the backend — Firestore,
Cloud Functions v2, Auth and Cloud Storage. Tailwind for styling, Vitest for tests, GitHub Actions for
CI/CD on push to `main`.

## Notes on how it's built

**Bookings are readable without an account.** That's deliberate — anyone can see what's on and how busy
the club is without signing up. Writes are restricted to the booking's owner or an admin.

**Business rules that involve money are validated in security rules, not the client.** Swap meet pricing
recomputes the member discount server-side rather than trusting the amount a client sends.

**This project is built AI-first, with the constraints written down rather than held in my head.** See
[`agents.md`](./agents.md) for the full set. The short version: agent work is confined to self-contained,
independently testable units — pure functions against Firestore, pure presentational components —
secrets never live in source, and the CI pipeline enforces that rather than my own vigilance.

## Running locally

```bash
npm install
cd functions && npm install && cd ..

cp .env.example .env.local   # fill in your Firebase config

npm run dev
```

## Painting gallery

The Gallery tab shows painting competition entries, one tab per event. It's generated from the
results export and photos rather than stored in Firestore:

```bash
npm run gallery:build
```

This reads each event listed in [`gallery.config.json`](./gallery.config.json) from `docs/<sourceFolder>/`
(gitignored, since the exports contain contact details) and writes display names, awards and resized,
metadata-stripped photos to `public/gallery-data/`, which is committed and deployed.

Photos are cropped to the `aspectRatio` in the config (4:5). The crop is chosen automatically to keep the
whole model in frame, then the printed award label, then centre the model. Each build writes a review sheet
to `reports/gallery/<event id>-crops.jpg` showing every crop on the original photo (red outline = the build
warned about it).

To add an event (e.g. Golden Axe 2027):

1. Put the results CSV export (needs `ENTRY ID`, `NAME` and `PLACING` columns; `PC` is optional) in
   `docs/Golden Axe 2027/`, and one photo per entrant in `docs/Golden Axe 2027/Photos/`.
   Name photos after the entrant, e.g. `GA2027_Jason.jpg` or `GA2027_Michael_McK.jpg`. Tokens with digits
   (`GA2027`, `02`) are ignored, and the rest is matched against the entrant's first name and surname.
2. Add the event to `gallery.config.json`. Optional keys: `displayNames` (override the
   "First L." name by entry ID), `photos` (assign a photo filename to an entry ID when it can't be
   matched by name), `resultsFile` (if there's more than one results CSV in the folder) and `crops`
   (override a photo's crop: `{ "GA2027_Jason.jpg": 120 }` starts the crop 120px from the top of the original).
3. Run `npm run gallery:build`, check the crop review sheet, then commit `gallery.config.json` and `public/gallery-data/`.

The build fails loudly if a photo matches no entrant, more than one entrant, or someone marked `DNE`.
Events whose source folder isn't present locally are skipped and their existing output is kept.

## Tests

```bash
npm test              # unit tests
npm run test:emulator # integration tests against the Firestore emulator
```

Linting is `npm run lint` (frontend) and `npm run lint` inside `functions/`. Both run at zero warnings.
