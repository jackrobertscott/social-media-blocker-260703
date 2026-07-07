# Agent Instructions

## Applies when

Working in this repository.

## Chrome Web Store distributables

- When creating a Chrome Web Store upload package or other distributable, use `npm run package:chrome` unless the user explicitly requests a different versioning flow.
- Do not hand-zip `dist/` for Chrome Web Store uploads. The package script bumps `package.json`, `package-lock.json`, and `public/manifest.json`, rebuilds `dist/`, validates the archive, and creates `social-media-blocker-<version>-chrome-store.zip`.
- If a distributable is created without the package script, bump all version sources before building and zipping.
