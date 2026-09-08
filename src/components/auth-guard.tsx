"use client"

import { useEffect, useState, Suspense } from 'react';
import { Icon } from '@/components/ui/icon';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth, useFirestore } from '@/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

import LoginPage from '@/app/login/page';

const CORE_EMAILS = ["one", "iqbal", "mehdi", "gwen", "1ightray"];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [roleChecked, setRoleChecked] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const auth = useAuth();
  const db = useFirestore();

  useEffect(() => {
    if (!auth || !db) return;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setAuthenticated(true);
        try {
          // Fetch user document from Firestore
          const userDocRef = doc(db, 'users', user.uid);
          let userDoc = await getDoc(userDocRef);

          // Ensure the user doc exists. Client SDK cannot create /users/{uid}
          // docs (firestore.rules denies create), so we provision via the
          // Admin SDK route on first login. Without this, the role picker
          // would fail on its first setDoc (merge:true on a missing doc) and
          // the user would be stuck on the spinner.
          if (!userDoc.exists()) {
            try {
              const idToken = await user.getIdToken();
              await fetch('/api/ensure-user-doc', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${idToken}` },
              });
              // Re-read so the rest of this handler sees the provisioned doc.
              userDoc = await getDoc(userDocRef);
            } catch (provisionErr) {
              // Non-fatal — log and continue with whatever we have.
              console.warn('[auth-guard] ensure-user-doc failed:', provisionErr);
            }
          }

          // Check if they are in the admins collection. We try several
          // email casings + the user doc's own `role`/`portalRole` fields
          // so a Google social login (where the email may be stored in
          // slightly different normalisations) still resolves admin.
          const emailRaw = user.email || '';
          const emailLower = emailRaw.toLowerCase();
          const emailCands = Array.from(
            new Set([emailLower, emailRaw, emailRaw.toLowerCase().split('@')[0] + '@' + emailLower.split('@')[1]]),
          );
          let isRealAdmin = false;
          for (const candidate of emailCands) {
            const adminDocRef = doc(db, 'admins', candidate);
            const adminDoc = await getDoc(adminDocRef);
            if (adminDoc.exists() && adminDoc.data()?.role === 'admin' && adminDoc.data()?.uiAccess === true) {
              isRealAdmin = true;
              break;
            }
          }
          // Fallback: if the user doc itself has role:'admin' (set by the
          // dashboard role picker or sync from a higher-level system),
          // treat them as an admin too. Lets Google-signed-in admins in
          // even when no /admins doc exists.
          if (!isRealAdmin && userDoc.exists()) {
            const ud = userDoc.data() as { role?: string; portalRole?: string } | undefined;
            if (ud?.role === 'admin' || ud?.portalRole === 'Admin') {
              isRealAdmin = true;
            }
          }

          let portalRole = userDoc.exists() ? userDoc.data()?.portalRole : null;

          if (isRealAdmin && portalRole !== 'Admin') {
            portalRole = 'Admin';
            await setDoc(userDocRef, { portalRole }, { merge: true });
          } else if (!portalRole) {
            // Auto-assign roles for existing members
            const displayNameLower = (user.displayName || '').toLowerCase();

            if (emailLower.includes('sedilix') || displayNameLower.includes('sedilix')) {
              portalRole = 'Admin';
            } else if (CORE_EMAILS.some(core => emailLower.includes(core) || displayNameLower.includes(core))) {
              portalRole = 'Cybrdeck';
            } else {
              // Check if they exist in the specialists (members) collection
              const memberDocRef = doc(db, 'members', user.uid);
              const memberDoc = await getDoc(memberDocRef);
              if (memberDoc.exists()) {
                portalRole = 'Agent';
              }
            }

            if (portalRole) {
              // Save the auto-assigned role back to Firestore
              await setDoc(userDocRef, { portalRole }, { merge: true });
            }
          }

          // If still no role is set and they aren't on the onboarding page, redirect to role picker
          if (!portalRole && pathname !== '/onboarding/role') {
            router.push(`/onboarding/role?redirect=${encodeURIComponent(pathname)}`);
            setLoading(false);
            return;
          }

          // Role restrictions: Community Members cannot access /dashboard, /rag, /admin
          const isDashboardRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/rag') || pathname.startsWith('/admin');
          if (portalRole === 'Community Member' && isDashboardRoute) {
            router.push('/community');
            setLoading(false);
            return;
          }

          setRoleChecked(true);
        } catch (err) {
          console.error("AuthGuard role verification error:", err);
          setRoleChecked(true); // fall back to allowing render on failure to avoid blocking
        }
      } else {
        setAuthenticated(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router, pathname, auth, db]);

  if (loading || (authenticated && !roleChecked && pathname !== '/onboarding/role')) {
    return (
      <div className="h-svh w-full flex items-center justify-center bg-background">
        <Icon name="loading" className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <Suspense fallback={
        <div className="h-svh w-full flex items-center justify-center bg-background">
          <Icon name="loading" className="h-8 w-8 animate-spin text-primary" />
        </div>
      }>
        <LoginPage />
      </Suspense>
    );
  }

  return <>{children}</>;
}
