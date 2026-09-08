"use client";

/**
 * Admin section — enforces admin-only access for every page under /admin/*
 * (One's Progress & Reports, Agents Dashboard, Moderation Console, Site Analytics).
 *
 * Uses AuthGuard for client-side authentication and checks Firestore admin
 * status via admins/{email} and users/{uid}.portalRole. If unauthorized,
 * renders AdminAccessDenied rather than throwing or bouncing redirects.
 */
import React, { useMemo } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { useUser, useFirestore, useDoc } from '@/firebase';
import { doc } from 'firebase/firestore';
import AdminShell from './AdminShell';
import AdminAccessDenied from './AdminAccessDenied';

function AdminContentGate({ children }: { children: React.ReactNode }) {
    const { user } = useUser();
    const firestore = useFirestore();

    const adminDocRef = useMemo(() => {
        if (!firestore || !user?.email) return null;
        return doc(firestore, 'admins', user.email.toLowerCase());
    }, [firestore, user?.email]);

    const userDocRef = useMemo(() => {
        if (!firestore || !user?.uid) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user?.uid]);

    const { data: adminDoc, loading: adminLoading } = useDoc(adminDocRef);
    const { data: userDoc, loading: userLoading } = useDoc(userDocRef);

    const adminData = adminDoc as { role?: string; uiAccess?: boolean } | null;
    const userData = userDoc as { portalRole?: string } | null;

    const isAdmin = Boolean(
        (adminData?.role === 'admin' && adminData?.uiAccess === true) ||
        userData?.portalRole === 'Admin'
    );

    if (adminLoading || userLoading) {
        return (
            <div className="min-h-dvh bg-zinc-950 text-zinc-400 font-mono text-xs flex items-center justify-center">
                <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-brand-400 animate-ping" />
                    <span>Verifying admin clearance...</span>
                </div>
            </div>
        );
    }

    if (!isAdmin) {
        return <AdminAccessDenied />;
    }

    return <AdminShell>{children}</AdminShell>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthGuard>
            <AdminContentGate>{children}</AdminContentGate>
        </AuthGuard>
    );
}
