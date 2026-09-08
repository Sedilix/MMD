/**
* Client-safe partner registry — types, lookups, and JSON-derived helpers.
*
* No `fs` / `path` imports, safe to import from React components. Reads
* metadata from src/data/partners.json synchronously (bundled at build time),
* and resolves logo files via /partners/ URLs.
*
* For server-side discovery of files in /public/partners/ that don't yet have
* a JSON entry, import from '@/lib/partners.server' instead.
*/
import partnersData from '@/data/partners.json';

export interface PartnerLogoConfig {
    height: number;
    flexWidth: number;
    imgWidth: number;
}

export interface Partner {
    id: string;
    name: string;
    slug: string;
    category: string;
    description: string;
    /** Filename relative to /public/partners/ */
    logo: string;
    logoConfig: PartnerLogoConfig;
    bgWhite?: boolean;
    tags: string[];
    website?: string;
    /** True when the logo file exists on disk but has no curated JSON entry. */
    unregistered?: boolean;
    /**
     * True when this partner is curated but held back from public surfaces
     * (e.g. awaiting the partner's go-ahead before announcing them). Such
     * entries are kept in the books — visible to the build, the script, and the
     * /api/partners route — but filtered out of every rendered surface so they
     * never appear on the site until the flag is cleared.
     */
    awaitingApproval?: boolean;
}

interface PartnersJson {
    partners: Partner[];
}

/** Partners safe to show on public surfaces: curated, not awaiting approval. */
export function getVisiblePartners(): Partner[] {
    return (partnersData as PartnersJson).partners.filter(
        (p) => !p.awaitingApproval && !p.unregistered,
    );
}

/** Build a partner lookup map keyed by every searchable keyword (slug, tags, name). */
export function buildPartnerKeywordMap(): Map<string, Partner> {
    const map = new Map<string, Partner>();
    for (const p of (partnersData as PartnersJson).partners) {
        map.set(p.slug, p);
        for (const tag of p.tags) map.set(tag.toLowerCase(), p);
    }
    return map;
}

/** Detect which partners are mentioned in arbitrary text via keyword matching. */
export function matchPartnersInText(
    text: string,
    keywordMap?: Map<string, Partner>,
): Partner[] {
    const map = keywordMap ?? buildPartnerKeywordMap();
    const seen = new Set<string>();
    const matches: Partner[] = [];

    for (const partner of map.values()) {
        if (seen.has(partner.id)) continue;
        if (partner.awaitingApproval) continue;
        
        // Search by name and slug only to avoid false positives from generic tags
        const keywords = [partner.name, partner.slug].filter(Boolean);
        const hit = keywords.some((kw) => {
            // Use regex word boundaries to avoid partial word matches
            const regex = new RegExp(`\\b${kw.replace(/[-\\/\\\\^$*+?.()|[\\]{}]/g, '\\\\$&')}\\b`, 'i');
            return regex.test(text);
        });
        
        if (hit) {
            matches.push(partner);
            seen.add(partner.id);
        }
    }

    return matches;
}

/** Resolve a partner's logo to a /partners/<file> public URL. */
export function partnerLogoUrl(partner: Pick<Partner, 'logo'>): string {
    return `/partners/${partner.logo}`;
}

/**
 * Map of partner id → logo URL, built from the static JSON. Useful inside JSX
 * render blocks so we don't have to repeat `/partners/<file>` for each id.
 */
export function buildPartnerLogoByIdMap(): Map<string, string> {
    return new Map(
        (partnersData as PartnersJson).partners.map((p) => [p.id, partnerLogoUrl(p)]),
    );
}