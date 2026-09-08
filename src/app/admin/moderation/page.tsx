"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Icon } from '@/components/ui/icon';
import { useUser, useFirestore, useDoc } from "@/firebase";
import { Sparkles } from "lucide-react";
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, deleteDoc, getDocs, where, startAfter } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

interface TelemetryLog {
  id: string;
  inputCaption: string;
  mediaUrl?: string;
  isAdult: boolean;
  isViolence: boolean;
  isRacy: boolean;
  isToxicText: boolean;
  textEvaluationDetails?: string;
  slangClassification?: string;
  finalStatus: string;
  flaggedReason?: string;
  trained: boolean;
  createdAt: string;
}

interface QuarantinedPost {
  id: string;
  authorId?: string;
  authorName: string;
  authorEmail: string;
  content: string;
  mediaUrl?: string;
  tags: string[];
  safeSearchStatus: string;
  createdAt: string;
}

export default function ModerationConsole() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [logs, setLogs] = useState<TelemetryLog[]>([]);
  const [quarantined, setQuarantined] = useState<QuarantinedPost[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [training, setTraining] = useState(false);
  const [trainingSummary, setTrainingSummary] = useState<string | null>(null);

  // New Tabbed Interface and User Suspension States
  const [activeTab, setActiveTab] = useState<"ai_safety" | "accounts">("ai_safety");
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMoreUsers, setLoadingMoreUsers] = useState(false);
  const [lastVisibleUser, setLastVisibleUser] = useState<any | null>(null);
  const [hasMoreUsers, setHasMoreUsers] = useState(true);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const USERS_PAGE_SIZE = 30;

  const [suspensionModalUser, setSuspensionModalUser] = useState<any | null>(null);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  // Inline rejection-reason capture for One's quarantined drafts. A bare
  // Purge throws the reason away; the next draft reads it back.
  const [rejectingOneId, setRejectingOneId] = useState<string | null>(null);
  const [oneReasonText, setOneReasonText] = useState("");
  const [selectedDuration, setSelectedDuration] = useState<string>("24h");
  const [otherReasonText, setOtherReasonText] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [suspendingUser, setSuspendingUser] = useState(false);

  const SUSPENSION_REASONS = [
    "Rudeness / Harassment",
    "Sexual / Nude Content",
    "Cyber-bullying / Abuse",
    "Spam",
    "Malicious Intent detected",
    "Fraudulent Activity",
    "Others (State Reason below)"
  ];

  // 1. Verify Permissions (Admin Claims or users/uid portalRole == 'Cybrdeck' / 'Admin')
  const adminDocRef = useMemo(() => {
    if (!firestore || !user?.email) return null;
    // Convention: admin doc IDs are lowercase, but check both cases so a legacy
    // mixed-case doc doesn't silently break admin access.
    return doc(firestore, "admins", user.email.toLowerCase());
  }, [firestore, user?.email]);

  // Secondary lookup for the original-case variant (fallback for legacy docs).
  const adminDocRefRaw = useMemo(() => {
    if (!firestore || !user?.email) return null;
    const lower = user.email.toLowerCase();
    return user.email !== lower
      ? doc(firestore, "admins", user.email)
      : null;
  }, [firestore, user?.email]);

  const { data: adminDoc, loading: loadingAdmin } = useDoc(adminDocRef);
  const { data: adminDocRaw, loading: loadingAdminRaw } = useDoc(adminDocRefRaw);
  const adminData = (adminDoc as { role?: string; uiAccess?: boolean } | null)
    ?? (adminDocRaw as { role?: string; uiAccess?: boolean } | null);
  const isAdmin = adminData?.role === "admin" && adminData?.uiAccess === true;
  const loadingAdminCombined = loadingAdmin || (adminDocRefRaw ? loadingAdminRaw : false);

  const userDocRef = useMemo(() => {
    if (!firestore || !user?.uid) return null;
    return doc(firestore, "users", user.uid);
  }, [firestore, user?.uid]);
  const { data: userDoc, loading: loadingUser } = useDoc(userDocRef);
  const userData = userDoc as { portalRole?: string } | null;
  const isCore = userData?.portalRole === "Cybrdeck";
  const isCoreOrAdmin = isAdmin || isCore || userData?.portalRole === "Admin";

  const handleToggleReason = (reason: string) => {
    setSelectedReasons(prev =>
      prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason]
    );
  };

  const handleApplySuspension = async () => {
    if (!user || !suspensionModalUser) return;
    if (selectedReasons.length === 0) {
      toast({ title: "Reason Required", description: "Please select at least one reason.", variant: "destructive" });
      return;
    }
    if (selectedReasons.includes("Others (State Reason below)") && !otherReasonText.trim()) {
      toast({ title: "Details Required", description: "Please state the reason in the text box below.", variant: "destructive" });
      return;
    }

    setSuspendingUser(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/moderation/suspend-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({
          userId: suspensionModalUser.id,
          duration: selectedDuration,
          reasons: selectedReasons,
          customReason: selectedReasons.includes("Others (State Reason below)") ? otherReasonText.trim() : null
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        toast({
          title: selectedDuration === "indefinite" ? "Clearance Terminated" : "Suspension Active",
          description: data.message
        });
        setSuspensionModalUser(null);
        setSelectedReasons([]);
        setSelectedDuration("24h");
        setOtherReasonText("");
        setConfirmText("");
      } else {
        throw new Error(data.error || "Execution failed");
      }
    } catch (err: any) {
      toast({
        title: "Action Aborted",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setSuspendingUser(false);
    }
  };

  // 2. Real-time sub for moderation telemetry logs
  useEffect(() => {
    if (!firestore || !isCoreOrAdmin) return;
    setLoadingLogs(true);

    const q = query(
      collection(firestore, "community_moderation_telemetry"),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: TelemetryLog[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as TelemetryLog);
      });
      setLogs(list);
      setLoadingLogs(false);
    }, (err) => {
      console.error("Telemetry snapshot failed:", err);
      setLoadingLogs(false);
    });

    return () => unsubscribe();
  }, [firestore, isCoreOrAdmin]);

  // 3. Real-time sub for quarantined posts
  useEffect(() => {
    if (!firestore || !isCoreOrAdmin) return;

    const q = query(
      collection(firestore, "community_posts"),
      where("safeSearchStatus", "in", ["pending_review", "flagged"]),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: QuarantinedPost[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as QuarantinedPost);
      });
      setQuarantined(list);
    }, (err) => {
      console.error("Quarantined snapshot failed:", err);
    });

    return () => unsubscribe();
  }, [firestore, isCoreOrAdmin]);

  // 3.5. Paginated snapshot for users list
  // First page: real-time listener so new users appear live.
  // Subsequent pages: explicit fetch-on-demand so we don't subscribe to unbounded updates.
  const loadUsersPage = async (cursor: any | null, append: boolean) => {
    if (!firestore) return;
    if (cursor === null) {
      setLoadingUsers(true);
      setUsersList([]);
    } else {
      setLoadingMoreUsers(true);
    }

    try {
      const q = cursor === null
        ? query(collection(firestore, "users"), orderBy("createdAt", "desc"), limit(USERS_PAGE_SIZE))
        : query(collection(firestore, "users"), orderBy("createdAt", "desc"), startAfter(cursor), limit(USERS_PAGE_SIZE));

      const snapshot = await getDocs(q);
      const page: any[] = [];
      snapshot.forEach((doc) => {
        page.push({ id: doc.id, ...doc.data() });
      });

      const last = snapshot.docs[snapshot.docs.length - 1] ?? null;
      setLastVisibleUser(last);
      setHasMoreUsers(page.length === USERS_PAGE_SIZE);

      if (append) {
        setUsersList(prev => [...prev, ...page]);
      } else {
        setUsersList(page);
      }
    } catch (err) {
      console.error("Users list fetch failed:", err);
    } finally {
      setLoadingUsers(false);
      setLoadingMoreUsers(false);
    }
  };

  useEffect(() => {
    if (!firestore || !isCoreOrAdmin) return;
    loadUsersPage(null, false);

    const q = query(collection(firestore, "users"), orderBy("createdAt", "desc"), limit(1));
    const unsubscribe = onSnapshot(q, () => {
      // Re-fetch page 1 when anything changes so the live view stays fresh
      loadUsersPage(null, false);
    });

    return () => unsubscribe();
  }, [firestore, isCoreOrAdmin]);

  // A post One wrote is not an ordinary quarantined post: it is the
  // subject of an open approval that also owes the team a Telegram
  // message. Deciding it with a direct `updateDoc` would publish it and
  // silently skip the announcement, leaving the two surfaces disagreeing
  // about what happened. Route it through the same transaction the
  // Telegram card uses instead.
  const decideOnePost = async (
    post: QuarantinedPost,
    decision: "approved" | "rejected",
    reason?: string,
  ): Promise<boolean> => {
    if (!user) return false;
    const token = await user.getIdToken();
    const res = await fetch("/api/one/publish", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "decide", postId: post.id, decision, ...(reason ? { reason } : {}) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast({
        title: decision === "approved" ? "Approve Failed" : "Reject Failed",
        // A 409 here is the expected race: someone tapped the Telegram
        // card first. The message says so.
        description: body?.message || body?.error || `Request returned ${res.status}.`,
        variant: "destructive",
      });
      return false;
    }
    toast({
      title: decision === "approved" ? "Published" : "Rejected",
      description: body?.detail || "Decision recorded.",
    });
    return true;
  };

  const isOnePost = (post: QuarantinedPost) => post.authorId === "persona-one";

  // 4. Release Post from quarantine
  const handleReleasePost = async (post: QuarantinedPost) => {
    if (!firestore) return;
    if (isOnePost(post)) {
      await decideOnePost(post, "approved");
      return;
    }
    try {
      const postRef = doc(firestore, "community_posts", post.id);
      await updateDoc(postRef, {
        safeSearchStatus: "approved"
      });

      // Update corresponding telemetry status if exists — join by postId, not caption.
      // Joining by caption would match the wrong telemetry doc when two posts share text.
      const telQuery = query(
        collection(firestore, "community_moderation_telemetry"),
        where("postId", "==", post.id),
        limit(1)
      );
      const telSnap = await getDocs(telQuery);
      if (!telSnap.empty) {
        await updateDoc(doc(firestore, "community_moderation_telemetry", telSnap.docs[0].id), {
          finalStatus: "approved"
        });
      }

      toast({
        title: "Payload Released",
        description: `Approved post from @${post.authorName} is now visible on the public feed.`
      });
    } catch (err: any) {
      toast({
        title: "Release Failed",
        description: err.message || "Failed to approve post.",
        variant: "destructive"
      });
    }
  };

  // 5. Delete unsafe post
  const handleDeletePost = async (post: QuarantinedPost) => {
    if (!firestore) return;
    // One's rejected drafts are marked withheld rather than deleted —
    // the record of what One proposed is the point of having a queue.
    if (isOnePost(post)) {
      // One's drafts get the reason capture instead of an instant
      // purge; the panel decides with or without a reason.
      setRejectingOneId(post.id);
      setOneReasonText("");
      return;
    }
    try {
      await deleteDoc(doc(firestore, "community_posts", post.id));
      toast({
        title: "Payload Purged",
        description: `Unsafe content by @${post.authorName} removed from server.`
      });
    } catch (err: any) {
      toast({
        title: "Purge Failed",
        description: "Could not delete post.",
        variant: "destructive"
      });
    }
  };

  // 6. Trigger One reinforcement training endpoint
  const handleTrainOne = async () => {
    if (!user) return;
    setTraining(true);
    setTrainingSummary(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/moderation/train-one", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setTrainingSummary(data.learningsSummary || "No summary provided.");
        toast({
          title: "Brain Ingest Completed",
          description: `One successfully trained on ${data.trainedCount} logs.`
        });
      } else {
        throw new Error(data.error || "Training failed");
      }
    } catch (err: any) {
      toast({
        title: "Training Aborted",
        description: err.message || "Reinforcement learning pipeline error.",
        variant: "destructive"
      });
    } finally {
      setTraining(false);
    }
  };

  if (loadingAdminCombined || loadingUser) {
    return (
      <div className="min-h-dvh p-12 text-center text-slate-500 font-mono uppercase tracking-widest text-xs">
        Authenticating Operator...
      </div>
    );
  }

  if (!isCoreOrAdmin) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-transparent p-6 text-white font-mono">
        <div className="bg-rose-950/10 border border-rose-900/30 rounded-2xl p-8 max-w-md text-center space-y-4 shadow-xl">
          <Icon name="shield-warning" className="w-12 h-12 text-rose-500 mx-auto animate-pulse" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-rose-400">Restricted Access</h2>
          <p className="text-[11px] text-slate-400 leading-relaxed font-body">
            Level 3 Admin/Core clearance credentials required. Log in with an authorized account to access the CybrShield AI Command Center.
          </p>
          <Link href="/community">
            <button className="bg-rose-900/20 hover:bg-rose-900/40 text-rose-400 font-semibold px-4 py-2 rounded-xl text-[10px] uppercase border border-rose-900/40 transition-colors mt-2 cursor-pointer">
              Return to Community
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-transparent p-6 space-y-8 animate-fade-in text-white font-body">

      {/* Title Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-rose-500/20 bg-gradient-to-r from-[#1a0508]/80 to-[#2c0f13]/50 p-6 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-rose-500/30 bg-rose-950/40 text-rose-400 font-mono text-[9px] font-bold uppercase tracking-wider">
              <Icon name="terminal" className="w-3.5 h-3.5" />
              <span>Shield Active • One Moderator Node</span>
            </div>
            <h1 className="font-headline text-3xl font-extrabold tracking-tight text-white uppercase">
              AI Moderation Command Console
            </h1>
            <p className="text-xs text-slate-400 max-w-xl font-body">
              Manage safety systems, audit real-time telemetry logs, adjust manual suspensions, or sync reinforcement learning parameters.
            </p>
          </div>

          <button
            onClick={handleTrainOne}
            disabled={training}
            className="bg-rose-600 hover:bg-rose-500 text-white font-semibold px-5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors shrink-0 shadow-lg shadow-rose-900/20"
          >
            {training ? (
              <>
                <Icon name="loading" className="w-3.5 h-3.5 animate-spin" />
                <span>Syncing One Brain...</span>
              </>
            ) : (
              <>
                <Icon name="refresh" className="w-3.5 h-3.5" />
                <span>Sync & Train One</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Train One results */}
      {trainingSummary && (
        <div className="bg-emerald-950/20 border border-emerald-500/25 rounded-2xl p-5 space-y-2 max-w-3xl">
          <h4 className="font-headline font-bold text-xs text-[#00ffcc] flex items-center gap-1.5">
            <Icon name="shield-check" className="w-4 h-4 text-[#00ffcc]" />
            <span>One Training Completed successfully</span>
          </h4>
          <p className="text-[11px] text-slate-350 font-body leading-relaxed">{trainingSummary}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-white/10 gap-6">
        <button
          onClick={() => setActiveTab("ai_safety")}
          className={`pb-3 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border-b-2 ${activeTab === "ai_safety"
            ? "text-[#00ffcc] border-[#00ffcc]"
            : "text-zinc-500 border-transparent hover:text-zinc-300"
            }`}
        >
          AI Safety Engine
        </button>
        <button
          onClick={() => setActiveTab("accounts")}
          className={`pb-3 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border-b-2 ${activeTab === "accounts"
            ? "text-[#00ffcc] border-[#00ffcc]"
            : "text-zinc-500 border-transparent hover:text-zinc-300"
            }`}
        >
          Account Moderation
        </button>
      </div>

      {/* Main content grids */}
      {activeTab === "ai_safety" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Left Column: Quarantine Queue (span 5) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 space-y-4 shadow-xl">
              <h3 className="font-headline font-bold text-sm text-slate-200 border-b border-white/5 pb-2">
                Quarantine Queue ({quarantined.length})
              </h3>

              {quarantined.length === 0 ? (
                <div className="p-8 border border-dashed border-white/5 rounded-xl text-center text-slate-650 font-mono text-xs">
                  No payloads quarantined.
                </div>
              ) : (
                <div className="space-y-4">
                  {quarantined.map((post) => (
                    <div key={post.id} className="bg-slate-950/60 border border-yellow-500/25 rounded-xl p-4 space-y-3 relative overflow-hidden">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-xs font-bold text-slate-200 leading-tight">@{post.authorName}</h4>
                          <span className="text-[8px] font-mono text-slate-550 block mt-0.5">{post.authorEmail}</span>
                        </div>
                        <span className="text-[7px] font-mono text-yellow-400 bg-yellow-950/40 border border-yellow-500/30 px-1.5 py-0.5 rounded uppercase">
                          Quarantined
                        </span>
                      </div>

                      <p className="text-xs text-slate-400 font-body leading-normal line-clamp-3 bg-black/30 p-2 rounded">
                        {post.content}
                      </p>

                      {post.mediaUrl && (
                        <div className="rounded-lg overflow-hidden border border-white/5 aspect-video bg-black/40 flex items-center justify-center mt-2">
                          <img src={post.mediaUrl} className="max-h-24 object-contain" alt="Payload" />
                        </div>
                      )}

                      <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                        {isOnePost(post) && rejectingOneId === post.id ? (
                          <div className="w-full space-y-2">
                            <div className="text-[10px] font-semibold text-amber-300">
                              Why is this draft being rejected? Optional — the next draft reads it.
                            </div>
                            <textarea
                              value={oneReasonText}
                              onChange={(e) => setOneReasonText(e.target.value.slice(0, 280))}
                              rows={2}
                              placeholder="e.g. reads like an ad, not a community update"
                              className="w-full rounded-lg border border-white/10 bg-black/40 p-2 text-xs text-slate-200"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => { setRejectingOneId(null); setOneReasonText(""); }}
                                className="bg-transparent hover:bg-slate-800/60 text-slate-400 border border-white/10 px-3 py-1.5 rounded-lg text-[10px] font-semibold cursor-pointer transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => {
                                  const reason = oneReasonText.trim() || undefined;
                                  setRejectingOneId(null);
                                  void decideOnePost(post, "rejected", reason);
                                }}
                                className="bg-rose-600 hover:bg-rose-500 text-black px-3.5 py-1.5 rounded-lg text-[10px] font-semibold cursor-pointer transition-colors"
                              >
                                {oneReasonText.trim() ? "Reject with reason" : "Reject"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleDeletePost(post)}
                              className="bg-transparent hover:bg-rose-950/30 text-rose-400 border border-rose-900/20 hover:border-rose-900/50 px-3 py-1.5 rounded-lg text-[10px] font-semibold cursor-pointer transition-colors"
                            >
                              Purge
                            </button>
                            <button
                              onClick={() => handleReleasePost(post)}
                              className="bg-brand-500 hover:bg-brand-400 text-black px-3.5 py-1.5 rounded-lg text-[10px] font-semibold cursor-pointer transition-colors"
                            >
                              Release Post
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Telemetry logs stream (span 7) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 space-y-4 shadow-xl">
              <h3 className="font-headline font-bold text-sm text-slate-200 border-b border-white/5 pb-2 flex items-center justify-between">
                <span>Telemetry Logs Stream</span>
                <span className="text-[9px] font-mono text-slate-550 font-bold uppercase tracking-wider">Live</span>
              </h3>

              {loadingLogs ? (
                <div className="p-16 border border-dashed border-white/5 rounded-xl text-center text-slate-500 font-mono text-xs animate-pulse">
                  Accessing telemetry data nodes...
                </div>
              ) : logs.length === 0 ? (
                <div className="p-8 border border-dashed border-white/5 rounded-xl text-center text-slate-650 font-mono text-xs">
                  No telemetry data entries found.
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                  {logs.map((log) => (
                    <div key={log.id} className="bg-slate-950/40 p-3.5 border border-white/5 rounded-xl space-y-2 text-xs">
                      <div className="flex justify-between items-center text-[9px] font-mono">
                        <span className="text-[#008aff] font-bold">Log Node: {log.id.substring(0, 8)}</span>
                        <span className="text-slate-500">{new Date(log.createdAt).toLocaleTimeString()}</span>
                      </div>

                      <p className="text-[11px] text-slate-350 leading-relaxed font-body bg-black/20 p-2 rounded">
                        Caption: "{log.inputCaption}"
                      </p>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[9px] font-mono pt-1">
                        <div className={`p-1.5 rounded text-center border ${log.isAdult ? "bg-red-950/30 text-red-400 border-red-900/20" : "bg-black/30 text-slate-500 border-white/5"
                          }`}>
                          Adult: {log.isAdult ? "TRUE" : "FALSE"}
                        </div>
                        <div className={`p-1.5 rounded text-center border ${log.isViolence ? "bg-red-950/30 text-red-400 border-red-900/20" : "bg-black/30 text-slate-500 border-white/5"
                          }`}>
                          Violence: {log.isViolence ? "TRUE" : "FALSE"}
                        </div>
                        <div className={`p-1.5 rounded text-center border ${log.isRacy ? "bg-yellow-950/30 text-yellow-400 border-yellow-900/20" : "bg-black/30 text-slate-500 border-white/5"
                          }`}>
                          Racy: {log.isRacy ? "TRUE" : "FALSE"}
                        </div>
                        <div className={`p-1.5 rounded text-center border ${log.isToxicText ? "bg-red-950/30 text-red-400 border-red-900/20" : "bg-black/30 text-slate-500 border-white/5"
                          }`}>
                          Toxicity: {log.isToxicText ? "TRUE" : "FALSE"}
                        </div>
                      </div>

                      {log.slangClassification && (
                        <div className="bg-brand-950/15 border border-brand-500/10 p-2 rounded text-[10px] font-mono text-brand-400">
                          <span className="font-bold block uppercase text-[8px] text-brand-500">Slang Analysis</span>
                          {log.slangClassification}
                        </div>
                      )}

                      <div className="flex justify-between items-center text-[9px] font-mono pt-1 text-slate-500">
                        <span>Brain status: {log.trained ? "Trained" : "Untrained Logs Ingest Queue"}</span>
                        <span className={`font-bold ${log.finalStatus === "approved" ? "text-[#00ffcc]" : "text-yellow-400"}`}>
                          Final Status: {log.finalStatus.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h3 className="font-headline font-bold text-sm text-slate-200">
                Registered Cybrdeck Users
              </h3>
              <div className="relative w-full sm:w-72">
                <Icon name="search" className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search user email or name..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>

            {loadingUsers ? (
              <div className="p-16 border border-dashed border-white/5 rounded-xl text-center text-slate-500 font-mono text-xs animate-pulse">
                Accessing user registry database...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {usersList
                  .filter(u => {
                    const q = userSearchQuery.toLowerCase();
                    return (
                      (u.email || "").toLowerCase().includes(q) ||
                      (u.displayName || "").toLowerCase().includes(q)
                    );
                  })
                  .map(targetUser => {
                    const isSuspended = targetUser.suspendedUntil && new Date(targetUser.suspendedUntil).getTime() > Date.now();
                    return (
                      <div key={targetUser.id} className="bg-slate-950/60 border border-white/5 rounded-xl p-4 flex flex-col justify-between space-y-4 hover:border-white/12 transition-all">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs uppercase">
                                {(targetUser.displayName || targetUser.email || "??").substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-slate-200">{targetUser.displayName || "Anonymous"}</h4>
                                <p className="text-[10px] text-slate-550 font-mono">{targetUser.email}</p>
                              </div>
                            </div>
                            {targetUser.portalRole && (
                              <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border shrink-0 ${targetUser.portalRole === 'Admin' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' :
                                targetUser.portalRole === 'Cybrdeck' ? 'text-brand-400 bg-brand-500/10 border-brand-500/20' :
                                  'text-zinc-400 bg-zinc-500/10 border-zinc-500/20'
                                }`}>
                                {targetUser.portalRole}
                              </span>
                            )}
                          </div>

                          <div className="space-y-1 text-[10px] text-slate-400 font-mono">
                            <p>Suspensions Count: <span className="text-white font-bold">{targetUser.suspensionsReceived || 0}</span></p>
                            {isSuspended ? (
                              <p className="text-rose-450 font-semibold flex items-center gap-1">
                                🚫 Suspended until: {new Date(targetUser.suspendedUntil).toLocaleString()}
                              </p>
                            ) : (
                              <p className="text-[#00ffcc]">✅ Account Active</p>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setSuspensionModalUser(targetUser);
                            setSelectedDuration("24h");
                            setSelectedReasons([]);
                            setOtherReasonText("");
                            setConfirmText("");
                          }}
                          className="w-full bg-rose-900/10 hover:bg-rose-900/20 text-rose-400 border border-rose-900/30 hover:border-rose-900/50 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Icon name="user-close" className="w-3.5 h-3.5" />
                          <span>Modify Clearance / Suspend</span>
                        </button>
                      </div>
                    );
                  })
                }
              </div>
            )}

            {hasMoreUsers && !userSearchQuery && (
              <div className="flex justify-center pt-4">
                <button
                  onClick={() => loadUsersPage(lastVisibleUser, true)}
                  disabled={loadingMoreUsers}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-bold uppercase tracking-wider px-5 py-2 rounded-xl cursor-pointer disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  {loadingMoreUsers && <Icon name="loading" className="w-3 h-3 animate-spin" />}
                  <span>{loadingMoreUsers ? "Loading..." : "Load More Users"}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Suspension Modal */}
      {suspensionModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4 animate-fade-in relative">
            <h3 className="font-headline font-bold text-sm text-slate-100 uppercase tracking-wider pb-2 border-b border-white/10">
              Restrict Account Access
            </h3>

            <div className="bg-black/30 p-3 rounded-lg border border-white/5 space-y-1">
              <p className="text-xs font-bold text-[#00ffcc]">{suspensionModalUser.displayName || "Anonymous"}</p>
              <p className="text-[10px] text-zinc-500 font-mono">{suspensionModalUser.email}</p>
            </div>

            <div className="space-y-3 font-body">
              {/* Duration selection */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Duration</label>
                <select
                  value={selectedDuration}
                  onChange={(e) => setSelectedDuration(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-primary/50 cursor-pointer"
                >
                  <option value="24h">24 Hours</option>
                  <option value="72h">72 Hours</option>
                  <option value="7d">7 Days</option>
                  <option value="indefinite">Indefinite Ban (Blacklist & Delete)</option>
                </select>
              </div>

              {/* Reasons list checkboxes */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">Violation Categories</label>
                <div className="grid grid-cols-1 gap-2">
                  {SUSPENSION_REASONS.map(reason => (
                    <label key={reason} className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer p-1 hover:bg-white/5 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedReasons.includes(reason)}
                        onChange={() => handleToggleReason(reason)}
                        className="rounded border-white/10 bg-zinc-900 text-primary focus:ring-primary focus:ring-offset-zinc-950 w-4 h-4 cursor-pointer"
                      />
                      <span>{reason.replace(" (State Reason below)", "")}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Custom reason text area */}
              {selectedReasons.includes("Others (State Reason below)") && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Custom Reason Details</label>
                  <textarea
                    value={otherReasonText}
                    onChange={(e) => setOtherReasonText(e.target.value)}
                    placeholder="Provide specific details for custom violation reason..."
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl p-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-primary/50"
                    rows={3}
                  />
                </div>
              )}
            </div>

            {selectedDuration === "indefinite" && (
              <div className="space-y-1.5 bg-rose-950/20 border border-rose-900/40 rounded-xl p-3">
                <label className="text-[10px] font-bold uppercase tracking-wider text-rose-400 block">
                  Destructive Action — Type Confirmation Required
                </label>
                <p className="text-[10px] text-zinc-400 leading-relaxed font-body">
                  This will permanently blacklist the account, delete the user profile, remove them from Firebase Auth, and revoke all access. This action cannot be undone.
                </p>
                <p className="text-[10px] text-zinc-300 font-mono break-all">
                  Type <span className="text-rose-400 font-bold">{suspensionModalUser.email}</span> to confirm:
                </p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Type the user's email exactly"
                  className="w-full bg-black/40 border border-rose-900/40 rounded-xl p-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-rose-500/50"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                onClick={() => {
                  setSuspensionModalUser(null);
                  setConfirmText("");
                }}
                disabled={suspendingUser}
                className="bg-transparent hover:bg-white/5 border border-white/10 text-white text-[10px] font-bold uppercase tracking-wider px-4 py-2 rounded-xl cursor-pointer disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApplySuspension}
                disabled={
                  suspendingUser ||
                  (selectedDuration === "indefinite" &&
                    confirmText.trim().toLowerCase() !==
                    (suspensionModalUser.email || "").toLowerCase())
                }
                className="bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold uppercase tracking-wider px-5 py-2 rounded-xl cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                {suspendingUser && <Icon name="loading" className="w-3 h-3 animate-spin" />}
                <span>Apply Restriction</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
