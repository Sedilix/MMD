'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from '@/components/ui/icon';
import { Flame, Sparkles, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StripeEmbeddedOnboardingModal } from '@/components/studio/StripeEmbeddedOnboardingModal';
import type { Skill } from '@/lib/playground/skills';
import type { MarketplaceSkillRecord } from '@/backend/db';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

/** Hard cap on untrusted SKILL.md payloads fetched from the marketplace. */
const MAX_MARKETPLACE_SKILL_CHARS = 120_000;

interface SkillsMarketplaceProps {
  onBack: () => void;
  installedSkillIds: string[];
  onInstall: (skill: Skill) => void;
}

export function SkillsMarketplace({ onBack, installedSkillIds, onInstall }: SkillsMarketplaceProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [skills, setSkills] = useState<MarketplaceSkillRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());
  const [onboarding, setOnboarding] = useState(false);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [showLiabilityModal, setShowLiabilityModal] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Filters & REST API State
  const [query, setQuery] = useState('');
  const [isAiSearch, setIsAiSearch] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [selectedSort, setSelectedSort] = useState<string>('popularity');
  const [selectedTier, setSelectedTier] = useState<string>('all');

  // Infinite Scroll State
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const limit = 20;

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Reset page & list when filters change
  const handleFilterChange = (setter: (val: any) => void, val: any) => {
    setter(val);
    setPage(1);
  };

  const fetchMarketplaceSkills = useCallback(async (isPaginated = false) => {
    if (isPaginated) setLoadingMore(true);
    else setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        q: query.trim(),
        ai_search: isAiSearch ? 'true' : 'false',
        category: selectedCategory,
        language: selectedLanguage,
        sort: selectedSort,
        tier: selectedTier,
        page: String(page),
        limit: '24',
      });

      const res = await fetch(`/api/marketplace/skills?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.success && Array.isArray(data.skills)) {
        if (page === 1) {
          setSkills(data.skills);
        } else {
          setSkills((prev) => {
            const existingIds = new Set(prev.map((s) => s.id));
            const newUnique = data.skills.filter((s: MarketplaceSkillRecord) => !existingIds.has(s.id));
            return [...prev, ...newUnique];
          });
        }
        setTotal(data.total || data.skills.length);
        setHasMore(Boolean(data.hasMore));
        setApiKeyConfigured(Boolean(data.skillsmpApiKeyConfigured));
      } else {
        throw new Error(data.error || 'Failed to load skills list');
      }
    } catch (err: any) {
      console.warn('[Cybrdeck Marketplace UI] Fetch error:', err);
      setError(err.message || 'Network error querying marketplace catalog');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [query, isAiSearch, selectedCategory, selectedLanguage, selectedSort, selectedTier, page]);

  useEffect(() => {
    fetchMarketplaceSkills(page > 1);
  }, [fetchMarketplaceSkills, page]);

  // Scroll Event Handler for Infinite Scroll Grid
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container || loading || loadingMore || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight - scrollTop - clientHeight < 300) {
      setPage((prev) => prev + 1);
    }
  };

  const [showEmbeddedModal, setShowEmbeddedModal] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.has('stripe_connect')) {
        const mode = searchParams.get('stripe_connect');
        if (mode === 'success') {
          toast({
            title: 'Stripe Creator Account Connected!',
            description: 'Your seller account is verified and ready for direct payouts.',
          });
          setShowEmbeddedModal(true);
        } else if (mode === 'refresh') {
          toast({
            title: 'Session Expired',
            description: 'Your onboarding session expired. Generating a fresh onboarding link...',
          });
          setShowEmbeddedModal(true);
        }
      }
    }
  }, [toast]);

  // The purchase ledger decides whether a premium card offers checkout or
  // a plain install: a paid skill must never present "Buy" twice.
  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/marketplace/purchases', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data?.skillIds)) setPurchasedIds(new Set(data.skillIds as string[]));
      } catch {
        // A failed ledger read leaves the button in buy mode; the
        // webhook's event dedupe keeps retries from double-fulfilling.
      }
    })();
  }, [user]);

  const handleStripeConnectOnboarding = () => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to set up creator payouts and publish skills.',
        variant: 'destructive',
      });
      return;
    }
    setShowEmbeddedModal(true);
  };

  const proceedToStripeOnboarding = () => {
    setShowLiabilityModal(false);
    setShowEmbeddedModal(true);
  };

  const handlePurchaseOrInstall = async (item: MarketplaceSkillRecord) => {
    setInstalling(item.id);
    try {
      if (item.price_cents > 0 && !purchasedIds.has(item.id)) {
        if (!user) {
          alert('Please sign in to purchase a skill.');
          setInstalling(null);
          return;
        }
        // Server derives buyerUserId from this verified token; the body only
        // carries the skillId, so a buyer cannot attribute a purchase to
        // another user.
        const idToken = await user.getIdToken();
        const res = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            skillId: item.id,
          }),
        });
        const data = await res.json();
        if (data.success && data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        } else {
          alert(`Checkout error: ${data.error}`);
          setInstalling(null);
          return;
        }
      }

      let promptContent = item.file_payload || '';
      if (!promptContent && item.download_url) {
        try {
          const res = await fetch(item.download_url);
          if (res.ok) promptContent = await res.text();
        } catch {
          promptContent = `# ${item.title}\n${item.description}`;
        }
      }
      // External payloads are untrusted text: cap them so a hostile or
      // bloated SKILL.md cannot flood the library, and start every
      // marketplace skill with no permissions at all — the manager's
      // toggles are the only way they get granted.
      if (promptContent.length > MAX_MARKETPLACE_SKILL_CHARS) {
        promptContent =
          promptContent.slice(0, MAX_MARKETPLACE_SKILL_CHARS) +
          '\n\n<!-- truncated: payload exceeded the marketplace install cap -->';
      }

      const newSkill: Skill = {
        id: item.id,
        name: item.title,
        description: item.description,
        prompt: promptContent || `# ${item.title}\n${item.description}`,
        permissions: { webSearch: false, runCommands: false },
        isMarketplace: true,
      };

      onInstall(newSkill);
    } catch (err) {
      console.error('[SkillsMarketplace] install/purchase failed', err);
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background text-foreground select-none overflow-hidden">
      {/* Top Navigation Bar */}
      <div className="flex h-14 items-center justify-between border-b border-border px-6 shrink-0 bg-card z-10">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Icon name="arrow-left-md" className="h-4 w-4" />
            Back to Editor
          </Button>
          <span className="text-zinc-600">|</span>
          <div className="flex items-center gap-2">
            <Icon name="shopping-bag-01" className="h-4 w-4 text-purple-400" />
            <h2 className="text-sm font-semibold">Cybrdeck AI Skills & Tools Marketplace</h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={handleStripeConnectOnboarding}
            disabled={onboarding}
            className="h-8 text-xs font-semibold border-purple-500/40 text-purple-300 hover:bg-purple-900/30 gap-1.5"
          >
            {onboarding ? <Icon name="loading" className="h-3.5 w-3.5 animate-spin" /> : <Icon name="user-check" className="h-3.5 w-3.5" />}
            Have A Skill to Sell? Come Aboard!
          </Button>

          <Badge
            variant="outline"
            className={
              apiKeyConfigured
                ? 'border-emerald-500/50 bg-emerald-950/30 text-emerald-300 text-[10px] font-mono gap-1.5'
                : 'border-zinc-700 bg-zinc-900 text-zinc-400 text-[10px] font-mono gap-1.5'
            }
          >
            <span className={apiKeyConfigured ? 'h-2 w-2 rounded-full bg-emerald-400 animate-pulse' : 'h-2 w-2 rounded-full bg-amber-400'} />
            {apiKeyConfigured ? 'CYBRDECK SYNC LIVE' : 'OFFLINE LOCAL INDEX'}
          </Badge>
        </div>
      </div>

      {/* Main Continuous Scrollable Container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-6 scroll-smooth"
      >
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* Header Title & Filter Control Panel */}
          <div className="flex flex-col space-y-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Discover & Install AI Agent Skills
              </h1>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                Rebranded Cybrdeck global skills catalog & peer-to-peer creator store. Access over 2 million collected <code className="text-purple-300">SKILL.md</code> definitions with real-time vector search.
              </p>
            </div>

            {/* REST API Search & Filter Controls */}
            <div className="p-4 rounded-xl bg-card/70 border border-border space-y-3 shadow-lg">
              <div className="flex flex-col md:flex-row items-center gap-3">
                {/* Search Bar */}
                <div className="relative flex-1 w-full">
                  <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder={isAiSearch ? "Describe what you want your AI agent to do (AI Natural Language Match)..." : "Search skills by keyword (e.g. Jest, Stripe, Docker, Python)..."}
                    value={query}
                    onChange={(e) => handleFilterChange(setQuery, e.target.value)}
                    className="w-full h-10 pl-9 pr-4 text-xs rounded-lg border border-border bg-background/80 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                {/* AI Match Toggle Button */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleFilterChange(setIsAiSearch, !isAiSearch)}
                  className={
                    isAiSearch
                      ? 'h-10 px-4 text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white border-purple-400 shadow-lg gap-2 shrink-0'
                      : 'h-10 px-4 text-xs font-semibold border-white/20 bg-white/5 hover:bg-white/10 text-zinc-300 gap-2 shrink-0'
                  }
                >
                  <Bot className="h-4 w-4" />
                  {isAiSearch ? '🤖 AI Match Active' : 'Keyword Mode'}
                </Button>
              </div>

              {/* Filter Selectors */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5 text-xs">
                <span className="text-[10px] text-muted-foreground font-mono uppercase flex items-center gap-1">
                  <Icon name="filter" className="h-3 w-3" /> Filters:
                </span>

                <select
                  value={selectedCategory}
                  onChange={(e) => handleFilterChange(setSelectedCategory, e.target.value)}
                  className="h-8 px-2.5 rounded-md border border-border bg-background text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="all">All Categories</option>
                  <option value="development">Development</option>
                  <option value="security">Security</option>
                  <option value="data & ml">Data & ML</option>
                  <option value="devops">DevOps & Cloud</option>
                  <option value="workflow">Workflow & Automation</option>
                </select>

                <select
                  value={selectedLanguage}
                  onChange={(e) => handleFilterChange(setSelectedLanguage, e.target.value)}
                  className="h-8 px-2.5 rounded-md border border-border bg-background text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="all">All Languages</option>
                  <option value="english">English</option>
                  <option value="typescript">TypeScript</option>
                  <option value="python">Python</option>
                </select>

                <select
                  value={selectedTier}
                  onChange={(e) => handleFilterChange(setSelectedTier, e.target.value)}
                  className="h-8 px-2.5 rounded-md border border-border bg-background text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="all">All Tiers</option>
                  <option value="free_public">Free Public</option>
                  <option value="premium_native">Premium Native Creator</option>
                </select>

                <select
                  value={selectedSort}
                  onChange={(e) => handleFilterChange(setSelectedSort, e.target.value)}
                  className="h-8 px-2.5 rounded-md border border-border bg-background text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500 ml-auto"
                >
                  <option value="popularity">Popularity Score</option>
                  <option value="stars">Star Rating</option>
                  <option value="trending">Trending Now</option>
                  <option value="recent">Recently Added</option>
                </select>
              </div>
            </div>
          </div>

          {/* Initial Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
              <Icon name="loading" className="h-7 w-7 animate-spin text-purple-400" />
              <p className="text-xs font-mono">Querying Cybrdeck global skill index...</p>
            </div>
          )}

          {/* Error Message */}
          {error && !loading && (
            <div className="flex flex-col items-center gap-2 py-24 text-destructive text-xs">
              <Icon name="circle-warning" className="h-5 w-5" />
              <p>Marketplace search error: {error}</p>
              <Button variant="outline" size="sm" onClick={() => fetchMarketplaceSkills()}>Retry Search</Button>
            </div>
          )}

          {/* Continuous Scrollable Grid Layout */}
          {!loading && !error && (
            <div className="space-y-6">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                <span>Displaying {skills.length} of {total} skills in catalog</span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {skills.map((item) => {
                  const isInstalled = installedSkillIds.includes(item.id);
                  const isInstalling = installing === item.id;
                  const isPremium = item.tier === 'premium_native' && item.price_cents > 0;
                  const isPurchased = purchasedIds.has(item.id);

                  return (
                    <Card key={item.id} className="flex flex-col border-border bg-card/60 backdrop-blur-md transition-all hover:border-purple-500/40 hover:bg-card">
                      <CardHeader className="p-4 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {item.is_trending && (
                              <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/40 text-[9px] px-1.5 py-0 font-bold gap-1">
                                <Flame className="h-3 w-3 text-rose-400 fill-rose-400" />
                                Trending
                              </Badge>
                            )}
                            <Badge variant="outline" className="bg-black/40 text-amber-300 border-amber-400/30 text-[9px] px-1.5 py-0 font-mono gap-1">
                              <Icon name="star" className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                              {item.popularity_score}
                            </Badge>
                          </div>

                          <Badge
                            variant="outline"
                            className={
                              item.tier === 'premium_native'
                                ? 'border-purple-500/50 bg-purple-500/10 text-purple-300 text-[9px]'
                                : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300 text-[9px]'
                            }
                          >
                            {item.tier === 'premium_native' ? '💎 Creator' : 'FREE'}
                          </Badge>
                        </div>

                        <CardTitle className="text-sm font-bold leading-snug text-white">
                          {item.title}
                        </CardTitle>

                        <CardDescription className="text-xs text-muted-foreground line-clamp-2 min-h-[32px]">
                          {item.description}
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="px-4 pb-4 pt-0 flex-1 flex flex-col justify-end space-y-2">
                        <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono pt-2 border-t border-white/5">
                          <span className="flex items-center gap-1">
                            <Icon name="shield-check" className="h-3 w-3 text-purple-400" />
                            Source: {item.source_platform.toUpperCase()}
                          </span>
                          <span className="font-semibold text-white">
                            {item.price_cents > 0 ? `$${(item.price_cents / 100).toFixed(2)}` : 'FREE'}
                          </span>
                        </div>
                      </CardContent>

                      <CardFooter className="p-4 border-t border-border bg-muted/10">
                        <Button
                          variant={isInstalled ? 'secondary' : isPremium ? 'default' : 'outline'}
                          size="sm"
                          className={
                            isInstalled
                              ? 'w-full h-8 text-xs font-semibold gap-1.5'
                              : isPremium
                              ? 'w-full h-8 text-xs font-semibold gap-1.5 bg-purple-600 hover:bg-purple-500 text-white shadow-md'
                              : 'w-full h-8 text-xs font-semibold gap-1.5 border-white/20 hover:bg-white/10'
                          }
                          onClick={() => !isInstalled && !isInstalling && handlePurchaseOrInstall(item)}
                          disabled={isInstalled || isInstalling}
                        >
                          {isInstalled ? (
                            <>
                              <Icon name="check" className="h-3.5 w-3.5 text-emerald-400" />
                              Installed
                            </>
                          ) : isInstalling ? (
                            <>
                              <Icon name="loading" className="h-3.5 w-3.5 animate-spin" />
                              Processing…
                            </>
                          ) : isPremium && !isPurchased ? (
                            <>
                              <Icon name="credit-card" className="h-3.5 w-3.5 text-purple-200" />
                              Buy with Stripe (${(item.price_cents / 100).toFixed(2)})
                            </>
                          ) : isPremium ? (
                            <>
                              <Icon name="download" className="h-3.5 w-3.5" />
                              Add to Library (Purchased)
                            </>
                          ) : (
                            <>
                              <Icon name="download" className="h-3.5 w-3.5" />
                              Add to Library
                            </>
                          )}
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>

              {/* Infinite Scroll Loading More Bar */}
              {loadingMore && (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-purple-300 font-mono">
                  <Icon name="loading" className="h-4 w-4 animate-spin" />
                  Loading more skills from Cybrdeck index...
                </div>
              )}

              {/* Load More Manual Trigger if available */}
              {hasMore && !loadingMore && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    className="h-9 px-6 text-xs font-semibold border-purple-500/40 text-purple-300 hover:bg-purple-900/30 gap-2"
                  >
                    <Icon name="refresh" className="h-3.5 w-3.5" /> Load More Skills
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Creator Responsibilities & Liability Agreement Modal */}
      {showLiabilityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative bg-slate-950/95 border border-purple-500/30 rounded-2xl max-w-lg w-full shadow-2xl p-6 text-slate-100 font-body space-y-5 overflow-hidden">
            <button
              onClick={() => setShowLiabilityModal(false)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white transition-colors"
            >
              <Icon name="close-md" className="h-4 w-4" />
            </button>

            <div>
              <h2 className="text-xl font-headline font-bold text-white tracking-tight flex items-center gap-2">
                <Icon name="shield-check" className="h-5 w-5 text-purple-400" />
                Liability & Creator Responsibilities
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Review and acknowledge your responsibilities before onboarding with Stripe Connect.
              </p>
            </div>

            <div className="space-y-3 bg-slate-900/60 p-4 rounded-xl border border-white/10 text-xs max-h-64 overflow-y-auto">
              <div className="font-semibold text-slate-200 uppercase tracking-wider text-[10px] text-purple-400">
                Your Responsibilities:
              </div>

              {/* 1. Chargebacks and Fines */}
              <div className="p-3 bg-black/40 border border-white/5 rounded-lg space-y-1">
                <div className="font-semibold text-white flex items-center gap-1.5 text-xs">
                  <Icon name="circle-warning" className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  Chargebacks and Fines
                </div>
                <p className="text-[11px] text-slate-300 leading-normal">
                  You'll be responsible for chargebacks, unauthorized transactions, and fines associated with your listings or published skills.
                </p>
              </div>

              {/* 2. Onboarding and Compliance */}
              <div className="p-3 bg-black/40 border border-white/5 rounded-lg space-y-1">
                <div className="font-semibold text-white flex items-center gap-1.5 text-xs">
                  <Icon name="shield-check" className="h-3.5 w-3.5 text-brand-400 shrink-0" />
                  Onboarding and Compliance
                </div>
                <p className="text-[11px] text-slate-300 leading-normal">
                  You'll review each seller listing/skill to ensure you're not operating in a restricted business category, spreading malicious software, or selling prohibited digital assets.
                </p>
              </div>

              {/* 3. Support for Payment & Risk Inquiries */}
              <div className="p-3 bg-black/40 border border-white/5 rounded-lg space-y-1">
                <div className="font-semibold text-white flex items-center gap-1.5 text-xs">
                  <Bot className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                  Support for Payment and Risk Inquiries
                </div>
                <p className="text-[11px] text-slate-300 leading-normal">
                  You'll provide support to buyers, educate them on your risk management processes, and guide them through remediation if technical issues arise.
                </p>
              </div>

              {/* 4. Revenue Split */}
              <div className="p-3 bg-purple-950/30 border border-purple-500/20 rounded-lg space-y-1">
                <div className="font-semibold text-purple-300 flex items-center gap-1.5 text-xs">
                  <Icon name="credit-card" className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                  70/30 Net Payout Split
                </div>
                <p className="text-[11px] text-purple-200/80 leading-normal">
                  Cybrdeck retains a 30% platform fee for hosting, security, and marketplace infrastructure, and routes 70% net revenue directly to your Stripe Connect account.
                </p>
              </div>
            </div>

            {/* Checkbox Acknowledgment */}
            <label className="flex items-start gap-3 p-3 bg-purple-900/20 border border-purple-500/30 rounded-xl cursor-pointer hover:bg-purple-900/30 transition-colors">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-purple-400 bg-black/50 text-purple-600 focus:ring-purple-500 accent-purple-500 cursor-pointer"
              />
              <span className="text-xs text-slate-200 font-medium leading-snug">
                I acknowledge I have reviewed and agree to my responsibilities as a Cybrdeck Creator.
              </span>
            </label>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowLiabilityModal(false)}
                className="text-xs border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={proceedToStripeOnboarding}
                disabled={!agreedToTerms || onboarding}
                className="text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold gap-2 disabled:opacity-40"
              >
                {onboarding ? <Icon name="loading" className="h-3.5 w-3.5 animate-spin" /> : <Icon name="user-check" className="h-3.5 w-3.5" />}
                Agree & Proceed to Stripe Onboarding
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Stripe Connect Embedded Account Onboarding Modal */}
      <StripeEmbeddedOnboardingModal
        isOpen={showEmbeddedModal}
        onClose={() => setShowEmbeddedModal(false)}
        creatorUserId={user?.uid || 'usr_current_creator_123'}
        email={user?.email || 'creator@antigravity.ai'}
      />
    </div>
  );
}
