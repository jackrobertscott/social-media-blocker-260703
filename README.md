# Social Media Blocker

Austere Chrome extension, written in TypeScript, that blocks a curated set of social media and video streaming sites beside a full-height rotating outdoor photo until a short reason is recorded.

## Behaviour

- Global on/off switch in the extension popup.
- Category-level toggles and per-site toggles for the built-in blocked-site list.
- Blocked sites redirect to a full-height side-panel reason form beside a rotating outdoor photo.
- The block page can temporarily disable blocking for every configured site for 15 minutes, 30 minutes, 1 hour, or 2 hours, then blocking resumes automatically.
- Submitting a non-empty reason records the attempt and grants access to that site in that tab.
- Leaving the site clears that tab's grant, so returning asks for a reason again.
- The block page shows previous access reasons.

The built-in blocked-site list is in `src/shared/sites.ts`.

## Development

```sh
npm install
npm run typecheck
npm run build
```

Load `dist/` in Chrome via **Extensions → Developer mode → Load unpacked**.

## Chrome Web Store package

Create uploadable store packages with:

```sh
npm run package:chrome
```

This automatically bumps the patch version in `package.json`, `package-lock.json`, and
`public/manifest.json`, rebuilds `dist/`, and creates
`social-media-blocker-<version>-chrome-store.zip` with `manifest.json` at the ZIP root.
Use `npm run package:chrome -- minor`, `npm run package:chrome -- major`, or
`npm run package:chrome -- <x.y.z>` when a patch bump is not enough.

## Privacy

The extension privacy policy is available in [PRIVACY.md](PRIVACY.md).
