export interface BlockedSite {
  id: string;
  name: string;
  domains: readonly string[];
}

export const BLOCKED_SITES: readonly BlockedSite[] = [
  {
    id: "facebook",
    name: "Facebook",
    domains: ["facebook.com", "fb.com"],
  },
  {
    id: "messenger",
    name: "Messenger",
    domains: ["messenger.com", "m.me"],
  },
  { id: "instagram", name: "Instagram", domains: ["instagram.com"] },
  { id: "x", name: "X / Twitter", domains: ["x.com", "twitter.com", "t.co"] },
  { id: "tiktok", name: "TikTok", domains: ["tiktok.com"] },
  { id: "reddit", name: "Reddit", domains: ["reddit.com", "redd.it"] },
  { id: "youtube", name: "YouTube", domains: ["youtube.com", "youtu.be"] },
  { id: "snapchat", name: "Snapchat", domains: ["snapchat.com"] },
  { id: "pinterest", name: "Pinterest", domains: ["pinterest.com", "pin.it"] },
  { id: "linkedin", name: "LinkedIn", domains: ["linkedin.com"] },
  { id: "threads", name: "Threads", domains: ["threads.net"] },
  { id: "discord", name: "Discord", domains: ["discord.com", "discord.gg"] },
  { id: "twitch", name: "Twitch", domains: ["twitch.tv"] },
  { id: "tumblr", name: "Tumblr", domains: ["tumblr.com"] },
  { id: "bluesky", name: "Bluesky", domains: ["bsky.app", "bsky.social"] },
  { id: "mastodon", name: "Mastodon", domains: ["mastodon.social", "mastodon.online"] },
  { id: "whatsapp", name: "WhatsApp", domains: ["whatsapp.com"] },
  { id: "telegram", name: "Telegram", domains: ["telegram.org", "t.me"] },
  { id: "vk", name: "VK", domains: ["vk.com"] },
  { id: "weibo", name: "Weibo", domains: ["weibo.com"] },
  { id: "netflix", name: "Netflix", domains: ["netflix.com"] },
  { id: "hulu", name: "Hulu", domains: ["hulu.com"] },
  { id: "disney-plus", name: "Disney+", domains: ["disneyplus.com"] },
  { id: "max", name: "Max", domains: ["max.com", "hbomax.com"] },
  { id: "prime-video", name: "Prime Video", domains: ["primevideo.com"] },
  { id: "apple-tv", name: "Apple TV+", domains: ["tv.apple.com"] },
  {
    id: "paramount-plus",
    name: "Paramount+",
    domains: ["paramountplus.com"],
  },
  { id: "peacock", name: "Peacock", domains: ["peacocktv.com"] },
  { id: "crunchyroll", name: "Crunchyroll", domains: ["crunchyroll.com"] },
  { id: "tubi", name: "Tubi", domains: ["tubitv.com"] },
  { id: "pluto-tv", name: "Pluto TV", domains: ["pluto.tv"] },
];

const sitesById: ReadonlyMap<string, BlockedSite> = new Map(
  BLOCKED_SITES.map((site) => [site.id, site]),
);

export function getSiteById(siteId: string | null | undefined): BlockedSite | undefined {
  return siteId ? sitesById.get(siteId) : undefined;
}

export function defaultSiteSettings(): Record<string, boolean> {
  const settings: Record<string, boolean> = {};

  for (const site of BLOCKED_SITES) {
    settings[site.id] = true;
  }

  return settings;
}

export function findMatchingSite(url: string): BlockedSite | undefined {
  const host = getHttpHost(url);
  if (!host) {
    return undefined;
  }

  return BLOCKED_SITES.find((site) =>
    site.domains.some((domain) => domainMatches(host, domain)),
  );
}

export function getMainDomain(url: string): string | undefined {
  const host = getHttpHost(url);
  if (!host) {
    return undefined;
  }

  const normalisedHost = normaliseHost(host);
  for (const site of BLOCKED_SITES) {
    const matchingDomain = site.domains.find((domain) =>
      domainMatches(normalisedHost, domain),
    );

    if (matchingDomain) {
      return normaliseHost(matchingDomain);
    }
  }

  return normalisedHost;
}

export function domainMatches(host: string, domain: string): boolean {
  const normalisedHost = normaliseHost(host);
  const normalisedDomain = normaliseHost(domain);

  return (
    normalisedHost === normalisedDomain ||
    normalisedHost.endsWith(`.${normalisedDomain}`)
  );
}

export function formatSiteDomains(site: BlockedSite): string {
  return site.domains.join(", ");
}

function getHttpHost(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }

    return parsed.hostname;
  } catch {
    return undefined;
  }
}

function normaliseHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}
