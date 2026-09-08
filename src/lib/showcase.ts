/**
 * Shared model for the community "Featured build" showcase.
 *
 * The community bento card, the /community/showcase list, and the
 * /community/showcase/[id] detail page all read the `community_showcase`
 * collection and rank it the same way, so the popularity ordering stays
 * consistent across every surface. Content is authored by the team (see
 * scripts/seed-showcase.cjs); community members only ever write the
 * `visits` and `starredBy`/`stars` counters (enforced in firestore.rules).
 */
import {
  collection,
  getDocs,
  limit,
  query,
  where,
  type Firestore,
} from "firebase/firestore";

export interface ShowcaseBuild {
  id: string;
  title?: string;
  tagline?: string;
  summary?: string;
  body?: string;
  tags?: string[];
  link?: string;
  linkLabel?: string;
  author?: string;
  coverUrl?: string;
  /** "published" builds are world-readable and eligible to be featured. */
  status?: string;
  /** Detail-page views, counted once per member session. */
  visits?: number;
  /** Kept in sync with `starredBy.length` by the rules and the star write. */
  stars?: number;
  /** Auth UIDs that starred this build — used to dedupe and toggle. */
  starredBy?: string[];
  /** Manual tie-breaker only; popularity ranks first. Lower shows earlier. */
  order?: number;
  /**
   * Pinned builds rank above every popularity result on all surfaces. The
   * community hub's single door into the Playground is the Featured Builds
   * card, so the Playground build stays pinned while the product is hidden
   * from the rest of the site.
   */
  pinned?: boolean;
  /**
   * Public repo (owner/name) backing this build. When set, the detail page
   * renders the live mini-GitHub summary panel (stars, releases, downloads)
   * via /api/showcase/repo.
   */
  repo?: string;
  updatedAt?: string;
}

/**
 * A star is a deliberate signal while a visit is passive, so a star is worth
 * several visits. Tunable; keep it in one place so card and list agree.
 */
export const STAR_WEIGHT = 5;

/** Composite popularity score used to auto-order every showcase surface. */
export function popularityScore(build: Pick<ShowcaseBuild, "visits" | "stars">): number {
  return (build.stars ?? 0) * STAR_WEIGHT + (build.visits ?? 0);
}

/**
 * Rank published builds: pinned builds first (the guaranteed door), then by
 * popularity, then the manual `order` tie-breaker, then most-recently
 * updated. Newest-first on full ties so a fresh build surfaces ahead of a
 * stale one that has caught up on views.
 */
export function rankShowcaseBuilds(rows: ShowcaseBuild[]): ShowcaseBuild[] {
  return [...rows].sort((a, b) => {
    const byPinned = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    if (byPinned !== 0) return byPinned;
    const byScore = popularityScore(b) - popularityScore(a);
    if (byScore !== 0) return byScore;
    const byOrder = (a.order ?? 999) - (b.order ?? 999);
    if (byOrder !== 0) return byOrder;
    return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  });
}

/**
 * Fetch all published showcase docs. A single equality filter needs no
 * composite index; ranking happens client-side in {@link rankShowcaseBuilds}.
 * Rejects are swallowed to an empty list so the bento card degrades to its
 * placeholder rather than throwing.
 */
export async function fetchPublishedShowcase(
  firestore: Firestore,
): Promise<ShowcaseBuild[]> {
  const snap = await getDocs(
    query(
      collection(firestore, "community_showcase"),
      where("status", "==", "published"),
      limit(30),
    ),
  );
  return snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as object) }) as ShowcaseBuild,
  );
}
