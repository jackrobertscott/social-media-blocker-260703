# Chrome Web Store submission notes

## Upload package

Create a new Chrome Web Store distributable before uploading a package in the Chrome Web Store Developer Dashboard:

```sh
npm run package:chrome
```

The package script automatically bumps the patch version in `package.json`,
`package-lock.json`, and `public/manifest.json`, rebuilds `dist/`, validates the ZIP,
and writes `social-media-blocker-<version>-chrome-store.zip`. Upload that ZIP. It
must have `manifest.json` at the root, not inside a top-level `dist/` folder. Use
`npm run package:chrome -- minor`, `npm run package:chrome -- major`, or
`npm run package:chrome -- <x.y.z>` when a patch bump is not enough.

## Store listing

Short description (from manifest):

> Blocks social media and video streaming sites with timed, per-tab bypass controls.

Long description:

> Social Media Blocker helps you pause before opening distracting social and streaming sites. When you visit a configured blocked domain, the extension shows a quiet block page with an outdoor image. Choose a timed bypass for that site, or temporarily pause blocking for all sites. No written reason is required or stored.
>
> Features:
> - Global on/off switch in the popup.
> - Per-site toggles for supported social media and streaming domains.
> - Local history and statistics of recent bypasses.
> - Per-tab access grants: leaving the site clears the grant, so returning shows the block page again.
> - No accounts, subscriptions, ads, analytics, or remote code.

Suggested category: Productivity

Suggested visibility for personal use across devices: Unlisted

## Required images

Screenshot:

`store-assets/screenshots/block-page-1280x800.png`

Small promotional image:

`store-assets/promotional/small-440x280.png`

## Privacy tab

Privacy policy URL:

`https://github.com/jackrobertscott/social-media-blocker-260703/blob/main/PRIVACY.md`

Single purpose:

> Blocks selected social media and video streaming sites with timed bypasses for individual sites or all sites.

Permission justifications:

- `storage`: Saves the extension's on/off setting, per-site toggles, timed grants, and recent bypass metadata locally in Chrome.
- `tabs`: Redirects the current tab to the block page and then back to the originally requested site after a bypass is selected.
- `webNavigation`: Detects main-frame navigation to configured social media and streaming domains so the block page can be shown before the site loads.
- Host permissions: Limited to the configured social media and streaming domains so the extension can detect and redirect only those sites.

Remote code:

> No, this extension does not execute remotely hosted code.

Data disclosure draft:

> The extension stores settings, blocked URLs/domains, bypass timestamps, and timed grants locally in Chrome storage. This data is used only to provide the blocker and recent-bypasses history. It is not sold, shared, or transmitted to the developer. The block page loads decorative outdoor images from Unsplash, which may cause the browser to request image files from Unsplash.

## Test instructions

> Install the extension, ensure the global switch is on, then open a configured site such as instagram.com, reddit.com, or netflix.com. The extension should redirect to the block page. Click Bypass this site, select a duration, and click Continue to site without entering any text. Confirm the tab opens the requested site and a bypass appears in the extension's recent-bypasses history. In the popup, toggle the extension or individual sites off and confirm those sites are no longer blocked.
