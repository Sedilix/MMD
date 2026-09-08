"use client"

import { Suspense, lazy, useMemo } from 'react';
import { useUser, useFirestore, useDoc } from '@/firebase';
import { useRoster } from '@/hooks/use-roster';
import { doc } from 'firebase/firestore';

// P1.8 (audit): Each tab is now lazy-loaded via React.lazy + Suspense so the
// inactive tabs don't mount, don't subscribe to Firestore listeners, and
// don't cost any frame budget. Active tab renders synchronously after Suspense
// resolves.
//
// Trade-off: switching tabs incurs a one-off mount cost. For the dashboard
// (heavily subscribed), this is a net win — previously all 4 tabs mounted on
// first visit and stayed mounted forever.

const ProjectWarehouse = lazy(() => import('@/components/dashboard/ProjectWarehouse'));
const ProjectRequests = lazy(() => import('@/components/dashboard/ProjectRequests'));
const ProjectSummary = lazy(() => import('@/components/dashboard/ProjectSummary'));
const ProjectTimeline = lazy(() => import('@/components/dashboard/ProjectTimeline'));
const ProjectMilestones = lazy(() => import('@/components/dashboard/ProjectMilestones'));
const ManageApplicants = lazy(() => import('@/components/dashboard/ManageApplicants'));
const AgentForum = lazy(() => import('@/components/dashboard/AgentForum'));
const ManageUsers = lazy(() => import('@/components/dashboard/ManageUsers'));
const MarketingDashboard = lazy(() => import('@/components/dashboard/MarketingDashboard'));
const SocialControl = lazy(() => import('@/components/dashboard/SocialControl'));
import { ClientView } from '@/components/dashboard/ClientView';
import { useDashboardTab } from '@/lib/dashboard/use-dashboard-tab';

export default function DashboardPage() {
  const { user } = useUser();
  const { members, loading: rosterLoading } = useRoster();
  const firestore = useFirestore();

  const adminDocRef = useMemo(() => {
    if (!firestore || !user?.email) return null;
    return doc(firestore, 'admins', user.email.toLowerCase());
  }, [firestore, user?.email]);

  const userDocRef = useMemo(() => {
    if (!firestore || !user?.uid) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user?.uid]);

  const { data: adminDoc } = useDoc(adminDocRef);
  const { data: userDoc } = useDoc(userDocRef);
  const adminData = adminDoc as { role?: string; uiAccess?: boolean } | null;
  const userData = userDoc as { portalRole?: string } | null;
  const isAdmin = adminData?.role === 'admin' && adminData?.uiAccess === true;
  const isCore = userData?.portalRole === 'Admin' || userData?.portalRole === 'Cybrdeck';
  const isCoreOrAdmin = isAdmin || isCore;

  // Shared with app/dashboard/layout.tsx — see src/lib/dashboard/nav.ts for
  // why this can no longer be a private copy with its own default.
  const activeHash = useDashboardTab();

  const isAgent = members?.some(m => m.uid === user?.uid) || isAdmin;

  if (rosterLoading) {
    return <div className="p-12 text-center text-muted-foreground font-mono uppercase tracking-widest text-xs">Authenticating clearance level...</div>;
  }

  if (!isAgent) {
    return (
      <div className="w-full">
        <ClientView />
      </div>
    );
  }

  // Render only the active tab; Suspense keeps the swap smooth.
  return (
    <div className="w-full">
      <Suspense fallback={<div className="p-12 text-center text-muted-foreground font-mono uppercase tracking-widest text-xs">Loading tab...</div>}>
        {activeHash === '#projects' && <ProjectWarehouse key="#projects" />}
        {activeHash === '#requests' && <ProjectRequests key="#requests" />}
        {activeHash === '#summary' && <ProjectSummary key="#summary" />}
        {activeHash === '#timeline' && <ProjectTimeline key="#timeline" />}
        {activeHash === '#milestones' && <ProjectMilestones key="#milestones" />}
        {activeHash === '#applicants' && <ManageApplicants key="#applicants" />}
        {activeHash === '#forum' && <AgentForum key="#forum" />}
        {activeHash === '#users' && isAdmin && <ManageUsers key="#users" />}
        {activeHash === '#marketing' && isCoreOrAdmin && <MarketingDashboard key="#marketing" />}
        {activeHash === '#social-control' && isCoreOrAdmin && <SocialControl key="#social-control" />}
        {activeHash === '#social-control' && !isCoreOrAdmin && (
          <div className="rounded-xl border border-border bg-card/50 p-6 text-sm text-muted-foreground">
            <div className="font-semibold text-foreground">Restricted</div>
            <div className="mt-1">The Command Console approves One&apos;s outbound social actions and is available to Admin and Core users only.</div>
          </div>
        )}
        {activeHash === '#marketing' && !isCoreOrAdmin && (
          <div className="rounded-xl border border-border bg-card/50 p-6 text-sm text-muted-foreground">
            <div className="font-semibold text-foreground">Restricted</div>
            <div className="mt-1">The Marketing Agent is available to Admin and Core users only. If you need access, ask a Core operator to grant the Cybrdeck portal role.</div>
          </div>
        )}
      </Suspense>
    </div>
  );
}