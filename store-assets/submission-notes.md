# Chrome Web Store submission notes

## Upload package

Build the extension and zip the contents of `dist/` before uploading a new package in the Chrome Web Store Developer Dashboard:

```sh
npm run build
cd dist
zip -r ../social-media-blocker-0.1.0.zip .
```

The ZIP must have `manifest.json` at the root.

## Store listing

Short description (from manifest):

> Blocks social media sites until you write why you need access.

Long description:

> Social Media Blocker helps you pause before opening distracting social sites. When you visit a configured social media domain, the extension shows a quiet block page with an outdoor image and asks you to write a short reason before continuing. The reason is saved locally in Chrome so you can see recent access attempts and keep your browsing intentional.
>
> Features:
> - Global on/off switch in the popup.
> - Per-site toggles for supported social media domains.
> - Local history of recent access reasons.
> - Per-tab access grants: leaving the site clears the grant, so returning asks again.
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

> Blocks selected social media sites and asks the user to record a reason before allowing access.

Permission justifications:

- `storage`: Saves the extension's on/off setting, per-site toggles, and recent access reasons locally in Chrome.
- `tabs`: Redirects the current tab to the block page and then back to the originally requested site after a reason is submitted.
- `webNavigation`: Detects main-frame navigation to configured social media domains so the block page can be shown before the site loads.
- Host permissions: Limited to the configured social media domains so the extension can detect and redirect only those sites.

Remote code:

> No, this extension does not execute remotely hosted code.

Data disclosure draft:

> The extension stores settings, the requested social-media URL/domain, timestamps, and reasons entered by the user locally in Chrome storage. This data is used only to provide the blocker and recent-reasons history. It is not sold, shared, or transmitted to the developer. The block page loads decorative outdoor images from Unsplash, which may cause the browser to request image files from Unsplash.

## Test instructions

> Install the extension, ensure the global switch is on, then open a configured social media site such as instagram.com or reddit.com. The extension should redirect to the block page. Enter a non-empty reason and click Continue to site. Confirm the tab opens the requested site and the reason appears in the extension's recent-reasons history. In the popup, toggle the extension or individual sites off and confirm those sites are no longer blocked.
