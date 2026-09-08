"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Fraunces, Outfit } from "next/font/google";
import {
  ArrowUpRight,
  Brain,
  ChevronDown,
  Gamepad2,
  Hash,
  Heart,
  Keyboard,
  Loader2,
  MapPin,
  MessageSquare,
  Music,
  Paperclip,
  PenLine,
  Radio,
  Repeat2,
  Send,
  Trophy,
  Users,
  Video,
  Zap,
  Plus,
  X as XIcon,
  Star,
  Eye,
  Home,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDocs,
  getCountFromServer,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import { useAuth, useFirestore } from "@/firebase/provider";
import { CHANNELS } from "@/components/community/CommunityNavTree";
import { DraggableCard } from "@/components/community-v2/DraggableCard";
import { fetchPublishedShowcase, rankShowcaseBuilds, type ShowcaseBuild } from "@/lib/showcase";
import { cn } from "@/lib/utils";
import "./community-v2.css";

/*
 * Community hub — the bento home served at /community.
 *
 * The warm, light, playful bento direction of the Nev Flynn reference
 * recording: cream ground, soft white cards, pastel accent tiles, big
 * serif display type, and iOS-style draggable cards with a lagging
 * shadow trail. next.config.ts rewrites /community onto this route so
 * the hub bypasses the auth-guarded console layout used by the
 * filesystem routes below it (games, rooms, channels, ...).
 *
 * Event data is live from the Luma calendar; discussions, members,
 * rooms and scores read live from Firestore.
 */

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["600", "700", "900"],
  variable: "--font-cdv2-display",
});
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cdv2-body",
});

const NAV = ["All", "Discussions", "Games", "Members", "Showcase"];

/* Which cards each nav filter pulls to the top of the bento. Everything
 * else keeps its current relative order and the dense grid re-packs it
 * wherever fits — no fixed arrangement for the leftovers. */
const FILTER_CARDS: Record<string, string[]> = {
  Discussions: ["Discussion of the week", "Recent discussions"],
  Games: ["Game leaderboard", "Game arcade"],
  Members: ["Members", "Top contributors"],
  Showcase: ["Featured build", "Live now"],
};

const LEADERBOARD_NOTE =
  "Board rows come live from the game_scores collection (signed-in only, same rules as the hub).";

/* Games mirror the hub's /community/games roster; playable rows open the
 * same mini-app routes. */
const GAMES: { id: string; title: string; cadence: string; icon: LucideIcon; soon: boolean }[] = [
  { id: "tech-trivia", title: "Tech Trivia", cadence: "Daily", icon: Brain, soon: false },
  { id: "speed-type", title: "Speed Type", cadence: "Anytime", icon: Keyboard, soon: false },
  { id: "code-puzzle", title: "Code Puzzle", cadence: "Weekly", icon: Zap, soon: true },
  { id: "create", title: "Create a Quiz", cadence: "Community", icon: PenLine, soon: true },
];

type GameScore = { id: string; userName: string; score: number; gameId: string };

/* Events stream live from the cybrdeck Luma calendar through the same
 * /api/luma proxy the /events page uses — no static copy, no
 * placeholders. While the clock sits inside an event's stated start–end
 * window the card shows it as happening now; once that window passes it
 * reverts to the soonest upcoming event. */
type LumaCardEvent = {
  id: string;
  title: string;
  location: string;
  image: string;
  hasCover: boolean;
  url: string;
  startAt: string | null;
  endAt: string | null;
  timeZone: string;
  description?: string;
  slotsFilled?: number;
  capacity?: number;
  capacityKnown?: boolean;
};

/* Times always render in the event's own timezone, never the viewer's
 * or the server's. Formatters are cached per zone. */
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function eventFormatter(tz: string, kind: "day" | "time") {
  const key = `${tz}|${kind}`;
  let f = fmtCache.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(
        "en-SG",
        kind === "day"
          ? { weekday: "short", day: "numeric", month: "short", timeZone: tz }
          : { hour: "numeric", minute: "2-digit", timeZone: tz },
      );
    } catch {
      f = new Intl.DateTimeFormat(
        "en-SG",
        kind === "day"
          ? { weekday: "short", day: "numeric", month: "short" }
          : { hour: "numeric", minute: "2-digit" },
      );
    }
    fmtCache.set(key, f);
  }
  return f;
}

const mapsWebUrl = (q: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

/* Draft preview tool: freeze the clock with e.g. ?at=2026-08-15T12:00 to
 * inspect the happening-now and reverted states without waiting for the
 * real dates. The event data itself always stays live from Luma. */
function readPreviewNow(): number | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("at");
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/* X card: the brand account's live presence — what it posted, first;
 * the curated home feed (accounts it follows) only backs it up when the
 * account itself is quiet. Served by /api/x/feed; the bearer token never
 * reaches the client. */
type XPost = { id: string; authorHandle: string; text: string; postedAt: string | null };

/* Editorial trim for the tile: drop t.co URLs and collapse whitespace so
 * the clamp shows prose, not a bare link. Falls back to raw text when a
 * post is nothing but a URL. */
function cleanPostText(t: string) {
  const stripped = t.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  return stripped || t.replace(/\s+/g, " ").trim();
}

function agoLabel(iso: string | null, nowMs: number) {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const m = Math.floor((nowMs - ms) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

/* ── Split-flap member board ─────────────────────────────────────────
 * Old-airport departure-board counter for the hero tile. Each cell
 * folds the old glyph down and the new one up when the value changes;
 * first paint staggers cell by cell like a board waking up. Digits
 * keep the tile's own face (no costume mono), and anonymous visitors
 * see idle dashes — never a fabricated headcount. */
function FlapCell({ char, delayMs = 0 }: { char: string; delayMs?: number }) {
  const [current, setCurrent] = useState("-");
  const [from, setFrom] = useState<string | null>(null);
  const [flipId, setFlipId] = useState(0);
  const currentRef = useRef("-");
  useEffect(() => {
    if (currentRef.current === char) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      currentRef.current = char;
      setCurrent(char);
      setFrom(null);
      return;
    }
    const t = setTimeout(() => {
      setFrom(currentRef.current);
      currentRef.current = char;
      setCurrent(char);
      setFlipId((k) => k + 1);
    }, delayMs);
    return () => clearTimeout(t);
  }, [char, delayMs]);

  return (
    <span className="cdv2-flap" key={flipId}>
      <span className="cdv2-flap-half cdv2-flap-top"><span>{current}</span></span>
      <span className="cdv2-flap-half cdv2-flap-bottom"><span>{from ?? current}</span></span>
      {from != null && (
        <>
          <span className="cdv2-flap-anim cdv2-flap-anim-top"><span>{from}</span></span>
          <span
            className="cdv2-flap-anim cdv2-flap-anim-bottom"
            onAnimationEnd={() => setFrom(null)}
          >
            <span>{current}</span>
          </span>
        </>
      )}
      <span className="cdv2-flap-seam" />
    </span>
  );
}

function MemberFlapBoard({ count }: { count: number | null }) {
  const chars = (count != null ? String(count) : "--").split("");
  return (
    <div
      className="flex items-center gap-2.5 rounded-2xl bg-[var(--cdv2-ink)] py-2.5 pl-3.5 pr-4"
      role="status"
      aria-label={
        count != null
          ? `${count} registered members`
          : "Member count appears after signing in"
      }
    >
      <span aria-hidden className="flex items-center gap-1 text-lg font-bold text-[var(--cdv2-surface)]">
        {chars.map((c, i) => (
          <FlapCell key={i} char={c} delayMs={250 + i * 130} />
        ))}
      </span>
      <span className="text-[11px] font-medium leading-snug text-[var(--cdv2-surface)] opacity-75">
        registered
        <br />
        members
      </span>
    </div>
  );
}

/* ── Member avatar stack ───────────────────────────────────────────
 * The reference tile's overlapping-circles cluster, fed by real member
 * profiles (photo or initial) instead of a painted cast. Anonymous
 * visitors get dashed empty wells — never invented faces. */
type MemberFace = { uid: string; name: string; email?: string; photoURL?: string };
const AVATAR_TINTS = [
  "var(--cdv2-mint)",
  "var(--cdv2-sky)",
  "var(--cdv2-blush)",
  "var(--cdv2-butter)",
];

function MemberAvatarStack({
  faces,
  count,
  signedIn,
}: {
  faces: MemberFace[];
  count: number | null;
  signedIn: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-2">
        {signedIn
          ? faces.map((m, i) => (
              <span
                key={m.uid}
                title={m.name}
                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--cdv2-surface)] text-sm font-bold text-[var(--cdv2-ink)]"
                style={{ backgroundColor: AVATAR_TINTS[i % AVATAR_TINTS.length] }}
              >
                {m.photoURL ? (
                  <img src={m.photoURL} alt="" className="h-full w-full object-cover" />
                ) : (
                  m.name.charAt(0).toUpperCase()
                )}
              </span>
            ))
          : Array.from({ length: 4 }, (_, i) => (
              <span
                key={i}
                aria-hidden
                className="h-10 w-10 rounded-full border-2 border-dashed border-[var(--cdv2-line)] bg-[var(--cdv2-surface-2)]"
              />
            ))}
      </div>
      <p className="text-sm font-medium text-[var(--cdv2-ink-soft)]">
        {signedIn
          ? count != null
            ? `${count} member${count === 1 ? "" : "s"}`
            : "members"
          : "Sign in to meet the members"}
      </p>
    </div>
  );
}

/* ── Discussion feed row ───────────────────────────────────────────
 * Likes, emoji reactions, and threaded replies write to the same
 * shapes the live hub reads (likes/likedBy/reactions on the post doc,
 * threads in its `comments` subcollection), so engagement is shared
 * with the console's post cards. */
const REACTION_SET = ["👍", "❤️", "🔥", "😂", "😮", "🎉"];

type FeedPost = {
  id: string;
  authorId?: string;
  authorName?: string;
  authorEmail?: string;
  title?: string | null;
  content?: string;
  createdAt?: string;
  tags?: string[];
  mediaUrl?: string | null;
  mediaUrls?: string[];
  mediaTypes?: string[];
  commentsCount?: number;
  likes?: number;
  likedBy?: string[];
  reactions?: Record<string, string[]>;
  /** True when the post was authored by One's curiosity engine. */
  oneIndexed?: boolean;
};

type PostComment = {
  id: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  createdAt: string;
};

function FeedPostRow({
  post,
  firestore,
  me,
  nowMs,
}: {
  post: FeedPost;
  firestore: Firestore | null;
  me: User | null;
  nowMs: number;
}) {
  const uid = me?.uid ?? null;
  const liked = Boolean(uid && post.likedBy?.includes(uid));
  const reactions = post.reactions ?? {};
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  /* Edit + repost go through the server-side moderation routes — the
   * Firestore rules forbid clients from writing `content` or moderation
   * flags directly. The feed's onSnapshot picks both results up live. */
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.content ?? "");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [repostOpen, setRepostOpen] = useState(false);
  const [repostComment, setRepostComment] = useState("");
  const [repostSaving, setRepostSaving] = useState(false);
  const [repostError, setRepostError] = useState<string | null>(null);
  const [reposted, setReposted] = useState(false);

  /* Thread loads live only while it is open — same pattern as the hub,
   * so replies made on either surface appear on both. */
  useEffect(() => {
    if (!firestore || !commentsOpen) return;
    setCommentsLoading(true);
    const q = query(
      collection(firestore, "community_posts", post.id, "comments"),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setComments(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PostComment, "id">) })),
        );
        setCommentsLoading(false);
      },
      () => setCommentsLoading(false),
    );
    return () => unsub();
  }, [firestore, post.id, commentsOpen]);

  const toggleLike = async () => {
    if (!firestore || !uid) return;
    try {
      await updateDoc(doc(firestore, "community_posts", post.id), {
        likes: increment(liked ? -1 : 1),
        likedBy: liked ? arrayRemove(uid) : arrayUnion(uid),
      });
    } catch (err) {
      console.error("Like sync error:", err);
    }
  };

  const toggleReaction = async (emoji: string) => {
    if (!firestore || !uid) return;
    setPickerOpen(false);
    const has = (reactions[emoji] ?? []).includes(uid);
    try {
      await updateDoc(doc(firestore, "community_posts", post.id), {
        [`reactions.${emoji}`]: has ? arrayRemove(uid) : arrayUnion(uid),
      });
    } catch (err) {
      console.error("Reaction sync error:", err);
    }
  };

  const submitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !me || !replyText.trim()) return;
    setSendingReply(true);
    try {
      await addDoc(collection(firestore, "community_posts", post.id, "comments"), {
        authorId: me.uid,
        authorName: me.displayName || me.email?.split("@")[0] || "Member",
        authorEmail: me.email || "",
        authorAvatar: me.photoURL || "",
        content: replyText.trim(),
        createdAt: new Date().toISOString(),
      });
      await updateDoc(doc(firestore, "community_posts", post.id), {
        commentsCount: increment(1),
      });
      setReplyText("");
    } catch (err) {
      console.error("Reply failed:", err);
    } finally {
      setSendingReply(false);
    }
  };

  const saveEdit = async () => {
    if (!me || !editText.trim() || editSaving) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const token = await me.getIdToken();
      const res = await fetch("/api/community/posts/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ postId: post.id, content: editText.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(data?.error || "The edit could not be saved.");
        return;
      }
      setEditing(false);
    } catch {
      setEditError("Network error — the edit was not saved.");
    } finally {
      setEditSaving(false);
    }
  };

  const submitRepost = async () => {
    if (!me || repostSaving) return;
    setRepostSaving(true);
    setRepostError(null);
    try {
      const token = await me.getIdToken();
      const res = await fetch("/api/community/posts/repost", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sourcePostId: post.id, comment: repostComment.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRepostError(data?.error || "The repost could not be sent.");
        return;
      }
      setReposted(true);
      setRepostOpen(false);
      setRepostComment("");
    } catch {
      setRepostError("Network error — the repost was not sent.");
    } finally {
      setRepostSaving(false);
    }
  };

  const openEdit = () => {
    setEditText(post.content ?? "");
    setEditError(null);
    setEditing(true);
  };

  const openRepost = () => {
    setRepostError(null);
    setRepostOpen((v) => !v);
  };

  const types = post.mediaTypes ?? [];
  const urls = post.mediaUrls?.length ? post.mediaUrls : post.mediaUrl ? [post.mediaUrl] : [];
  const firstImage = urls.find((_, i) => (types[i] ?? "image/").startsWith("image/")) ?? null;
  const hasVideo = types.some((t) => t?.startsWith("video/"));
  const activeReactions = Object.entries(reactions).filter(([, uids]) => uids.length > 0);

  return (
    <div className="flex flex-1 flex-col justify-center py-3 first:pt-0 last:pb-0">
      <div className="mb-1 flex items-center gap-2">
        <span className="truncate text-sm font-bold">{post.authorName || "Member"}</span>
        {post.tags?.[0] && post.tags[0] !== "general" && (
          <span className="rounded-full bg-[var(--cdv2-surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--cdv2-ink-soft)]">
            {post.tags[0]}
          </span>
        )}
        {post.oneIndexed && (
          <span
            title="Indexed by Persona One Curiosity Engine"
            className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400"
          >
            <Brain className="h-2.5 w-2.5" /> One Memory
          </span>
        )}
        <span className="ml-auto shrink-0 text-xs font-medium text-[var(--cdv2-ink-faint)]">
          {agoLabel(post.createdAt ?? null, nowMs)}
        </span>
      </div>
      {post.title && <p className="mb-0.5 text-sm font-bold">{post.title}</p>}
      {editing ? (
        <div className="flex flex-col gap-1.5">
          <textarea
            value={editText}
            onChange={(e) => { setEditText(e.target.value); setEditError(null); }}
            onPointerDown={stopDrag}
            maxLength={4000}
            rows={3}
            autoFocus
            className="w-full resize-none rounded-xl border border-[var(--cdv2-line)] bg-[var(--cdv2-surface-2)] px-3 py-2 text-sm leading-relaxed text-[var(--cdv2-ink)] placeholder:text-[var(--cdv2-ink-faint)] focus-visible:outline-2 focus-visible:outline-[var(--cdv2-ink)]"
          />
          {editError && (
            <p role="alert" className="text-xs font-medium text-red-600">{editError}</p>
          )}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onPointerDown={stopDrag}
              onClick={saveEdit}
              disabled={!editText.trim() || editSaving}
              className="flex min-h-8 items-center gap-1 rounded-xl bg-[var(--cdv2-ink)] px-3 text-xs font-bold text-[var(--cdv2-surface)] transition-opacity hover:opacity-85 disabled:opacity-40"
            >
              {editSaving && <Loader2 className="h-3 w-3 animate-spin" />}
              Save edit
            </button>
            <button
              type="button"
              onPointerDown={stopDrag}
              onClick={() => setEditing(false)}
              className="flex min-h-8 items-center rounded-xl px-3 text-xs font-semibold text-[var(--cdv2-ink-soft)] transition-colors hover:bg-black/5"
            >
              Cancel
            </button>
            <span className="ml-auto text-[10px] font-medium text-[var(--cdv2-ink-faint)]">
              {editText.length}/4000
            </span>
          </div>
        </div>
      ) : (
        post.content && (
          <p className="line-clamp-2 text-sm leading-relaxed text-[var(--cdv2-ink-soft)]">
            {post.content}
          </p>
        )
      )}
      {firstImage && (
        <img
          src={firstImage}
          alt=""
          className="mt-2 h-20 w-32 rounded-xl border border-[var(--cdv2-line)] object-cover"
        />
      )}

      {/* Engagement row: likes, replies, emoji reactions — same storage
          contracts as the live hub. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onPointerDown={stopDrag}
          onClick={toggleLike}
          disabled={!uid}
          aria-label={liked ? "Unlike this discussion" : "Like this discussion"}
          className={cn(
            "flex min-h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold transition-colors",
            liked
              ? "bg-[var(--cdv2-blush)]/40 text-[var(--cdv2-ink)]"
              : "text-[var(--cdv2-ink-soft)] hover:bg-black/5",
            !uid && "cursor-not-allowed opacity-50",
          )}
        >
          <Heart className="h-3.5 w-3.5" fill={liked ? "currentColor" : "none"} />
          {post.likes ?? 0}
        </button>
        <button
          type="button"
          onPointerDown={stopDrag}
          onClick={() => setCommentsOpen((v) => !v)}
          aria-expanded={commentsOpen}
          className={cn(
            "flex min-h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold transition-colors",
            commentsOpen
              ? "bg-black/5 text-[var(--cdv2-ink)]"
              : "text-[var(--cdv2-ink-soft)] hover:bg-black/5",
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {post.commentsCount ?? comments.length} replies
        </button>
        {activeReactions.map(([emoji, uids]) => (
          <button
            key={emoji}
            type="button"
            onPointerDown={stopDrag}
            onClick={() => toggleReaction(emoji)}
            disabled={!uid}
            aria-label={`Toggle ${emoji} reaction`}
            className={cn(
              "flex min-h-8 items-center gap-1 rounded-full border border-[var(--cdv2-line)] px-2 text-xs font-semibold transition-colors",
              uid && uids.includes(uid)
                ? "bg-[var(--cdv2-butter)]/50 text-[var(--cdv2-ink)]"
                : "bg-[var(--cdv2-surface-2)] text-[var(--cdv2-ink-soft)] hover:bg-black/5",
              !uid && "cursor-not-allowed opacity-50",
            )}
          >
            <span aria-hidden>{emoji}</span>
            {uids.length}
          </button>
        ))}
        <div className="relative">
          <button
            type="button"
            onPointerDown={stopDrag}
            onClick={() => setPickerOpen((v) => !v)}
            disabled={!uid}
            aria-label="Add a reaction"
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border border-[var(--cdv2-line)] text-sm font-bold text-[var(--cdv2-ink-soft)] transition-colors hover:bg-black/5",
              !uid && "cursor-not-allowed opacity-50",
            )}
          >
            +
          </button>
          {pickerOpen && (
            <div className="absolute bottom-full left-0 z-30 mb-1.5 flex gap-0.5 rounded-xl border border-[var(--cdv2-line)] bg-[var(--cdv2-surface)] p-1.5 shadow-lg">
              {REACTION_SET.map((e) => (
                <button
                  key={e}
                  type="button"
                  onPointerDown={stopDrag}
                  onClick={() => toggleReaction(e)}
                  aria-label={`React ${e}`}
                  className="rounded-lg p-1 text-base transition-colors hover:bg-black/5"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        {hasVideo && (
          <span className="flex items-center gap-1 text-xs font-medium text-[var(--cdv2-ink-faint)]">
            <Video className="h-3 w-3" /> video
          </span>
        )}
        {/* Author-only edit + repost — both route through the moderated
            server endpoints, never through a direct Firestore write. */}
        {me && post.authorId === me.uid && !editing && (
          <button
            type="button"
            onPointerDown={stopDrag}
            onClick={openEdit}
            aria-label="Edit this discussion"
            className="flex min-h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold text-[var(--cdv2-ink-soft)] transition-colors hover:bg-black/5"
          >
            <PenLine className="h-3.5 w-3.5" /> Edit
          </button>
        )}
        {me && (
          <button
            type="button"
            onPointerDown={stopDrag}
            onClick={openRepost}
            aria-label="Repost this discussion"
            aria-expanded={repostOpen}
            className={cn(
              "flex min-h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold transition-colors",
              reposted || repostOpen
                ? "bg-black/5 text-[var(--cdv2-ink)]"
                : "text-[var(--cdv2-ink-soft)] hover:bg-black/5",
            )}
          >
            <Repeat2 className="h-3.5 w-3.5" />
            {reposted ? "Reposted" : "Repost"}
          </button>
        )}
      </div>

      {/* Repost composer, inline under the engagement row while open */}
      {repostOpen && (
        <div className="mt-2 flex flex-col gap-2 border-t border-[var(--cdv2-line)] pt-2">
          <input
            type="text"
            value={repostComment}
            onChange={(e) => { setRepostComment(e.target.value); setRepostError(null); }}
            onPointerDown={stopDrag}
            placeholder="Add a comment (optional)"
            maxLength={1000}
            className="w-full rounded-xl border border-[var(--cdv2-line)] bg-[var(--cdv2-surface-2)] px-3 py-1.5 text-sm text-[var(--cdv2-ink)] placeholder:text-[var(--cdv2-ink-faint)] focus-visible:outline-2 focus-visible:outline-[var(--cdv2-ink)]"
          />
          {repostError && (
            <p role="alert" className="text-xs font-medium text-red-600">{repostError}</p>
          )}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onPointerDown={stopDrag}
              onClick={submitRepost}
              disabled={repostSaving}
              className="flex min-h-8 items-center gap-1 rounded-xl bg-[var(--cdv2-ink)] px-3 text-xs font-bold text-[var(--cdv2-surface)] transition-opacity hover:opacity-85 disabled:opacity-40"
            >
              {repostSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Repeat2 className="h-3 w-3" />}
              Repost
            </button>
            <button
              type="button"
              onPointerDown={stopDrag}
              onClick={() => setRepostOpen(false)}
              className="flex min-h-8 items-center rounded-xl px-3 text-xs font-semibold text-[var(--cdv2-ink-soft)] transition-colors hover:bg-black/5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Threaded replies, inline under the post while open */}
      {commentsOpen && (
        <div className="mt-2 flex flex-col gap-2 border-t border-[var(--cdv2-line)] pt-2">
          {commentsLoading ? (
            <p className="text-xs font-medium text-[var(--cdv2-ink-soft)]">Loading replies…</p>
          ) : comments.length === 0 ? (
            <p className="text-xs font-medium text-[var(--cdv2-ink-faint)]">
              No replies yet — start the thread below.
            </p>
          ) : (
            <ul className="max-h-44 space-y-1.5 overflow-y-auto">
              {comments.map((c) => (
                <li key={c.id} className="flex gap-2 rounded-xl bg-[var(--cdv2-surface-2)] px-2.5 py-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--cdv2-sky)] text-[10px] font-bold text-[var(--cdv2-ink)]">
                    {c.authorAvatar ? (
                      <img src={c.authorAvatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (c.authorName || "M")[0].toUpperCase()
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-xs font-bold">{c.authorName}</span>
                      <span className="shrink-0 text-[10px] font-medium text-[var(--cdv2-ink-faint)]">
                        {agoLabel(c.createdAt ?? null, nowMs)}
                      </span>
                    </span>
                    <span className="block whitespace-pre-wrap text-xs leading-relaxed text-[var(--cdv2-ink-soft)]">
                      {c.content}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={submitReply} className="flex gap-1.5">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onPointerDown={stopDrag}
              placeholder={me ? "Write a reply…" : "Sign in to reply"}
              disabled={!me || sendingReply}
              maxLength={1000}
              className="min-w-0 flex-1 rounded-xl border border-[var(--cdv2-line)] bg-[var(--cdv2-surface-2)] px-3 py-1.5 text-sm text-[var(--cdv2-ink)] placeholder:text-[var(--cdv2-ink-faint)] focus-visible:outline-2 focus-visible:outline-[var(--cdv2-ink)] disabled:opacity-50"
            />
            <button
              type="submit"
              onPointerDown={stopDrag}
              disabled={!me || sendingReply || !replyText.trim()}
              className="flex min-h-9 items-center gap-1 rounded-xl bg-[var(--cdv2-ink)] px-3 text-xs font-bold text-[var(--cdv2-surface)] transition-opacity hover:opacity-85 disabled:opacity-40"
            >
              {sendingReply ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Reply
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ── Discussion composer ───────────────────────────────────────────
 * The hero's "Start a discussion" opens this as its own bento tile.
 * Title + body, attachments via picker or straight clipboard paste
 * (screenshots land as image files). Publishes through the same
 * /api/media/upload pipeline the live hub uses, so moderation and
 * storage behave identically. */
type ComposerAttachment = { file: File; previewUrl: string };

function DiscussionComposer({
  publishing,
  onPublish,
  onClose,
}: {
  publishing: boolean;
  onPublish: (title: string, content: string, files: File[]) => Promise<string | null>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: File[]) => {
    const next = [...attachments];
    let err: string | null = null;
    for (const f of incoming) {
      if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) {
        err = "Only images, GIFs and video can be attached.";
        continue;
      }
      if (f.size > 25 * 1024 * 1024) {
        err = `“${f.name}” is over the 25 MB limit.`;
        continue;
      }
      if (next.length >= 4) {
        err = "Up to four attachments per discussion.";
        break;
      }
      next.push({ file: f, previewUrl: URL.createObjectURL(f) });
    }
    setError(err);
    setAttachments(next);
  };

  /* Screenshots & copied images arrive as clipboard file items. */
  const onPaste = (e: React.ClipboardEvent) => {
    const pasted = Array.from(e.clipboardData.items)
      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it) => it.getAsFile())
      .filter((f): f is File => Boolean(f));
    if (pasted.length) {
      e.preventDefault();
      addFiles(pasted);
    }
  };

  const removeAt = (idx: number) => {
    const gone = attachments[idx];
    if (gone) URL.revokeObjectURL(gone.previewUrl);
    setAttachments(attachments.filter((_, i) => i !== idx));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || publishing) return;
    setError(null);
    const err = await onPublish(title.trim(), content.trim(), attachments.map((a) => a.file));
    if (err) {
      setError(err);
      return;
    }
    attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    setTitle("");
    setContent("");
    setAttachments([]);
    onClose();
  };

  return (
    <form onSubmit={submit} className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h2
          className={cn(
            "text-xl font-black tracking-tight",
            fraunces.variable,
            "font-[family-name:var(--font-cdv2-display)]",
          )}
        >
          New discussion
        </h2>
        <button
          type="button"
          onPointerDown={stopDrag}
          onClick={onClose}
          aria-label="Close composer"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--cdv2-ink-soft)] transition-colors hover:bg-black/10 hover:text-[var(--cdv2-ink)] focus-visible:outline-2 focus-visible:outline-[var(--cdv2-ink)]"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-[var(--cdv2-ink-soft)]">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          required
          placeholder="What's this about?"
          className="w-full rounded-xl border border-[var(--cdv2-line)] bg-[var(--cdv2-surface-2)] px-3.5 py-2.5 text-base font-medium outline-none placeholder:text-[var(--cdv2-ink-faint)] focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[var(--cdv2-ink)]"
        />
      </label>

      <label className="flex min-h-0 flex-1 flex-col">
        <span className="mb-1.5 block text-xs font-medium text-[var(--cdv2-ink-soft)]">
          Content
        </span>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onPaste={onPaste}
          placeholder="Write it up — or paste a screenshot straight in."
          className="min-h-24 w-full flex-1 resize-none rounded-xl border border-[var(--cdv2-line)] bg-[var(--cdv2-surface-2)] px-3.5 py-2.5 text-base leading-relaxed outline-none placeholder:text-[var(--cdv2-ink-faint)] focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[var(--cdv2-ink)]"
        />
      </label>

      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2.5">
          {attachments.map((a, i) => (
            <li key={a.previewUrl} className="relative">
              {a.file.type.startsWith("video/") ? (
                <video
                  src={a.previewUrl}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-16 w-16 rounded-xl bg-[var(--cdv2-surface-2)] object-cover"
                />
              ) : (
                <img
                  src={a.previewUrl}
                  alt={`Attachment ${i + 1}`}
                  className="h-16 w-16 rounded-xl object-cover"
                />
              )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={`Remove attachment ${i + 1}`}
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--cdv2-ink)] text-[var(--cdv2-surface)]"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onPointerDown={stopDrag}
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 rounded-full border border-[var(--cdv2-line)] bg-[var(--cdv2-surface)] px-3.5 py-2.5 text-sm font-medium transition-colors hover:bg-black/5"
        >
          <Paperclip className="h-4 w-4" /> Attach media
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple
          accept="image/*,video/*"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
        {error && (
          <p role="alert" className="text-xs font-medium text-[var(--cdv2-danger)]">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={publishing || !title.trim()}
          className="ml-auto flex items-center gap-1.5 rounded-full bg-[var(--cdv2-ink)] px-4 py-2.5 text-sm font-semibold text-[var(--cdv2-surface)] transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Post
        </button>
      </div>
    </form>
  );
}

/* ── Personal platform cards ─────────────────────────────────────────
 * Two flavours, one model:
 *  - paste-a-link embeds: `embedSrc` carries the official player.
 *  - connected live cards: `connection` carries the adapter id
 *    (e.g. "spotify") and the tile polls the member's OWN live
 *    snapshot server-side — tokens stay in the encrypted vault.
 * Gmail is deliberately absent — mail is private and has no public
 * embed. */
type PersonalCard = {
  id: string;
  platform: string;
  title: string;
  sourceUrl: string;
  embedSrc: string;
  tall: boolean;
  /** Adapter id for connected live cards; absent for embed cards. */
  connection?: string;
};

const PERSONAL_CARDS_KEY = "cdv2:personal-cards:v1";

/* Shape mirrors /api/community/connections and the vault snapshot. */
type ConnPlatform = {
  id: string;
  label: string;
  tagline: string;
  ready: boolean;
  blockedReason: string | null;
};
type ConnInfo = { platform: string; externalHandle?: string; connectedAt: string };
type LiveSnapshot = {
  kind: "playing" | "recent";
  title: string;
  subtitle: string;
  url: string;
  imageUrl?: string;
  playedAt?: string;
};

/* Human copy for the connect-flow redirect reason codes. */
const CONNECT_REASON_TEXT: Record<string, string> = {
  sign_in_required: "You need to be signed in to connect a platform.",
  not_ready: "That platform isn't ready to connect yet — its app registration is still pending.",
  denied: "You cancelled the sign-in — nothing was connected.",
  expired_or_mismatched_flow: "The connect flow expired — try again.",
  state_mismatch: "The connect flow didn't match — try again without editing the redirect URL.",
  session_mismatch: "The connect flow was started by a different session — try again.",
  missing_code: "The platform came back without an approval code — try again.",
  provider_error: "The platform rejected the connection — try again.",
  exchange_failed: "The token exchange failed — try again.",
  connect_failed: "The connect flow didn't finish — try again.",
  unknown_platform: "Unknown platform.",
};

/* Adapter id → display label, for the OAuth redirect notices. */
const CONN_LABELS: Record<string, string> = {
  spotify: "Spotify",
  instagram: "Instagram",
  facebook: "Facebook",
  apple_music: "Apple Music",
};

function stripReturnParams() {
  const p = new URLSearchParams(window.location.search);
  ["connected", "as", "connect_failed", "reason"].forEach((k) => p.delete(k));
  const qs = p.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

/* The member's own live platform snapshot. Polls their private
 * endpoint with the Firebase ID token; renders honest states for
 * loading, signed-out, expired grant, and quiet moments. */
function LiveConnectionCard(props: {
  platformId: string;
  platformLabel: string;
  externalHandle?: string;
  authedFetch: (url: string, init?: RequestInit) => Promise<Response>;
  nowMs: number;
  onReconnect: () => void;
}) {
  const { platformId, platformLabel, authedFetch, nowMs, onReconnect } = props;
  const [state, setState] = useState<"loading" | "signed_out" | "expired" | "ready">("loading");
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [handle, setHandle] = useState<string | undefined>(props.externalHandle);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch(`/api/community/connections/${platformId}/live`);
      if (res.status === 401) {
        setState("signed_out");
        return;
      }
      if (!res.ok) throw new Error("live read failed");
      const data = await res.json();
      if (!data.connected) {
        setState("signed_out");
        return;
      }
      if (data.expired) {
        setState("expired");
        return;
      }
      if (data.externalHandle) setHandle(data.externalHandle);
      setSnapshot(data.snapshot ?? null);
      setState("ready");
    } catch {
      /* transient: keep whatever was showing */
    }
  }, [authedFetch, platformId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (state === "loading") {
    return (
      <p className="text-xs font-medium text-[var(--cdv2-ink-soft)]">
        Syncing your {platformLabel}…
      </p>
    );
  }
  if (state === "signed_out") {
    return (
      <p className="text-xs font-medium text-[var(--cdv2-ink-soft)]">
        Sign in to see your {platformLabel} here.
      </p>
    );
  }
  if (state === "expired") {
    return (
      <div className="text-xs font-medium text-[var(--cdv2-ink-soft)]">
        <p>Your {platformLabel} connection expired.</p>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onReconnect}
          className="mt-1 font-semibold text-[var(--cdv2-ink)] underline underline-offset-2"
        >
          Reconnect
        </button>
      </div>
    );
  }
  if (!snapshot) {
    return (
      <p className="text-xs font-medium text-[var(--cdv2-ink-soft)]">
        {handle ? `${handle} has` : "You have"} nothing on {platformLabel} right now.
      </p>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-between gap-2">
      <div className="flex min-h-0 items-center gap-3">
        {snapshot.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={snapshot.imageUrl}
            alt=""
            className="h-12 w-12 shrink-0 rounded-xl object-cover"
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--cdv2-bg)]">
            <Music className="h-4 w-4 text-[var(--cdv2-ink-soft)]" />
          </span>
        )}
        <div className="min-w-0">
          <a
            href={snapshot.url}
            target="_blank"
            rel="noreferrer"
            onPointerDown={(e) => e.stopPropagation()}
            className="block truncate text-sm font-semibold text-[var(--cdv2-ink)] hover:underline"
          >
            {snapshot.title}
          </a>
          <p className="truncate text-xs font-medium text-[var(--cdv2-ink-soft)]">
            {snapshot.subtitle}
          </p>
        </div>
      </div>
      <p className="text-[11px] font-medium text-[var(--cdv2-ink-faint)]">
        {snapshot.kind === "playing"
          ? "Playing now"
          : `Last played${snapshot.playedAt ? ` ${agoLabel(snapshot.playedAt, nowMs)} ago` : ""}`}
      </p>
    </div>
  );
}

function parsePersonalLink(raw: string): Omit<PersonalCard, "id"> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(/^\w+:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, "");

  if (host === "open.spotify.com") {
    const m = url.pathname.match(/^\/(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/);
    if (!m) return null;
    const [, kind, id] = m;
    return {
      platform: "Spotify",
      title: `Spotify ${kind}`,
      sourceUrl: trimmed,
      embedSrc: `https://open.spotify.com/embed/${kind}/${id}`,
      tall: kind !== "track" && kind !== "episode",
    };
  }

  if (host === "music.apple.com" || host === "embed.music.apple.com") {
    const isSong = url.searchParams.has("i");
    const isCollection = /\/(album|playlist)\//.test(url.pathname);
    if (!isSong && !isCollection) return null;
    return {
      platform: "Apple Music",
      title: isSong ? "Apple Music song" : "Apple Music",
      sourceUrl: trimmed,
      embedSrc: `https://embed.music.apple.com${url.pathname}${url.search}`,
      tall: !isSong,
    };
  }

  if (host === "instagram.com") {
    const m = url.pathname.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
    if (!m) return null;
    return {
      platform: "Instagram",
      title: m[1] === "p" ? "Instagram post" : "Instagram reel",
      sourceUrl: trimmed,
      embedSrc: `https://www.instagram.com/${m[1]}/${m[2]}/embed/`,
      tall: true,
    };
  }

  if (host === "facebook.com" || host === "fb.com" || host === "fb.watch") {
    return {
      platform: "Facebook",
      title: "Facebook post",
      sourceUrl: trimmed,
      embedSrc: `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(url.toString())}&show_text=true&width=340`,
      tall: true,
    };
  }

  if (host === "youtu.be" || host === "youtube.com") {
    const id =
      host === "youtu.be"
        ? url.pathname.slice(1).split("/")[0]
        : (url.searchParams.get("v") ??
          url.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]+)/)?.[1]);
    if (!id) return null;
    return {
      platform: "YouTube",
      title: "YouTube video",
      sourceUrl: trimmed,
      embedSrc: `https://www.youtube-nocookie.com/embed/${id}`,
      tall: false,
    };
  }

  return null;
}

function loadPersonalCards(): PersonalCard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PERSONAL_CARDS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (c): c is PersonalCard =>
        Boolean(c) &&
        typeof (c as PersonalCard).id === "string" &&
        typeof (c as PersonalCard).platform === "string" &&
        typeof (c as PersonalCard).embedSrc === "string" &&
        typeof (c as PersonalCard).tall === "boolean",
    );
  } catch {
    return [];
  }
}

/* Default bento order; the grid re-packs live as cards are dragged around. */
const DEFAULT_ORDER = [
  "Community introduction",
  "Live now",
  "Follow on X",
  "Featured build",
  "Next event",
  "Discussion of the week",
  "Recent discussions",
  "Game leaderboard",
  "Game arcade",
  "Members",
  "Top contributors",
];

function stopDrag(e: React.PointerEvent) {
  e.stopPropagation();
}

/**
 * Desktop opens Google Maps in a new tab; mobile hands off to the OS
 * navigation app (Apple Maps on iOS, the default nav chooser on Android).
 */
function openInMaps(e: React.MouseEvent<HTMLAnchorElement>, placeFull: string) {
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 2);
  const isAndroid = /Android/i.test(ua);
  if (!isIOS && !isAndroid) return;
  e.preventDefault();
  const q = encodeURIComponent(placeFull);
  window.location.href = isIOS ? `maps://?q=${q}` : `geo:0,0?q=${q}`;
}

function Arrow() {
  return (
    <span className="cdv2-arrow flex h-9 w-9 items-center justify-center rounded-full">
      <ArrowUpRight className="h-4 w-4" strokeWidth={2.2} />
    </span>
  );
}

export default function CommunityV2Page() {
  const [order, setOrder] = useState(DEFAULT_ORDER);
  const [active, setActive] = useState("All");

  /* Event clock: ticks every 30s so a happening-now event reverts to the
   * next upcoming one as soon as its stated duration passes. The ?at=
   * preview param freezes the clock instead. */
  const [now, setNow] = useState(() => readPreviewNow() ?? Date.now());
  useEffect(() => {
    if (readPreviewNow() != null) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  /* Live Luma calendar: fetch on mount, refresh every 5 min. */
  const [events, setEvents] = useState<LumaCardEvent[]>([]);
  const [eventsState, setEventsState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/luma");
        const data = await res.json();
        if (!res.ok || !data.success || !Array.isArray(data.events)) {
          throw new Error(data?.error ?? "bad luma response");
        }
        if (!cancelled) {
          setEvents(data.events as LumaCardEvent[]);
          setEventsState("ready");
        }
      } catch {
        if (!cancelled) setEventsState((s) => (s === "ready" ? s : "error"));
      }
    };
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  /* Live X presence: fetch on mount, refresh every 5 min. The account's
   * own posts first; the home feed only when it hasn't posted. */
  const [xHandle, setXHandle] = useState("cybrd3ck");
  const [xEntries, setXEntries] = useState<XPost[]>([]);
  const [xState, setXState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/x/feed");
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data?.error ?? "bad x response");
        if (!cancelled) {
          setXHandle(typeof data.handle === "string" && data.handle ? data.handle : "cybrd3ck");
          const entries =
            Array.isArray(data.posts) && data.posts.length ? data.posts : (data.feed ?? []);
          setXEntries((entries as XPost[]).slice(0, 2));
          setXState("ready");
        }
      } catch {
        if (!cancelled) setXState((s) => (s === "ready" ? s : "error"));
      }
    };
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const timedEvents = events
    .filter((e) => Boolean(e.startAt))
    .map((e) => ({
      ...e,
      startMs: Date.parse(e.startAt as string),
      endMs: e.endAt ? Date.parse(e.endAt) : null,
    }))
    .filter((e) => Number.isFinite(e.startMs))
    .sort((a, b) => a.startMs - b.startMs);
  const liveEvent =
    timedEvents.find((e) => e.endMs != null && now >= e.startMs && now <= e.endMs) ?? null;
  const upcomingEvents = timedEvents.filter((e) => e.startMs > now);
  /* With several events upcoming the tile auto-advances like a departures
   * board; hover pauses it so a card can be read and clicked. A live event
   * always pins the tile. */
  const [eventIdx, setEventIdx] = useState(0);
  const [eventPaused, setEventPaused] = useState(false);
  /* Timestamp of the last drag movement on the event card; a click landing
   * right after a drag is a release, not an intent to open the tab. */
  const eventDragAt = useRef(0);
  const liveId = liveEvent?.id ?? null;
  useEffect(() => {
    if (liveId || eventPaused || upcomingEvents.length < 2) return;
    const t = setInterval(() => setEventIdx((i) => i + 1), 7000);
    return () => clearInterval(t);
  }, [liveId, eventPaused, upcomingEvents.length]);
  const shownEvent = liveEvent ?? upcomingEvents[eventIdx % upcomingEvents.length] ?? null;
  const shownVirtual = shownEvent ? /virtual/i.test(shownEvent.location) : false;
  const shownPlaceShort = shownEvent
    ? (shownEvent.location.split(",")[0] || shownEvent.location)
        .trim()
        .replace("Singapore Institute of Technology", "SIT")
    : "";
  /* Headcount only shows a denominator when Luma actually reports a
   * capacity; the route's numeric fallback must never surface as truth. */
  const shownGoing = (() => {
    if (!shownEvent) return null;
    const going = shownEvent.slotsFilled ?? 0;
    if (shownEvent.capacityKnown && typeof shownEvent.capacity === "number") {
      return `${going}/${shownEvent.capacity} going`;
    }
    return going > 0 ? `${going} going` : null;
  })();
  const shownBlurb =
    shownEvent?.description && shownEvent.description !== "No description provided."
      ? shownEvent.description.replace(/\s+/g, " ").trim()
      : "";
  /* Personal platform cards: member-added embeds, persisted locally in
   * the draft. Ids join `order` so they drag/reorder with everything. */
  const [personalCards, setPersonalCards] = useState<PersonalCard[]>(loadPersonalCards);
  const [composing, setComposing] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const detected = parsePersonalLink(linkDraft);
  useEffect(() => {
    try {
      window.localStorage.setItem(PERSONAL_CARDS_KEY, JSON.stringify(personalCards));
    } catch {
      /* private mode: the card just won't survive a reload */
    }
  }, [personalCards]);
  useEffect(() => {
    setOrder((prev) => {
      const ids = personalCards.map((c) => c.id);
      const cleaned = prev.filter((id) => !id.startsWith("pc-") || ids.includes(id));
      const missing = ids.filter((id) => !cleaned.includes(id));
      if (!missing.length && cleaned.length === prev.length) return prev;
      return [...cleaned, ...missing];
    });
  }, [personalCards]);

  const addPersonalCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detected) return;
    const id = `pc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    setPersonalCards((prev) => [...prev, { ...detected, id }]);
    setLinkDraft("");
    setComposing(false);
  };
  const removePersonalCard = (id: string) =>
    setPersonalCards((prev) => prev.filter((c) => c.id !== id));

  /* ── Platform connections (full OAuth) ──────────────────────────
   * The member connects their own accounts server-side; tokens live
   * in the encrypted vault and never reach this page. What the page
   * gets: the platform list (with honest readiness), the member's
   * connection metadata, and per-card live snapshots. */
  const auth = useAuth();
  const firestore = useFirestore();
  const [me, setMe] = useState<User | null>(null);
  useEffect(() => onAuthStateChanged(auth, (u) => setMe(u)), [auth]);
  const signedIn = Boolean(me);

  /* Live rooms pulse: same query the hub layout runs (active and
   * unexpired). Reads require sign-in, so anonymous visitors get a
   * neutral tile instead of a fake or denied count. */
  type LiveRoom = { id: string; name?: string; participantCount?: number };
  const [liveRooms, setLiveRooms] = useState<LiveRoom[]>([]);
  const [roomsOpen, setRoomsOpen] = useState(false);
  useEffect(() => {
    if (!firestore || !signedIn) return;
    const now = new Date().toISOString();
    const q = query(
      collection(firestore, "vtc_rooms"),
      where("expiresAt", ">", now),
      where("status", "==", "active"),
    );
    const unsub = onSnapshot(
      q,
      (snap) =>
        setLiveRooms(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Partial<LiveRoom>) })),
        ),
      () => {},
    );
    return () => unsub();
  }, [firestore, signedIn]);

  /* Featured build for the bento card: the top-ranked published showcase doc.
   * Published docs are world-readable (firestore.rules), so this runs for
   * anonymous visitors too — the card links into the hub detail page, which
   * the AuthGuard gates. Ranking is by popularity (stars×5 + visits), so the
   * card re-orders itself as members view and star builds. */
  const [featuredBuild, setFeaturedBuild] = useState<ShowcaseBuild | null>(null);
  useEffect(() => {
    if (!firestore) return;
    let cancelled = false;
    fetchPublishedShowcase(firestore)
      .then((rows) => {
        if (cancelled) return;
        setFeaturedBuild(rankShowcaseBuilds(rows)[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setFeaturedBuild(null);
      });
    return () => {
      cancelled = true;
    };
  }, [firestore]);

  /* Registered-member headcount for the hero flap board: a cheap
   * server-side count over the same `users` collection the hub merges,
   * signed-in only (rules mirror the hub). Anonymous keeps idle dashes. */
  const [memberCount, setMemberCount] = useState<number | null>(null);
  useEffect(() => {
    if (!firestore || !signedIn) {
      setMemberCount(null);
      return;
    }
    let cancelled = false;
    getCountFromServer(collection(firestore, "users"))
      .then((snap) => {
        if (!cancelled) setMemberCount(snap.data().count);
      })
      .catch(() => {
        if (!cancelled) setMemberCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [firestore, signedIn]);

  /* Live game-score board: top five across every mini-game, the same
   * collection and ordering the hub's Games & Leaderboard page uses. */
  const [gameScores, setGameScores] = useState<GameScore[] | null>(null);
  useEffect(() => {
    if (!firestore || !signedIn) {
      setGameScores(null);
      return;
    }
    let cancelled = false;
    getDocs(query(collection(firestore, "game_scores"), orderBy("score", "desc"), limit(5)))
      .then((snap) => {
        if (!cancelled)
          setGameScores(snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<GameScore, "id">) })));
      })
      .catch(() => {
        if (!cancelled) setGameScores([]);
      });
    return () => {
      cancelled = true;
    };
  }, [firestore, signedIn]);

  /* Real member directory slice: powers the hero face pile, the Members
   * tile, and contributor name resolution. Same `users` collection the
   * hub merges. Anonymous gets dashed wells, never invented people. */
  const [memberFaces, setMemberFaces] = useState<MemberFace[]>([]);
  useEffect(() => {
    if (!firestore || !signedIn) {
      setMemberFaces([]);
      return;
    }
    let cancelled = false;
    getDocs(collection(firestore, "users"))
      .then((snap) => {
        if (cancelled) return;
        setMemberFaces(
          snap.docs.map((d) => {
            const v = d.data() as {
              displayName?: string;
              name?: string;
              email?: string;
              photoURL?: string;
            };
            return {
              uid: d.id,
              name: v.displayName || v.name || (v.email ? v.email.split("@")[0] : "Member"),
              email: typeof v.email === "string" && v.email ? v.email : undefined,
              photoURL: typeof v.photoURL === "string" && v.photoURL ? v.photoURL : undefined,
            };
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setMemberFaces([]);
      });
    return () => {
      cancelled = true;
    };
  }, [firestore, signedIn]);

  /* Live discussion feed: same collection + ordering the hub reads, so
   * a post made in the composer tile shows up here (and on /community).
   * The tile renders the four newest; the wider window also feeds the
   * contributor scoring below. */
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [postsState, setPostsState] = useState<"loading" | "ready">("loading");
  useEffect(() => {
    if (!firestore || !signedIn) {
      setPosts([]);
      setPostsState("ready");
      return;
    }
    const q = query(
      collection(firestore, "community_posts"),
      orderBy("createdAt", "desc"),
      limit(60),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPosts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FeedPost, "id">) })));
        setPostsState("ready");
      },
      () => setPostsState("ready"),
    );
    return () => unsub();
  }, [firestore, signedIn]);

  /* Top contributors: same scoring the hub uses (post 15, like 5,
   * reply 3, membership 10) computed live from the feed snapshot and
   * the real member list — no sample names. */
  const [contribPeriod, setContribPeriod] = useState<"week" | "alltime">("week");
  const topContributors = useMemo(() => {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const active =
      contribPeriod === "week"
        ? posts.filter((p) => !p.createdAt || p.createdAt >= oneWeekAgo)
        : posts;
    const score = new Map<string, { name: string; points: number }>();
    const add = (id: string, name: string, pts: number) => {
      const cur = score.get(id);
      if (cur) cur.points += pts;
      else score.set(id, { name, points: pts });
    };
    active.forEach((p) => {
      const byUid = p.authorId ? memberFaces.find((m) => m.uid === p.authorId) : undefined;
      const byEmail = p.authorEmail
        ? memberFaces.find((m) => m.email?.toLowerCase() === p.authorEmail?.toLowerCase())
        : undefined;
      const match = byUid ?? byEmail;
      const id = match?.uid || p.authorId || p.authorEmail || p.authorName || "unknown";
      const name =
        match?.name || p.authorName || (p.authorEmail ? p.authorEmail.split("@")[0] : "Member");
      add(id, name, 15 + (p.likes ?? 0) * 5 + (p.commentsCount ?? 0) * 3);
    });
    /* Registered members without posts in the window keep a starter 10,
     * mirroring the hub so the board never looks fabricated-empty. */
    memberFaces.forEach((m) => {
      if (!score.has(m.uid)) score.set(m.uid, { name: m.name, points: 10 });
    });
    return [...score.values()].sort((a, b) => b.points - a.points).slice(0, 3);
  }, [posts, memberFaces, contribPeriod]);

  /* "Start a discussion" opens the composer as its own bento tile at
   * the top of the grid; closing hands the slot back. Anonymous is
   * routed to sign-in first. */
  const [composerOpen, setComposerOpen] = useState(false);
  const openComposer = () => {
    if (!signedIn) {
      window.location.href = "/login?redirect=/community";
      return;
    }
    setComposerOpen(true);
    setOrder((prev) => (prev.includes("New discussion") ? prev : ["New discussion", ...prev]));
  };
  const closeComposer = () => {
    setComposerOpen(false);
    setOrder((prev) => prev.filter((id) => id !== "New discussion"));
  };

  const authedFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      return fetch(url, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    },
    [auth],
  );

  /* Composer publish: same pipeline as the live hub — the route handles
   * auth, moderation, storage and the Firestore write. Returns an error
   * string for inline display, or null on success. */
  const [publishing, setPublishing] = useState(false);
  const publishDiscussion = useCallback(
    async (title: string, content: string, files: File[]) => {
      setPublishing(true);
      try {
        const fd = new FormData();
        fd.append("title", title);
        fd.append("caption", content);
        files.forEach((f) => fd.append("files", f, f.name));
        const res = await authedFetch("/api/media/upload", { method: "POST", body: fd });
        const data = await res.json().catch(() => null);
        if (!res.ok) return data?.error || "The discussion couldn't be posted.";
        return null;
      } catch {
        return "Network error — the discussion wasn't posted.";
      } finally {
        setPublishing(false);
      }
    },
    [authedFetch],
  );

  const [connPlatforms, setConnPlatforms] = useState<ConnPlatform[]>([]);
  const [connList, setConnList] = useState<ConnInfo[]>([]);
  const [connError, setConnError] = useState(false);

  const refreshConnections = useCallback(async () => {
    try {
      const res = await authedFetch("/api/community/connections");
      if (res.status === 401) {
        setConnPlatforms([]);
        setConnList([]);
        return;
      }
      if (!res.ok) throw new Error("bad connections response");
      const data = await res.json();
      if (Array.isArray(data.platforms)) setConnPlatforms(data.platforms);
      if (Array.isArray(data.connections)) setConnList(data.connections);
      setConnError(false);
    } catch {
      setConnError(true);
    }
  }, [authedFetch]);

  useEffect(() => {
    if (signedIn) refreshConnections();
  }, [signedIn, refreshConnections]);

  /* OAuth redirect outcomes (?connected=… / ?connect_failed=…). The
   * callback route bounces back here; we translate the reason code,
   * surface it in the composer, and clean the URL. */
  const [connectNotice, setConnectNotice] = useState<string | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const connectedId = p.get("connected");
    const failedId = p.get("connect_failed");
    if (!connectedId && !failedId) return;
    if (connectedId) {
      const as = p.get("as");
      setConnectNotice(
        `${CONN_LABELS[connectedId] ?? connectedId} connected${as ? ` as ${as}` : ""} — add your live card below.`,
      );
    } else {
      const reason = p.get("reason") ?? "";
      setConnectNotice(CONNECT_REASON_TEXT[reason] ?? "The connect flow didn't finish — you can try again.");
    }
    setComposing(true);
    stripReturnParams();
  }, []);

  const connFor = (id: string) => connList.find((c) => c.platform === id) ?? null;

  const addLiveCard = (platformId: string, label: string) => {
    setPersonalCards((prev) => {
      if (prev.some((c) => c.connection === platformId)) return prev;
      const id = `pc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      return [
        ...prev,
        {
          id,
          platform: label,
          title: `${label} live`,
          sourceUrl: "",
          embedSrc: "",
          tall: false,
          connection: platformId,
        },
      ];
    });
    setConnectNotice(null);
  };

  const disconnectPlatform = async (platformId: string) => {
    try {
      await authedFetch(`/api/community/connections/${platformId}`, { method: "DELETE" });
    } catch {
      /* the live card's next poll falls back to a sign-in state */
    }
    setPersonalCards((prev) => prev.filter((c) => c.connection !== platformId));
    setConnList((prev) => prev.filter((c) => c.platform !== platformId));
  };

  /* Top-level navigation: the OAuth redirect legs authenticate via
   * the session cookie, so no bearer header is possible here. */
  const startConnect = (platformId: string) => {
    window.location.href = `/api/community/connections/${platformId}/connect`;
  };

  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const registerFns = useRef(new Map<string, (el: HTMLDivElement | null) => void>());
  const lastSwapAt = useRef(0);
  /* The just-swapped neighbour is still gliding to its new slot (layout
   * spring ~500ms); hit-testing its in-flight rect causes swap-back
   * oscillation, so it is excluded until it settles. */
  const swapPartner = useRef<{ id: string; until: number } | null>(null);

  const register = (cardId: string) => {
    let fn = registerFns.current.get(cardId);
    if (!fn) {
      fn = (el) => {
        if (el) cardRefs.current.set(cardId, el);
        else cardRefs.current.delete(cardId);
      };
      registerFns.current.set(cardId, fn);
    }
    return fn;
  };

  /* Live reorder: while dragging, if the bubble's center enters another
   * card's slot, swap positions — the grid re-packs and neighbours slide
   * out of the way (iOS-home-screen style). Cooldown prevents thrash. */
  const handleDragMove = (cardId: string, dx: number, dy: number) => {
    const now = performance.now();
    if (now - lastSwapAt.current < 300) return;
    const el = cardRefs.current.get(cardId);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + dx + r.width / 2;
    const cy = r.top + dy + r.height / 2;
    for (const [other, otherEl] of cardRefs.current) {
      if (other === cardId) continue;
      if (swapPartner.current && other === swapPartner.current.id && now < swapPartner.current.until) continue;
      const o = otherEl.getBoundingClientRect();
      if (cx >= o.left && cx <= o.right && cy >= o.top && cy <= o.bottom) {
        lastSwapAt.current = now;
        swapPartner.current = { id: other, until: now + 700 };
        setOrder((prev) => {
          const next = [...prev];
          const a = next.indexOf(cardId);
          const b = next.indexOf(other);
          next[a] = other;
          next[b] = cardId;
          return next;
        });
        break;
      }
    }
  };

  /* Nav filters: related cards glide to the top of the bento; the rest
   * keep their relative order and the dense grid re-packs them wherever
   * is convenient. "All" restores the default arrangement. */
  const applyFilter = (filter: string) => {
    setActive(filter);
    setOrder((prev) => {
      if (filter === "All") return DEFAULT_ORDER;
      const related = FILTER_CARDS[filter] ?? [];
      return [
        ...prev.filter((id) => related.includes(id)),
        ...prev.filter((id) => !related.includes(id)),
      ];
    });
  };

  const dragProps = (cardId: string) => ({
    registerRef: register(cardId),
    onDragMove: (dx: number, dy: number) => handleDragMove(cardId, dx, dy),
    sortOrder: order.indexOf(cardId),
  });
  return (
    <div
      className={cn(
        "cdv2 min-h-dvh overflow-x-clip px-4 py-6 sm:px-8",
        outfit.variable,
        "font-[family-name:var(--font-cdv2-body)]",
      )}
    >
      <div className="mx-auto max-w-6xl">
        {/* ── Top bar ─────────────────────────────────────────────── */}
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Link
              href="/"
              title="Return to Landing Page"
              aria-label="Return to Landing Page"
              className="group flex h-8 w-8 items-center justify-center rounded-full border border-[var(--cdv2-line)] bg-[var(--cdv2-surface)] text-[var(--cdv2-ink-soft)] shadow-sm transition-all hover:border-[var(--cdv2-ink-soft)] hover:bg-[var(--cdv2-surface-soft)] hover:text-[var(--cdv2-ink)] active:scale-95"
            >
              <Home className="h-4 w-4 transition-transform group-hover:scale-110" />
            </Link>
            <Link
              href="/"
              title="Return to Landing Page"
              aria-label="Return to Landing Page"
              className="flex items-center transition-opacity hover:opacity-80"
            >
              <Image
                src="/cybrdeck-logo/cybrdeck_logo_cropped.png"
                alt="cybrdeck"
                width={886}
                height={197}
                priority
                className="h-6 w-auto sm:h-7"
              />
            </Link>
          </div>

          <nav
            className="cdv2-navtrack order-last flex w-full items-center gap-2 overflow-x-auto p-1 md:order-none md:w-auto md:gap-1 md:overflow-visible"
            aria-label="Community sections"
          >
            {NAV.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={active === item}
                onClick={() => applyFilter(item)}
                className={cn(
                  "shrink-0 rounded-full px-4 py-3 text-sm font-medium transition-colors md:py-2.5",
                  active === item
                    ? "cdv2-navpill-active text-[var(--cdv2-ink)]"
                    : "text-[var(--cdv2-ink-soft)] hover:text-[var(--cdv2-ink)]",
                )}
              >
                {item}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/community/messages"
              onPointerDown={stopDrag}
              className="rounded-full border border-[var(--cdv2-line)] bg-[var(--cdv2-surface)] px-3 py-1 text-xs font-medium text-[var(--cdv2-ink-soft)] transition-colors hover:text-[var(--cdv2-ink)]"
            >
              Messages
            </Link>
            <Link
              href="/community/members"
              onPointerDown={stopDrag}
              className="rounded-full border border-[var(--cdv2-line)] bg-[var(--cdv2-surface)] px-3 py-1 text-xs font-medium text-[var(--cdv2-ink-soft)] transition-colors hover:text-[var(--cdv2-ink)]"
            >
              Member directory
            </Link>
          </div>
        </header>

        {/* ── Bento grid ──────────────────────────────────────────── */}
        <main className="grid grid-flow-dense grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 auto-rows-[minmax(150px,auto)]">
          {/* Composer tile (opened by "Start a discussion") */}
          {composerOpen && (
            <DraggableCard
              label="New discussion"
              className="sm:col-span-2 sm:row-span-2"
              {...dragProps("New discussion")}
            >
              <DiscussionComposer
                publishing={publishing}
                onPublish={publishDiscussion}
                onClose={closeComposer}
              />
            </DraggableCard>
          )}

          {/* Hero intro */}
          <DraggableCard label="Community introduction" className="sm:col-span-2 sm:row-span-2" {...dragProps("Community introduction")}>
            <div className="flex h-full flex-col justify-between p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--cdv2-butter)] p-3">
                    <Image
                      src="/cybrdeck-logo/cybrdeck_icon_transparent.png"
                      alt="Cybrdeck"
                      width={32}
                      height={32}
                      className="h-8 w-8 object-contain filter brightness-0"
                    />
                  </div>
                  <MemberFlapBoard count={memberCount} />
                </div>
                <button
                  type="button"
                  onPointerDown={stopDrag}
                  onClick={openComposer}
                  className="flex items-center gap-1.5 rounded-full border border-[var(--cdv2-line)] bg-[var(--cdv2-surface)] px-3.5 py-2.5 text-sm font-medium transition-colors hover:bg-black/5"
                >
                  <Plus className="h-4 w-4" /> Start a discussion
                </button>
              </div>
              <MemberAvatarStack faces={memberFaces.slice(0, 4)} count={memberCount} signedIn={signedIn} />
              <div>
                <h1
                  className={cn(
                    "mb-3 text-3xl font-black leading-tight tracking-tight sm:text-4xl",
                    fraunces.variable,
                    "font-[family-name:var(--font-cdv2-display)]",
                  )}
                >
                  We&apos;re cybrdeck, a builder network from Singapore.
                </h1>
                <p className="max-w-md text-[15px] leading-relaxed text-[var(--cdv2-ink-soft)]">
                  We co-create AI products, share what we learn in the open, and share the
                  upside. Pull up a chair.
                </p>
              </div>
            </div>
          </DraggableCard>

          {/* Live pulse (mint) — expands to the hub's live rooms & channels */}
          <DraggableCard
            label="Live now"
            className={cn(roomsOpen && "sm:row-span-2")}
            {...dragProps("Live now")}
          >
            <div className="flex h-full flex-col p-5">
              <button
                type="button"
                onPointerDown={stopDrag}
                onClick={() => setRoomsOpen((v) => !v)}
                aria-expanded={roomsOpen}
                className="flex w-full flex-1 flex-col justify-between gap-4 text-left cursor-pointer"
              >
                <span className="flex items-start justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--cdv2-mint)] text-[var(--cdv2-ink)]">
                    <Radio className="h-4.5 w-4.5" />
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-[var(--cdv2-ink-soft)] transition-transform",
                      roomsOpen && "rotate-180",
                    )}
                  />
                </span>
                <span className="block">
                  <span className="block text-xs font-medium text-[var(--cdv2-ink-soft)]">
                    {signedIn
                      ? liveRooms.length > 0
                        ? `Live now · ${liveRooms.length} room${liveRooms.length === 1 ? "" : "s"} open`
                        : "Live now · no rooms open"
                      : "Live now · channels & rooms"}
                  </span>
                  <span
                    className={cn(
                      "mt-1 block text-xl font-bold",
                      fraunces.variable,
                      "font-[family-name:var(--cdv2-display)]",
                    )}
                  >
                    {signedIn
                      ? liveRooms.length > 0
                        ? (liveRooms[0].name ?? "A room is live")
                        : "Quiet right now"
                      : "See what's live"}
                  </span>
                </span>
              </button>

              {roomsOpen && (
                <div className="mt-4 flex flex-col gap-4 border-t border-[var(--cdv2-line)] pt-3 text-sm">
                  <div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--cdv2-ink-faint)]">
                      Rooms
                    </p>
                    {!signedIn ? (
                      <p className="text-xs font-medium text-[var(--cdv2-ink-soft)]">
                        <Link
                          href="/login?redirect=/community"
                          onPointerDown={stopDrag}
                          className="font-semibold text-[var(--cdv2-ink)] underline underline-offset-2"
                        >
                          Sign in
                        </Link>{" "}
                        to see live rooms.
                      </p>
                    ) : liveRooms.length === 0 ? (
                      <Link
                        href="/community/rooms"
                        onPointerDown={stopDrag}
                        className="font-semibold underline underline-offset-2"
                      >
                        No rooms live — start one in the hub
                      </Link>
                    ) : (
                      <ul className="space-y-1.5">
                        {liveRooms.map((r) => (
                          <li key={r.id}>
                            <Link
                              href={`/community/rooms/${r.id}`}
                              onPointerDown={stopDrag}
                              className="flex items-center justify-between gap-2 font-medium hover:underline"
                            >
                              <span className="flex min-w-0 items-center gap-1.5">
                                <Video className="h-3.5 w-3.5 shrink-0 text-[var(--cdv2-ink-soft)]" />
                                <span className="truncate">{r.name ?? "Untitled room"}</span>
                              </span>
                              <span className="shrink-0 text-xs text-[var(--cdv2-ink-soft)]">
                                {r.participantCount ?? 0} in
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--cdv2-ink-faint)]">
                      Channels
                    </p>
                    <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
                      {CHANNELS.map((c) => (
                        <li key={c.id}>
                          <Link
                            href={`/community/channels/${c.id}`}
                            onPointerDown={stopDrag}
                            className="flex items-center gap-1 font-medium text-[var(--cdv2-ink-soft)] hover:text-[var(--cdv2-ink)]"
                          >
                            <Hash className="h-3 w-3" />
                            {c.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </DraggableCard>

          {/* X / social (sky) — live feed from the brand's X presence */}
          <DraggableCard label="Follow on X" {...dragProps("Follow on X")}>
            <div className="flex h-full flex-col bg-[var(--cdv2-sky)] p-5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <a
                  href={`https://x.com/${xHandle}`}
                  target="_blank"
                  rel="noreferrer"
                  onPointerDown={stopDrag}
                  className="flex min-h-11 items-center gap-2 text-sm font-bold underline-offset-4 hover:underline"
                >
                  <span aria-hidden className="text-base font-black">𝕏</span>
                  @{xHandle}
                </a>
                <a
                  href={`https://x.com/${xHandle}`}
                  target="_blank"
                  rel="noreferrer"
                  onPointerDown={stopDrag}
                  aria-label="Open the cybrdeck X profile"
                  className="rounded-full transition-opacity hover:opacity-75 focus-visible:outline-2 focus-visible:outline-[var(--cdv2-ink)]"
                >
                  <Arrow />
                </a>
              </div>
              {xState === "ready" && xEntries.length > 0 ? (
                <div className="flex flex-1 flex-col divide-y divide-[var(--cdv2-line)]">
                  {xEntries.map((p) => (
                    <a
                      key={p.id}
                      href={`https://x.com/${p.authorHandle || xHandle}/status/${p.id}`}
                      target="_blank"
                      rel="noreferrer"
                      onPointerDown={stopDrag}
                      className="-mx-2 flex flex-1 flex-col justify-center rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-black/10 active:bg-black/15 focus-visible:bg-black/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--cdv2-ink)] first:pt-1 last:pb-0"
                    >
                      <p className="line-clamp-2 text-sm font-medium leading-snug">
                        {cleanPostText(p.text)}
                      </p>
                      <p className="mt-1 text-xs font-medium text-[var(--cdv2-ink)] opacity-60">
                        @{p.authorHandle || xHandle}
                        {agoLabel(p.postedAt, now) ? ` · ${agoLabel(p.postedAt, now)}` : ""}
                      </p>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="flex flex-1 items-center text-sm leading-relaxed text-[var(--cdv2-ink)] opacity-70">
                  {xState === "loading"
                    ? "Reading the X feed…"
                    : xState === "error"
                      ? "Couldn't reach X right now."
                      : "The feed is quiet right now."}
                </p>
              )}
            </div>
          </DraggableCard>

          {/* Featured build (blush, tall) — data-driven from the
              community_showcase collection; links into the hub detail page. */}
          <DraggableCard label="Featured build" className="sm:row-span-2" {...dragProps("Featured build")}>
            {featuredBuild ? (
              <div className="relative h-full overflow-hidden bg-[var(--cdv2-blush)] p-5">
                <div className="absolute -right-8 top-10 h-40 w-28 rotate-12 rounded-2xl bg-[var(--cdv2-surface)] shadow-lg" />
                <div className="absolute right-4 top-4 z-10 flex items-center gap-2.5 text-[11px] font-semibold text-[var(--cdv2-ink)]">
                  <span className="inline-flex items-center gap-1" title={`${featuredBuild.stars ?? 0} stars`}>
                    <Star className="h-3.5 w-3.5" fill="currentColor" />
                    {featuredBuild.stars ?? 0}
                  </span>
                  <span className="inline-flex items-center gap-1 opacity-70" title={`${featuredBuild.visits ?? 0} views`}>
                    <Eye className="h-3.5 w-3.5" />
                    {featuredBuild.visits ?? 0}
                  </span>
                </div>
                <div className="relative flex h-full flex-col justify-end pb-12">
                  <Link
                    href={`/community/showcase/${featuredBuild.id}`}
                    onPointerDown={stopDrag}
                    className="block"
                  >
                    <p className="text-xs font-medium text-[var(--cdv2-ink)]">Featured build</p>
                    <p className={cn("mt-1 text-xl font-bold leading-snug", fraunces.variable, "font-[family-name:var(--font-cdv2-display)]")}>
                      {featuredBuild.title ?? "A Cybrdeck build"}
                    </p>
                    {featuredBuild.tagline && (
                      <p className="mt-1 text-sm text-[var(--cdv2-ink-soft)]">{featuredBuild.tagline}</p>
                    )}
                  </Link>
                </div>
                <Link
                  href={`/community/showcase/${featuredBuild.id}`}
                  onPointerDown={stopDrag}
                  aria-label={`Open the ${featuredBuild.title ?? "featured"} case study`}
                  className="absolute bottom-4 left-4 rounded-full transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-[var(--cdv2-ink)]"
                >
                  <Arrow />
                </Link>
              </div>
            ) : (
              <div className="relative flex h-full flex-col justify-end overflow-hidden bg-[var(--cdv2-blush)] p-5">
                <div className="absolute -right-8 top-10 h-40 w-28 rotate-12 rounded-2xl bg-[var(--cdv2-surface)] shadow-lg" />
                <p className="relative text-xs font-medium text-[var(--cdv2-ink)]">Featured build</p>
                <p className={cn("relative mt-1 text-xl font-bold leading-snug", fraunces.variable, "font-[family-name:var(--font-cdv2-display)]")}>
                  See what the network is building
                </p>
              </div>
            )}
          </DraggableCard>

          {/* Event card: live from Luma — happening-now while inside the
              stated duration, otherwise the soonest upcoming event */}
          <DraggableCard
            label="Next event"
            className="sm:row-span-2"
            {...dragProps("Next event")}
            onDragMove={(dx, dy) => {
              eventDragAt.current = Date.now();
              handleDragMove("Next event", dx, dy);
            }}
          >
            {shownEvent ? (
              <div
                key={shownEvent.id}
                className="cdv2-event-swap relative flex h-full flex-col"
                onPointerEnter={() => setEventPaused(true)}
                onPointerLeave={() => setEventPaused(false)}
              >
                <div className="relative h-36 shrink-0">
                  {shownEvent.hasCover ? (
                    <Image
                      src={shownEvent.image}
                      alt={`Poster for ${shownEvent.title}`}
                      fill
                      className="object-cover"
                      sizes="(min-width: 64rem) 25vw, (min-width: 40rem) 50vw, 100vw"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[var(--cdv2-butter)]">
                      <span aria-hidden className="text-2xl font-black text-[var(--cdv2-ink)]">♠</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col justify-between gap-3 p-5">
                  <div>
                    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-medium text-[var(--cdv2-ink-soft)]">
                      {liveEvent && (
                        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cdv2-mint)]" />
                      )}
                      {liveEvent ? "Happening now" : "Next event"}
                      <span className="text-[var(--cdv2-ink-faint)]">
                        {liveEvent
                          ? `· until ${eventFormatter(shownEvent.timeZone, "time").format(new Date(shownEvent.endAt as string))}`
                          : `· ${eventFormatter(shownEvent.timeZone, "day").format(new Date(shownEvent.startAt as string))}, ${eventFormatter(shownEvent.timeZone, "time").format(new Date(shownEvent.startAt as string))}`}
                      </span>
                      {!liveEvent && upcomingEvents.length > 1 && (
                        <span
                          className="ml-auto flex items-center gap-1"
                          aria-label={`${upcomingEvents.length} upcoming events, auto-rotating`}
                        >
                          {upcomingEvents.map((e, i) => (
                            <button
                              key={e.id}
                              type="button"
                              aria-label={`Show event ${i + 1}: ${e.title}`}
                              onPointerDown={stopDrag}
                              onClick={() => setEventIdx(i)}
                              className={cn(
                                "relative z-10 h-2 rounded-full transition-all",
                                i === eventIdx % upcomingEvents.length
                                  ? "w-4 bg-[var(--cdv2-ink)]"
                                  : "w-2 bg-[var(--cdv2-ink-faint)] hover:bg-[var(--cdv2-ink-soft)]",
                              )}
                            />
                          ))}
                        </span>
                      )}
                    </p>
                    <a
                      href={shownEvent.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => {
                        if (Date.now() - eventDragAt.current < 500) e.preventDefault();
                      }}
                      aria-label={`${shownEvent.title} — open event page in a new tab`}
                      className={cn(
                        "mt-1 block text-lg font-bold leading-snug after:absolute after:inset-0",
                        fraunces.variable,
                        "font-[family-name:var(--font-cdv2-display)]",
                      )}
                    >
                      {shownEvent.title}
                    </a>
                    {shownGoing != null && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--cdv2-ink-soft)]">
                        <Users aria-hidden className="h-3.5 w-3.5 shrink-0" />
                        {shownGoing}
                      </p>
                    )}
                    {shownBlurb && (
                      <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-[var(--cdv2-ink-soft)]">
                        {shownBlurb}
                      </p>
                    )}
                  </div>
                  {shownVirtual ? (
                    <a
                      href={shownEvent.url}
                      target="_blank"
                      rel="noreferrer"
                      onPointerDown={stopDrag}
                      className="relative z-10 inline-flex min-h-11 items-center gap-1.5 self-start rounded-full bg-[var(--cdv2-lilac)] px-3.5 py-2 text-sm font-semibold text-[var(--cdv2-ink)]"
                    >
                      <ArrowUpRight className="h-4 w-4 shrink-0" />
                      Virtual event · Luma page
                    </a>
                  ) : (
                    <a
                      href={mapsWebUrl(shownEvent.location)}
                      target="_blank"
                      rel="noreferrer"
                      onPointerDown={stopDrag}
                      onClick={(e) => openInMaps(e, shownEvent.location)}
                      className="relative z-10 inline-flex min-h-11 items-center gap-1.5 self-start rounded-full bg-[var(--cdv2-lilac)] px-3.5 py-2 text-sm font-semibold text-[var(--cdv2-ink)]"
                    >
                      <MapPin className="h-4 w-4 shrink-0" />
                      {shownPlaceShort}
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col justify-between p-5">
                <p className="text-xs font-medium text-[var(--cdv2-ink-soft)]">Events</p>
                <p className="text-sm leading-relaxed text-[var(--cdv2-ink-soft)]">
                  {eventsState === "loading"
                    ? "Syncing the Luma calendar…"
                    : eventsState === "error"
                      ? "Couldn't reach the Luma calendar."
                      : "No upcoming events at the moment."}
                </p>
              </div>
            )}
          </DraggableCard>

          {/* Discussion of the week */}
          <DraggableCard label="Discussion of the week" className="sm:col-span-2" {...dragProps("Discussion of the week")}>
            <div className="flex h-full flex-col justify-between p-6">
              <div>
                <h2 className={cn("text-2xl font-black tracking-tight", fraunces.variable, "font-[family-name:var(--font-cdv2-display)]")}>
                  How we cut eval time in half
                </h2>
                <p className="mt-2 line-clamp-2 max-w-lg text-sm leading-relaxed text-[var(--cdv2-ink-soft)]">
                  A short write-up of the retrieval eval loop we use before shipping any RAG
                  change, and where the time actually went.
                </p>
              </div>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onPointerDown={stopDrag}
                  className="flex items-center gap-1.5 rounded-full border border-[var(--cdv2-line)] bg-[var(--cdv2-surface)] px-3.5 py-2.5 text-sm font-medium"
                >
                  Read more <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs font-medium text-[var(--cdv2-ink-faint)]">Aug 18</span>
              </div>
            </div>
          </DraggableCard>

          {/* Feed */}
          <DraggableCard label="Recent discussions" className="sm:col-span-2 sm:row-span-2" {...dragProps("Recent discussions")}>
            <div className="flex h-full flex-col p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className={cn("text-xl font-black tracking-tight", fraunces.variable, "font-[family-name:var(--font-cdv2-display)]")}>
                  Recent discussions
                </h2>
                <MessageSquare className="h-4 w-4 text-[var(--cdv2-ink-soft)]" />
              </div>
              <div className="flex flex-1 flex-col divide-y divide-[var(--cdv2-line)]">
                {!signedIn ? (
                  <p className="py-3 text-sm leading-relaxed text-[var(--cdv2-ink-soft)]">
                    <Link
                      href="/login?redirect=/community"
                      className="font-semibold underline underline-offset-4"
                    >
                      Sign in
                    </Link>{" "}
                    to read what members are discussing.
                  </p>
                ) : postsState === "loading" ? (
                  <p className="py-3 text-sm text-[var(--cdv2-ink-soft)]">Loading discussions…</p>
                ) : posts.length === 0 ? (
                  <p className="py-3 text-sm leading-relaxed text-[var(--cdv2-ink-soft)]">
                    Quiet so far — start the first discussion from the intro tile.
                  </p>
                ) : (
                  posts.slice(0, 4).map((post) => (
                    <FeedPostRow
                      key={post.id}
                      post={post}
                      firestore={firestore}
                      me={me}
                      nowMs={now}
                    />
                  ))
                )}
              </div>
            </div>
          </DraggableCard>

          {/* Game leaderboard (butter, tall) */}
          <DraggableCard label="Game leaderboard" className="sm:row-span-2" {...dragProps("Game leaderboard")}>
            <div className="flex h-full flex-col bg-[var(--cdv2-butter)] p-5">
              <div className="mb-3 flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                <h2 className={cn("text-lg font-black tracking-tight", fraunces.variable, "font-[family-name:var(--font-cdv2-display)]")}>
                  Leaderboard
                </h2>
              </div>
              <div className="flex flex-1 flex-col justify-between">
                {!signedIn ? (
                  <p className="text-sm leading-relaxed text-[var(--cdv2-ink-soft)]">
                    <Link
                      href="/login?redirect=/community"
                      onPointerDown={stopDrag}
                      className="font-semibold text-[var(--cdv2-ink)] underline underline-offset-2"
                    >
                      Sign in
                    </Link>{" "}
                    to see the live board.
                  </p>
                ) : gameScores == null ? (
                  <p className="text-sm font-medium text-[var(--cdv2-ink-soft)]">Syncing the board…</p>
                ) : gameScores.length === 0 ? (
                  <p className="text-sm leading-relaxed text-[var(--cdv2-ink-soft)]">
                    No scores posted yet — play a game to claim 1st.
                  </p>
                ) : (
                  gameScores.map((row, i) => (
                    <div key={row.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2 font-medium">
                        <span className="w-4 shrink-0 text-xs font-bold">{i + 1}</span>
                        <span className="truncate">{row.userName}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs font-bold">
                        {row.gameId === "speed-type" ? (
                          <Keyboard aria-hidden className="h-3.5 w-3.5" />
                        ) : (
                          <Brain aria-hidden className="h-3.5 w-3.5" />
                        )}
                        {row.score}
                        {row.gameId === "speed-type" ? " WPM" : " pts"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </DraggableCard>

          {/* Game arcade — the hub's mini-games, opened like mini-apps */}
          <DraggableCard label="Game arcade" className="sm:row-span-2" {...dragProps("Game arcade")}>
            <div className="flex h-full flex-col p-5">
              <div className="mb-3 flex items-center gap-2">
                <Gamepad2 className="h-4 w-4" />
                <h2 className={cn("text-lg font-black tracking-tight", fraunces.variable, "font-[family-name:var(--font-cdv2-display)]")}>
                  Arcade
                </h2>
              </div>
              <div className="flex flex-1 flex-col justify-between gap-2">
                {GAMES.map((g) => {
                  const Icon = g.icon;
                  return g.soon ? (
                    <div
                      key={g.id}
                      className="flex items-center justify-between rounded-xl border border-[var(--cdv2-line)] px-3.5 py-2.5 opacity-50"
                    >
                      <span className="flex items-center gap-2.5 text-sm font-medium">
                        <Icon aria-hidden className="h-4 w-4 shrink-0" />
                        {g.title}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--cdv2-ink-faint)]">
                        Soon
                      </span>
                    </div>
                  ) : (
                    <Link
                      key={g.id}
                      href={`/community/games/${g.id}`}
                      onPointerDown={stopDrag}
                      className="flex items-center justify-between rounded-xl border border-[var(--cdv2-line)] bg-[var(--cdv2-surface)] px-3.5 py-2.5 text-sm font-medium transition-colors hover:border-[var(--cdv2-ink-faint)]"
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon aria-hidden className="h-4 w-4 shrink-0" />
                        {g.title}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--cdv2-ink-faint)]">
                          {g.cadence}
                        </span>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </DraggableCard>

          {/* Members — real directory teaser: actual faces, actual count,
              no invented presence. */}
          <DraggableCard label="Members" {...dragProps("Members")}>
            <div className="flex h-full flex-col justify-between p-5">
              <div className="flex -space-x-2">
                {signedIn
                  ? memberFaces.slice(0, 6).map((m, i) => (
                      <span
                        key={m.uid}
                        title={m.name}
                        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--cdv2-surface)] text-xs font-bold text-[var(--cdv2-ink)]"
                        style={{ backgroundColor: AVATAR_TINTS[i % AVATAR_TINTS.length] }}
                      >
                        {m.photoURL ? (
                          <img src={m.photoURL} alt="" className="h-full w-full object-cover" />
                        ) : (
                          m.name.charAt(0).toUpperCase()
                        )}
                      </span>
                    ))
                  : Array.from({ length: 4 }, (_, i) => (
                      <span
                        key={i}
                        aria-hidden
                        className="h-8 w-8 rounded-full border-2 border-dashed border-[var(--cdv2-line)] bg-[var(--cdv2-surface-2)]"
                      />
                    ))}
                {signedIn && memberCount != null && memberCount > 6 && (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--cdv2-surface)] bg-[var(--cdv2-surface-2)] text-[10px] font-bold text-[var(--cdv2-ink-soft)]">
                    +{memberCount - 6}
                  </span>
                )}
              </div>
              <div>
                <p
                  className={cn(
                    "text-xl font-bold",
                    fraunces.variable,
                    "font-[family-name:var(--font-cdv2-display)]",
                  )}
                >
                  {signedIn
                    ? memberCount != null
                      ? `${memberCount} member${memberCount === 1 ? "" : "s"}`
                      : "Members"
                    : "Meet the members"}
                </p>
                {signedIn ? (
                  <Link
                    href="/community/members"
                    onPointerDown={stopDrag}
                    className="text-xs font-semibold underline underline-offset-2"
                  >
                    Browse the directory
                  </Link>
                ) : (
                  <Link
                    href="/login?redirect=/community"
                    onPointerDown={stopDrag}
                    className="text-xs font-semibold underline underline-offset-2"
                  >
                    Sign in to see who's here
                  </Link>
                )}
              </div>
            </div>
          </DraggableCard>

          {/* Top contributors — live scoring from the real feed */}
          <DraggableCard label="Top contributors" {...dragProps("Top contributors")}>
            <div className="flex h-full flex-col justify-between gap-2 p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-[var(--cdv2-ink-soft)]" />
                  <span className="text-sm font-bold">Contributors</span>
                </span>
                <span className="flex rounded-full border border-[var(--cdv2-line)] p-0.5">
                  {(["week", "alltime"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onPointerDown={stopDrag}
                      onClick={() => setContribPeriod(p)}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors",
                        contribPeriod === p
                          ? "bg-[var(--cdv2-ink)] text-[var(--cdv2-surface)]"
                          : "text-[var(--cdv2-ink-soft)] hover:text-[var(--cdv2-ink)]",
                      )}
                    >
                      {p === "week" ? "Week" : "All"}
                    </button>
                  ))}
                </span>
              </div>
              {!signedIn ? (
                <p className="text-xs font-medium leading-relaxed text-[var(--cdv2-ink-soft)]">
                  <Link
                    href="/login?redirect=/community"
                    onPointerDown={stopDrag}
                    className="font-semibold text-[var(--cdv2-ink)] underline underline-offset-2"
                  >
                    Sign in
                  </Link>{" "}
                  to see who's building.
                </p>
              ) : postsState === "loading" ? (
                <p className="text-xs font-medium text-[var(--cdv2-ink-soft)]">
                  Counting contributions…
                </p>
              ) : (
                <ul className="space-y-1">
                  {topContributors.map((c, i) => (
                    <li
                      key={`${c.name}-${i}`}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 font-medium">
                        <span className="w-3.5 shrink-0 text-xs font-bold text-[var(--cdv2-ink-faint)]">
                          {i + 1}
                        </span>
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span className="shrink-0 text-xs font-bold">{c.points} pts</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </DraggableCard>

          {/* Member-added platform cards (Spotify, Apple Music, …) */}
          {personalCards.map((c) => (
            <DraggableCard
              key={c.id}
              label={c.title}
              className={c.tall ? "sm:row-span-2" : undefined}
              {...dragProps(c.id)}
            >
              <div className="flex h-full flex-col p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[var(--cdv2-ink-soft)]">
                    {c.platform}
                  </span>
                  <button
                    type="button"
                    onPointerDown={stopDrag}
                    onClick={() => removePersonalCard(c.id)}
                    aria-label={`Remove ${c.title} card`}
                    className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-[var(--cdv2-ink-soft)] transition-colors hover:text-[var(--cdv2-ink)]"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>
                {/* stopDrag: taps inside the player (play, seek) must not
                    lift the card; the header strip stays draggable. */}
                {c.connection ? (
                  <LiveConnectionCard
                    platformId={c.connection}
                    platformLabel={c.platform}
                    authedFetch={authedFetch}
                    nowMs={now}
                    onReconnect={() => startConnect(c.connection as string)}
                  />
                ) : (
                  <iframe
                    src={c.embedSrc}
                    title={c.title}
                    loading="lazy"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    onPointerDown={stopDrag}
                    className="w-full flex-1 rounded-2xl border-0"
                    style={{ minHeight: c.tall ? 260 : 152 }}
                  />
                )}
              </div>
            </DraggableCard>
          ))}

          {/* Add-your-card composer */}
          <div className="flex min-h-[150px] flex-col justify-center rounded-[var(--cdv2-radius)] border border-dashed border-[var(--cdv2-line)] p-5">
            {composing ? (
              <form onSubmit={addPersonalCard} className="flex flex-col gap-3">
                <label htmlFor="cdv2-link" className="text-sm font-semibold">
                  Add your card
                </label>
                {connectNotice && (
                  <p
                    role="status"
                    className="rounded-2xl border border-[var(--cdv2-line)] bg-[var(--cdv2-surface)] px-4 py-2.5 text-xs font-medium text-[var(--cdv2-ink)]"
                  >
                    {connectNotice}
                  </p>
                )}
                <input
                  id="cdv2-link"
                  type="text"
                  inputMode="url"
                  autoFocus
                  placeholder="Paste a Spotify, Apple Music, Instagram, Facebook or YouTube link"
                  value={linkDraft}
                  onChange={(e) => setLinkDraft(e.target.value)}
                  className="w-full rounded-full border border-[var(--cdv2-line)] bg-[var(--cdv2-surface)] px-4 py-2.5 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cdv2-ink-soft)]"
                />
                <p className="text-xs font-medium text-[var(--cdv2-ink-soft)]" aria-live="polite">
                  {linkDraft.trim() === ""
                    ? "Gmail stays private — public cards support the five platforms above."
                    : detected
                      ? `Detected: ${detected.title}`
                      : "That link isn't from a supported platform yet."}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={!detected}
                    className="rounded-full bg-[var(--cdv2-ink)] px-4 py-2.5 text-sm font-semibold text-[var(--cdv2-surface)] transition-opacity disabled:opacity-40"
                  >
                    Add card
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setComposing(false);
                      setLinkDraft("");
                    }}
                    className="rounded-full px-4 py-2.5 text-sm font-medium text-[var(--cdv2-ink-soft)] hover:text-[var(--cdv2-ink)]"
                  >
                    Cancel
                  </button>
                </div>

                {/* Platform connections: real OAuth account-connects. */}
                <div className="mt-1 border-t border-[var(--cdv2-line)] pt-4">
                  <p className="text-sm font-semibold">Connect a platform</p>
                  {!signedIn ? (
                    <p className="mt-1.5 text-xs font-medium text-[var(--cdv2-ink-soft)]">
                      <Link
                        href="/login?redirect=/community"
                        onPointerDown={stopDrag}
                        className="font-semibold text-[var(--cdv2-ink)] underline underline-offset-2"
                      >
                        Sign in
                      </Link>{" "}
                      to connect your own accounts — a connected Spotify card shows what you're
                      actually playing, live from your account.
                    </p>
                  ) : connError ? (
                    <p className="mt-1.5 text-xs font-medium text-[var(--cdv2-ink-soft)]">
                      Couldn't load your connections right now.
                    </p>
                  ) : (
                    <ul className="mt-2 flex flex-col gap-2">
                      {connPlatforms.map((p) => {
                        const conn = connFor(p.id);
                        return (
                          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0 flex-1 basis-48">
                              <p className="text-sm font-medium text-[var(--cdv2-ink)]">
                                {p.label}
                                {conn
                                  ? ` — connected${conn.externalHandle ? ` as ${conn.externalHandle}` : ""}`
                                  : ""}
                              </p>
                              <p className="text-xs font-medium text-[var(--cdv2-ink-soft)]">
                                {p.ready ? p.tagline : p.blockedReason}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {conn && p.ready ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => addLiveCard(p.id, p.label)}
                                    className="rounded-full bg-[var(--cdv2-ink)] px-4 py-2.5 text-sm font-semibold text-[var(--cdv2-surface)] transition-opacity hover:opacity-85"
                                  >
                                    Add live card
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => disconnectPlatform(p.id)}
                                    className="rounded-full px-3 py-2.5 text-sm font-medium text-[var(--cdv2-ink-soft)] transition-colors hover:text-[var(--cdv2-ink)]"
                                  >
                                    Disconnect
                                  </button>
                                </>
                              ) : p.ready ? (
                                <button
                                  type="button"
                                  onClick={() => startConnect(p.id)}
                                  className="rounded-full bg-[var(--cdv2-ink)] px-4 py-2.5 text-sm font-semibold text-[var(--cdv2-surface)] transition-opacity hover:opacity-85"
                                >
                                  Connect
                                </button>
                              ) : (
                                <span className="rounded-full border border-[var(--cdv2-line)] px-3 py-1.5 text-xs font-medium text-[var(--cdv2-ink-soft)]">
                                  Not available yet
                                </span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setComposing(true)}
                className="flex min-h-11 items-center gap-1.5 text-sm font-medium text-[var(--cdv2-ink-soft)] transition-colors hover:text-[var(--cdv2-ink)]"
              >
                <Plus className="h-4 w-4" /> Add your card
              </button>
            )}
          </div>
        </main>

        <footer className="mt-8 flex items-center justify-between text-xs font-medium text-[var(--cdv2-ink-faint)]">
          <span>© {new Date().getFullYear()} cybrdeck · Built in Singapore</span>
          <Link href="/" onPointerDown={stopDrag} className="hover:text-[var(--cdv2-ink)]">
            Back Home
          </Link>
        </footer>
      </div>
    </div>
  );
}
