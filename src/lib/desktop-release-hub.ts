/**
 * Release hub for the public Playground repository.
 *
 * Every desktop release is published to the public repo on GitHub
 * (`Sedilix/MMD`) — installers, signatures and the updater manifest live
 * there as release assets. The website no longer hosts the product; the
 * two compatibility shims (`/api/desktop/latest.json`, `/api/download/*`)
 * and the community "Featured build" repo panel all resolve through this
 * module, so there is exactly one place that knows how to talk to GitHub
 * about the product's releases.
 *
 * The installed desktop fleet still has `www.cybrdeck.com` endpoints baked
 * into its updater config, so these shims must keep working for as long as
 * old installs churn — even though humans are pointed at the repo directly.
 */

/** Owner/name of the public repo that hosts source, releases and installers. */
export const PLAYGROUND_PUBLIC_REPO = 'Sedilix/MMD';

/** Human-facing releases page — used by download buttons and brand copy. */
export const PLAYGROUND_RELEASES_URL = `https://github.com/${PLAYGROUND_PUBLIC_REPO}/releases`;

export interface GitHubReleaseAsset {
    name: string;
    browser_download_url: string;
    size: number;
}

export interface GitHubRelease {
    tag_name: string;
    name: string | null;
    body: string | null;
    published_at: string | null;
    html_url: string;
    assets: GitHubReleaseAsset[];
}

/** In-process TTL: warm serverless instances reuse one GitHub round-trip. */
const RELEASE_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedRelease: GitHubRelease | null = null;
let cachedAt = 0;
let cachedNotFoundAt = 0;

/**
 * Resolve the newest published release of the public repo.
 *
 * Drafts and prereleases are invisible to `releases/latest`, which is what
 * we want: only a release the public can actually download counts. Failures
 * return `null` so callers degrade (204 for the updater, 503 for manual
 * downloads) instead of throwing.
 */
export async function getLatestPlaygroundRelease(): Promise<GitHubRelease | null> {
    const now = Date.now();
    if (cachedRelease && now - cachedAt < RELEASE_CACHE_TTL_MS) return cachedRelease;
    // Don't hammer GitHub right after a confirmed miss either.
    if (!cachedRelease && cachedNotFoundAt && now - cachedNotFoundAt < RELEASE_CACHE_TTL_MS) {
        return null;
    }

    try {
        const res = await fetch(
            `https://api.github.com/repos/${PLAYGROUND_PUBLIC_REPO}/releases/latest`,
            {
                headers: {
                    accept: 'application/vnd.github+json',
                    'user-agent': 'cybrdeck-release-hub',
                },
                cache: 'no-store',
            },
        );
        if (!res.ok) {
            cachedRelease = null;
            cachedNotFoundAt = Date.now();
            return null;
        }
        const data = (await res.json()) as GitHubRelease;
        cachedRelease = data;
        cachedAt = Date.now();
        return data;
    } catch {
        cachedRelease = null;
        cachedNotFoundAt = Date.now();
        return null;
    }
}

/** Find an asset on a release by exact file name. */
export function findReleaseAsset(
    release: GitHubRelease,
    filename: string,
): GitHubReleaseAsset | undefined {
    return release.assets.find((a) => a.name === filename);
}
