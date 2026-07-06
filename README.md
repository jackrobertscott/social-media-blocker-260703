# Social Media Blocker

Austere Chrome extension, written in TypeScript, that blocks a curated set of social media and video streaming sites beside a full-height rotating outdoor photo until a short reason is recorded.

## Behaviour

- Global on/off switch in the extension popup.
- Per-site toggles for the built-in blocked-site list.
- Blocked sites redirect to a full-height side-panel reason form beside a rotating outdoor photo.
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

## Privacy

The extension privacy policy is available in [PRIVACY.md](PRIVACY.md).
