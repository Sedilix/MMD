'use client';

import React, { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/icon';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';

interface StripeEmbeddedOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  // creatorUserId/email props retained for layout compatibility but are no
  // longer trusted: the server derives identity from the verified Firebase
  // ID token sent in the Authorization header. They are intentionally ignored.
  creatorUserId?: string;
  email?: string;
}

export function StripeEmbeddedOnboardingModal({
  isOpen,
  onClose,
}: StripeEmbeddedOnboardingModalProps) {
  const { toast } = useToast();
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && user) {
      initSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user]);

  const initSession = async () => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'You must be signed in to set up creator payouts.',
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const idToken = await user.getIdToken();
      const authHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      };

      const onboardRes = await fetch('/api/stripe/onboard', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          agreedAt: new Date().toISOString(),
          agreementVersion: 'v1.0-2026',
        }),
      });
      const onboardData = await onboardRes.json();

      if (onboardData.success) {
        if (onboardData.accountId) setAccountId(onboardData.accountId);
        if (onboardData.onboardingUrl) setOnboardingUrl(onboardData.onboardingUrl);

        const isUrlSuccess = typeof window !== 'undefined' && window.location.search.includes('stripe_connect=success');
        if (onboardData.detailsSubmitted || isUrlSuccess) {
          setIsConnected(true);
        }
      } else {
        setErrorMessage(onboardData.error || 'Failed to initialize Stripe onboarding.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Connection error initializing onboarding session.');
    } finally {
      setLoading(false);
    }
  };

  const [launchingDashboard, setLaunchingDashboard] = useState(false);

  const handleLaunchExternal = () => {
    if (onboardingUrl) {
      window.location.href = onboardingUrl;
    }
  };

  const handleOpenDashboard = async () => {
    if (!user) return;
    setLaunchingDashboard(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/stripe/login-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await res.json();
      if (data.success && data.loginUrl) {
        window.open(data.loginUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast({
          title: 'Dashboard Access Error',
          description: data.error || 'Failed to open Stripe Dashboard.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Connection Error',
        description: 'Failed to connect to Stripe server.',
        variant: 'destructive',
      });
    } finally {
      setLaunchingDashboard(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg border-border bg-zinc-950 text-white shadow-2xl">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
            <Icon name="user-check" className="h-5 w-5 text-purple-400" />
            Stripe Creator Payout Onboarding
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            Set up creator payouts and verify your seller account to publish AI tools on the marketplace.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {loading ? (
            <div className="py-12 text-center space-y-3">
              <Icon name="loading" className="h-8 w-8 text-purple-400 animate-spin mx-auto" />
              <p className="text-xs text-zinc-400 font-mono">Initializing secure Stripe onboarding...</p>
            </div>
          ) : isConnected ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-5 space-y-4">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    Direct Creator Payouts Activated
                  </h4>
                  {accountId && (
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Connected account ID: <code className="text-purple-300 font-mono">{accountId}</code>
                    </p>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-zinc-950 border border-white/10 text-xs font-mono space-y-1.5 text-zinc-300">
                <div className="flex justify-between">
                  <span>Revenue Split:</span>
                  <span className="text-emerald-400 font-bold">70% Creator / 30% Platform</span>
                </div>
                <div className="flex justify-between">
                  <span>Payout Currency:</span>
                  <span className="text-white">USD (Direct Deposit)</span>
                </div>
                <div className="flex justify-between">
                  <span>Payout Status:</span>
                  <span className="text-emerald-400 font-semibold">Verified & Active</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleOpenDashboard}
                  disabled={launchingDashboard}
                  className="flex-1 h-9 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold gap-1.5"
                >
                  {launchingDashboard ? <Icon name="loading" className="h-3.5 w-3.5 animate-spin" /> : <Icon name="external-link" className="h-3.5 w-3.5" />}
                  Open Express Dashboard
                </Button>
                <Button
                  onClick={onClose}
                  variant="outline"
                  className="h-9 border-zinc-800 text-zinc-300 hover:bg-zinc-800 text-xs font-semibold"
                >
                  Close
                </Button>
              </div>
            </div>
          ) : onboardingUrl ? (
            <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-5 space-y-4 text-center">
              <div className="h-10 w-10 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 flex items-center justify-center mx-auto">
                <Icon name="shield-check" className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Stripe Express Account Ready</h4>
                {accountId && (
                  <p className="text-xs text-purple-300 font-mono mt-0.5">
                    Account: {accountId}
                  </p>
                )}
                <p className="text-xs text-zinc-400 mt-1">
                  Complete your identity & bank payout details on Stripe to enable 70/30 creator revenue splits.
                </p>
              </div>
              <Button
                onClick={handleLaunchExternal}
                className="w-full h-10 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs gap-2 shadow-lg shadow-purple-900/30"
              >
                <Icon name="external-link" className="h-4 w-4" /> Continue to Bank Verification
              </Button>
            </div>
          ) : (
            <div className="py-8 text-center space-y-3 bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
              <p className="text-xs text-zinc-300">
                {errorMessage || 'Unable to initialize Stripe onboarding.'}
              </p>
              <Button
                onClick={initSession}
                className="h-9 px-6 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold"
              >
                Retry
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
