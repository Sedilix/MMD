"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Icon } from '@/components/ui/icon';
import { useParams, useRouter } from "next/navigation";
import { Award, Activity } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore } from "@/firebase";
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, updateDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import BadgeBar from "@/components/community/BadgeBar";
import { AuthGuard } from "@/components/auth-guard";

interface BadgeItem {
  id: string;
  name: string;
  desc: string;
  icon: string;
  colorClass: string;
  borderColorClass: string;
}

export default function MemberProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const username = (params?.username as string) || "operator";

  // State
  const [profileUser, setProfileUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  // Edit States
  const [isEditing, setIsEditing] = useState(false);
  const [editBio, setEditBio] = useState("");
  const [editGitHub, setEditGitHub] = useState("");

  const isSelf = useMemo(() => {
    if (!user || !profileUser) return false;
    return user.uid === profileUser.uid;
  }, [user, profileUser]);

  // Load profile user and connections
  useEffect(() => {
    if (!firestore || !username || !user) return;
    setLoading(true);

    async function loadProfile() {
      try {
        // Query users by display name (or email split)
        const usersRef = collection(firestore, "users");
        const q = query(usersRef, where("displayName", "==", username.replace(/%20/g, " ")));
        const snapshot = await getDocs(q);

        let targetUser: any = null;

        if (!snapshot.empty) {
          const uDoc = snapshot.docs[0];
          targetUser = { uid: uDoc.id, ...uDoc.data() };
        } else {
          // Fallback search by matching email prefixes
          const qEmail = query(usersRef);
          const emailSnapshot = await getDocs(qEmail);
          emailSnapshot.forEach(doc => {
            const data = doc.data();
            const prefix = data.email?.split("@")[0] || "";
            if (prefix.toLowerCase() === username.toLowerCase()) {
              targetUser = { uid: doc.id, ...data };
            }
          });
        }

        // If no user found, fallback mock user so page renders beautifully
        if (!targetUser) {
          targetUser = {
            uid: `mock_${username}`,
            displayName: username.replace(/%20/g, " "),
            email: `${username}@cybrdeck.com`,
            role: "member",
            bio: "Active developer, systems builder, and tech enthusiast inside the Cybrdeck Ecosystem.",
            gitHubUrl: `https://github.com/${username}`,
            joinedDate: "July 2026",
            createdAt: new Date().toISOString()
          };
        }

        setProfileUser(targetUser);
        setEditBio(targetUser.bio || "");
        setEditGitHub(targetUser.gitHubUrl || "");

        // Load follower details
        const followsRef = collection(firestore, "community_follows");
        
        // Count followers
        const qFollowers = query(followsRef, where("followingId", "==", targetUser.uid));
        const followersSnap = await getDocs(qFollowers);
        setFollowersCount(followersSnap.size);

        // Count following
        const qFollowing = query(followsRef, where("followerId", "==", targetUser.uid));
        const followingSnap = await getDocs(qFollowing);
        setFollowingCount(followingSnap.size);

        // Check if current user is following this profile
        if (user && user.uid !== targetUser.uid) {
          const followDocId = `${user.uid}_${targetUser.uid}`;
          const followDoc = await getDoc(doc(firestore, "community_follows", followDocId));
          setIsFollowing(followDoc.exists);
        }

      } catch (err) {
        console.error("Failed to load profile details:", err);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [firestore, username, user]);

  const handleFollowToggle = async () => {
    if (!firestore || !user || !profileUser) return;

    const followDocId = `${user.uid}_${profileUser.uid}`;
    const followRef = doc(firestore, "community_follows", followDocId);

    try {
      if (isFollowing) {
        await deleteDoc(followRef);
        setIsFollowing(false);
        setFollowersCount(c => Math.max(0, c - 1));
        toast({
          title: "Connection Severed",
          description: `You are no longer following ${profileUser.displayName}.`
        });
      } else {
        await setDoc(followRef, {
          followerId: user.uid,
          followingId: profileUser.uid,
          createdAt: new Date().toISOString()
        });
        setIsFollowing(true);
        setFollowersCount(c => c + 1);
        toast({
          title: "Connection Secure",
          description: `You are now following ${profileUser.displayName}.`
        });
      }
    } catch (err) {
      console.error("Follow action failed:", err);
      toast({
        title: "Connection Failed",
        description: "Could not execute follow/unfollow request.",
        variant: "destructive"
      });
    }
  };

  const handleSaveProfile = async () => {
    if (!firestore || !user || !profileUser) return;

    try {
      const userRef = doc(firestore, "users", user.uid);
      await updateDoc(userRef, {
        bio: editBio,
        gitHubUrl: editGitHub
      });

      setProfileUser((prev: any) => ({
        ...prev,
        bio: editBio,
        gitHubUrl: editGitHub
      }));

      setIsEditing(false);
      toast({
        title: "Profile Refreshed",
        description: "Your operator credentials have been securely updated."
      });
    } catch (err) {
      console.error("Failed to update profile details:", err);
      toast({
        title: "Update Failed",
        description: "Could not save your changes.",
        variant: "destructive"
      });
    }
  };

  // Predefined badges
  const badges: BadgeItem[] = [
    {
      id: "b-1",
      name: "Node Pioneer",
      desc: "Joined Cybrdeck Community during the early gateway initialization phase.",
      icon: "⚡",
      colorClass: "text-brand-400 bg-brand-950/40",
      borderColorClass: "border-brand-500/20"
    },
    {
      id: "b-2",
      name: "L1 Engineer",
      desc: "Completed live systems engineer calibration tests.",
      icon: "⚙️",
      colorClass: "text-[#008aff] bg-blue-950/40",
      borderColorClass: "border-blue-500/20"
    },
    {
      id: "b-3",
      name: "Top Contributor",
      desc: "Earned more than 500 XP points on monthly contributor leaderboard.",
      icon: "🔥",
      colorClass: "text-amber-400 bg-amber-950/40",
      borderColorClass: "border-amber-500/20"
    }
  ];

  if (loading) {
    return (
      <div className="min-h-dvh bg-transparent p-12 text-center text-slate-500 font-mono uppercase tracking-widest text-xs">
        Accessing member dossier files...
      </div>
    );
  }

  return (
    <AuthGuard>
      <main className="min-h-dvh bg-transparent p-6 space-y-8 animate-fade-in text-white font-body">
        
        {/* Navigation Header */}
        <div className="flex items-center justify-between">
          <Link href="/community">
            <button className="text-xs font-mono uppercase tracking-widest text-slate-450 hover:text-slate-200 flex items-center gap-1.5 p-0 sm:px-3 cursor-pointer transition-colors">
              <Icon name="arrow-left-md" className="h-4 w-4" />
              <span>Back to Community Hub</span>
            </button>
          </Link>
        </div>

        {/* Main Layout Profile Info */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Avatar and Bio (span 4) */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 space-y-5 shadow-xl flex flex-col items-center text-center relative overflow-hidden">
              
              {/* Top decorative gradient bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-500 to-[#008aff]" />

              {/* Profile Avatar Monogram */}
              <div className="w-24 h-24 rounded-full bg-brand-950/40 border border-brand-500/35 flex items-center justify-center text-brand-400 text-3xl font-headline font-extrabold uppercase shadow-lg shadow-brand-500/10">
                {(profileUser?.displayName || username).substring(0, 2).toUpperCase()}
              </div>

              {/* Profile name and handle */}
              <div className="space-y-1 w-full">
                <h2 className="font-headline text-xl font-extrabold text-white leading-tight truncate">
                  {profileUser?.displayName || username}
                </h2>
                <span className="text-[10px] font-mono text-[#00ffcc] bg-[#00ffcc]/10 px-2 py-0.5 rounded border border-[#00ffcc]/20 uppercase">
                  {profileUser?.role === "admin" ? "Admin/Core" : "Community Member"}
                </span>
                <p className="text-[10px] font-mono text-slate-500 truncate mt-1">
                  {profileUser?.email}
                </p>
              </div>

              {/* Follower Stats */}
              <div className="flex gap-6 py-2 border-t border-b border-white/5 w-full justify-center text-xs font-mono text-slate-400">
                <div>
                  <span className="text-white font-bold">{followersCount}</span> Followers
                </div>
                <div>
                  <span className="text-white font-bold">{followingCount}</span> Following
                </div>
              </div>

              {/* Action buttons (Follow or Edit) */}
              {isSelf ? (
                isEditing ? (
                  <button
                    onClick={handleSaveProfile}
                    className="w-full bg-[#008aff] hover:bg-blue-400 text-black font-semibold py-2 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Icon name="save" className="w-4 h-4 text-black" />
                    <span>Save Profile</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="w-full bg-transparent hover:bg-white/5 border border-white/10 text-slate-200 font-semibold py-2 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Icon name="edit" className="w-4 h-4 text-slate-350" />
                    <span>Edit Profile</span>
                  </button>
                )
              ) : (
                user && (
                  <button
                    onClick={handleFollowToggle}
                    className={`w-full font-semibold py-2 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      isFollowing
                        ? "bg-slate-800 hover:bg-rose-950/20 hover:text-rose-400 text-slate-300 border border-white/5 hover:border-rose-900/30"
                        : "bg-brand-500 hover:bg-brand-400 text-slate-950"
                    }`}
                  >
                    {isFollowing ? (
                      <>
                        <Icon name="user-minus" className="w-4 h-4" />
                        <span>Unfollow</span>
                      </>
                    ) : (
                      <>
                        <Icon name="user-plus" className="w-4 h-4" />
                        <span>Follow Agent</span>
                      </>
                    )}
                  </button>
                )
              )}

              {/* Bio Field */}
              {isEditing ? (
                <div className="space-y-3 w-full text-left">
                  <div className="space-y-1">
                    <label className="text-[9px] font-mono text-slate-500 uppercase">Operator Bio</label>
                    <textarea
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-brand-500 font-body min-h-[80px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-mono text-slate-500 uppercase">GitHub Profile URL</label>
                    <input
                      type="text"
                      value={editGitHub}
                      onChange={(e) => setEditGitHub(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 font-body leading-relaxed text-left w-full">
                  {profileUser?.bio || "No operator bio recorded."}
                </p>
              )}

              {/* Detailed metadata list */}
              {!isEditing && (
                <div className="space-y-2.5 w-full text-[10px] font-mono text-slate-400 text-left">
                  <div className="flex justify-between items-center bg-slate-950/40 p-2.5 rounded border border-white/5">
                    <span className="text-slate-500">Security Clearance</span>
                    <span className="text-brand-400 font-bold uppercase">{profileUser?.clearanceLevel || "L1 Member"}</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-950/40 p-2.5 rounded border border-white/5">
                    <span className="text-slate-500">Node Sync Date</span>
                    <span className="text-slate-200">
                      {profileUser?.createdAt ? new Date(profileUser.createdAt).toLocaleDateString() : "July 2026"}
                    </span>
                  </div>
                  {profileUser?.gitHubUrl && (
                    <a 
                      href={profileUser.gitHubUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex justify-between items-center bg-slate-950/40 p-2.5 rounded border border-white/5 hover:border-brand-500/25 hover:text-white transition-all cursor-pointer"
                    >
                      <span className="text-slate-500">Creator Repository</span>
                      <span className="flex items-center gap-1">
                        <span>GitHub Profile</span>
                        <Icon name="external-link" className="w-3 h-3" />
                      </span>
                    </a>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* Right Column: Badges & Contribution history (span 8) */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Badge Bar section */}
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 space-y-5 shadow-xl">
              <h3 className="font-headline font-bold text-base text-slate-200 border-b border-white/5 pb-3 flex items-center gap-2">
                <Award className="w-4 h-4 text-[#008aff]" />
                <span>Earned Badge Clearance</span>
              </h3>
              
              <BadgeBar userId={profileUser.uid} />
            </div>

            {/* Activity Logs section */}
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-6 space-y-5 shadow-xl">
              <h3 className="font-headline font-bold text-base text-slate-200 border-b border-white/5 pb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-brand-400" />
                <span>Activity & Git Contribution Log</span>
              </h3>
              
              <div className="space-y-4">
                <div className="bg-slate-950/40 p-4 border border-white/5 rounded-xl space-y-2">
                  <div className="flex justify-between items-center text-[10px] font-mono">
                    <span className="text-[#00ffcc] font-bold">git push origin master</span>
                    <span className="text-slate-500">2026-07-06 00:18</span>
                  </div>
                  <h4 className="text-xs font-semibold text-slate-200">
                    Refactored event checkout hooks to dynamically mount Stripe elements.
                  </h4>
                </div>

                <div className="bg-slate-950/40 p-4 border border-white/5 rounded-xl space-y-2">
                  <div className="flex justify-between items-center text-[10px] font-mono">
                    <span className="text-[#00ffcc] font-bold">git push origin master</span>
                    <span className="text-slate-500">2026-07-05 18:30</span>
                  </div>
                  <h4 className="text-xs font-semibold text-slate-200">
                    Fixed typography issues in location pills on main dashboard panels.
                  </h4>
                </div>
              </div>
            </div>

          </div>

        </div>

      </main>
    </AuthGuard>
  );
}
