export interface SocialSite {
  id: string;
  name: string;
  domains: readonly string[];
}

export const SOCIAL_SITES: readonly SocialSite[] = [
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
];

const sitesById: ReadonlyMap<string, SocialSite> = new Map(
  SOCIAL_SITES.map((site) => [site.id, site]),
);

export function getSiteById(siteId: string | null | undefined): SocialSite | undefined {
  return siteId ? sitesById.get(siteId) : undefined;
}

export function defaultSiteSettings(): Record<string, boolean> {
  const settings: Record<string, boolean> = {};

  for (const site of SOCIAL_SITES) {
    settings[site.id] = true;
  }

  return settings;
}

export function findMatchingSite(url: string): SocialSite | undefined {
  const host = getHttpHost(url);
  if (!host) {
    return undefined;
  }

  return SOCIAL_SITES.find((site) =>
    site.domains.some((domain) => domainMatches(host, domain)),
  );
}

export function domainMatches(host: string, domain: string): boolean {
  const normalisedHost = normaliseHost(host);
  const normalisedDomain = normaliseHost(domain);

  return (
    normalisedHost === normalisedDomain ||
    normalisedHost.endsWith(`.${normalisedDomain}`)
  );
}

export function formatSiteDomains(site: SocialSite): string {
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
