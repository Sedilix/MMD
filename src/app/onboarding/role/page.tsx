"use client"

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
// Handshake and Cpu have no coolicons equivalent, so `roles` below holds
// pre-rendered elements rather than component references — a ReactNode can
// carry either library, which a shared `ComponentType` field could not.
import { Handshake, Cpu } from 'lucide-react';
import { Icon } from '@/components/ui/icon';
import Image from 'next/image';

export default function RoleSelectionPage() {
  const { user } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  const roles = [
    {
      id: 'Client',
      title: 'Client',
      description: 'I want to hire Cybrdeck specialists and manage client projects.',
      icon: <Icon name="suitcase" className="w-6 h-6" />,
      color: 'border-blue-500/30 text-blue-400 bg-blue-500/5 hover:border-blue-500/60',
    },
    {
      id: 'Partner',
      title: 'Partner',
      description: 'I represent a partner organization collaborating with Cybrdeck.',
      icon: <Handshake className="w-6 h-6" />,
      color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5 hover:border-emerald-500/60',
    },
    {
      id: 'Agent',
      title: 'Specialist / Agent',
      description: 'I want to apply to join the Cybrdeck roster of experts.',
      icon: <Cpu className="w-6 h-6" />,
      color: 'border-violet-500/30 text-violet-400 bg-violet-500/5 hover:border-violet-500/60',
      isExternal: true,
    },
    {
      id: 'Community Member',
      title: 'Community Member',
      description: 'I want unhindered access to discussions and community events.',
      icon: <Icon name="users" className="w-6 h-6" />,
      color: 'border-zinc-500/30 text-zinc-400 bg-zinc-500/5 hover:border-zinc-500/60',
    },
  ];

  // Fire-and-forget admin notification. Must NEVER block the role redirect —
  // a stale Firebase token, network blip, or SMTP hiccup should not leave the
  // user stuck on the role picker with a spinner.
  const notifyRoleSelected = (selectedUser: typeof user, selectedRoleId: string) => {
    if (!selectedUser) return;
    (async () => {
      try {
        const idToken = await selectedUser.getIdToken();
        await fetch('/api/notify-new-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify({ role: selectedRoleId }),
        });
      } catch (notifyErr) {
        console.warn('[onboarding/role] Failed to notify admin:', notifyErr);
      }
    })();
  };

  const handleRoleSelect = async (roleId: string, isExternal?: boolean) => {
    if (!user || !db) return;
    setSelectedRole(roleId);
    setLoading(true);

    try {
      // Role mapping for canonical backend roles
      const roleMap: Record<string, string> = {
        'Client': 'client',
        'Partner': 'partner',
        'Agent': 'specialist',
        'Specialist': 'specialist',
        'Community Member': 'community',
      };
      const canonicalRole = roleMap[roleId] || roleId.toLowerCase();
      const portalRole = roleId === 'Agent' ? 'Specialist' : roleId;

      // firestore.rules locks `role` as a client-immutable field (a user
      // can't self-promote after the fact), which also blocks the client
      // SDK from writing it the very first time — so onboarding sets role
      // through this Admin SDK route rather than a direct client setDoc.
      // ensure-user-doc both provisions /users/{uid} (the client SDK can't
      // create it either) and, in the same call, applies the chosen role.
      const idToken = await user.getIdToken();
      const res = await fetch('/api/ensure-user-doc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ role: canonicalRole }),
      });
      if (!res.ok) {
        throw new Error(`ensure-user-doc failed: ${res.status}`);
      }

      // Kick off the admin notification (fire-and-forget).
      notifyRoleSelected(user, portalRole);

      if (isExternal) {
        // If choosing Specialist/Agent, redirect them to the vetted specialist intake form
        router.push('/initialize-specialist');
        return;
      }

      // Redirect depending on access
      const redirectUrl = searchParams.get('redirect');
      if (redirectUrl) {
        router.push(redirectUrl);
      } else if (roleId === 'Community Member') {
        router.push('/community');
      } else {
        router.push('/');
      }
    } catch (err) {
      console.error('Error saving user role onboarding choice:', err);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-zinc-950 text-slate-200">
      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none -z-10 opacity-30">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-secondary/10 blur-[120px] rounded-full" />
      </div>

      <Card className="w-full max-w-3xl border border-zinc-800 bg-[#121316]/85 backdrop-blur-xl p-8 relative overflow-hidden flex flex-col shadow-[0_0_40px_rgba(0,0,0,0.5)] rounded-2xl">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-blue-500 via-primary to-violet-500" />
        
        <CardHeader className="text-center pb-8 space-y-3">
          <div className="flex justify-center">
            <Image 
              src="/cybrdeck-logo/cybrdeck_logo_cropped_white.png"
              alt="Cybrdeck Logo"
              width={240}
              height={48}
              className="h-8 w-auto object-contain"
              priority 
            />
          </div>
          <CardTitle className="text-3xl font-headline font-bold tracking-tight text-white uppercase">
            Select Your Designation
          </CardTitle>
          <CardDescription className="text-sm text-zinc-400 max-w-md mx-auto">
            Choose your role to initialize your profile and customize your access levels.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {roles.map((r) => {
              return (
                <button
                  key={r.id}
                  onClick={() => handleRoleSelect(r.id, r.isExternal)}
                  disabled={loading}
                  className={`p-6 rounded-xl border text-left transition-all duration-300 flex items-start gap-4 cursor-pointer relative group overflow-hidden ${r.color}`}
                >
                  <div className="p-3 rounded-lg bg-black/40 border border-white/5 shrink-0 transition-transform group-hover:scale-105 duration-300">
                    {r.icon}
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-headline font-bold uppercase tracking-wide text-white">
                      {r.title}
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      {r.description}
                    </p>
                  </div>
                  <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    {loading && selectedRole === r.id ? (
                      <Icon name="loading" className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <Icon name="arrow-right-md" className="w-4 h-4 text-white" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
