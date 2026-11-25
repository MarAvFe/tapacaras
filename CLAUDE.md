# tapacaras

Project facts the code can't show. Keep it short; no code snippets or build order here (they go stale).

## What it is for

A public, Spanish (Costa Rican, "usted") page where anyone covers the faces in a photo before sharing it,
mainly parents hiding children's faces. Success: the photo never leaves the device, every detected face is
covered by default, a missed face can be covered by hand, and it works on a phone.

## Non-negotiables

- The photo never leaves the browser. Nothing may weaken the CSP's `connect-src 'self'` /
  `default-src 'none'`, and no third-party scripts or CDNs are allowed. The promise is printed on the page.
- Faces are covered by default. Uncovering is the visitor's explicit tap, never the default, because a
  missed cover is the harm.
- Only page opens are counted. Nothing about photos (size, faces, style) is sent anywhere: the user decided
  that on 2026-11-25.
- No photos of real people in the repository, not even in tests or screenshots: `tests/local/` is
  git-ignored for that. The user's child must never appear in anything published.
- Claims on the page (privacy, metadata, offline) are tested by `tests/screenshot.mjs`. Rerun it after
  changing any of them.

## Working here

- Self-test: `./selftest.sh`. Run it before every commit; it must print `SELFTEST PASS`.
- Decisions go in `docs/DECISIONS.md` (reading taken — reason — how to change).
- Published text is in Spanish; everything internal is in English.
