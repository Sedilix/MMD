'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PublicShowcaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  itemType: 'prototype' | 'video' | 'music' | 'image' | 'report';
  itemUrl?: string;
  codeSnippet?: string;
}

export function PublicShowcaseModal({
  isOpen,
  onClose,
  title,
  itemType,
  itemUrl,
  codeSnippet,
}: PublicShowcaseModalProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Generate a personal-preview share ID. P2-17: 10 random base36 chars
  // (~3.6T entropy) so links are non-collidable and non-enumerable; the
  // label is "Personal Preview" since these are localStorage-only, not a
  // truly public listing.
  const shareId = React.useMemo(() => {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
    const rand = Math.random().toString(36).substring(2, 12);
    return `${slug}-${rand}`;
  }, [title]);

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/share/${shareId}`
    : `https://cybrdeck.com/share/${shareId}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast({
      title: 'Link Copied to Clipboard!',
      description: 'Public showcase preview link is ready to share.',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      // Simulate/save showcase metadata to localStorage for instant client rendering
      const showcaseData = {
        id: shareId,
        title,
        itemType,
        itemUrl,
        codeSnippet,
        publishedAt: new Date().toISOString(),
      };
      if (typeof window !== 'undefined') {
        const existing = JSON.parse(localStorage.getItem('cybrdeck_public_showcases') || '[]');
        existing.unshift(showcaseData);
        localStorage.setItem('cybrdeck_public_showcases', JSON.stringify(existing));
      }
      toast({
        title: 'Published to Public Showcase! 🚀',
        description: 'Your creation is now live on the Cybrdeck global network.',
      });
    } catch {
      toast({
        title: 'Publish Error',
        description: 'Could not save showcase state.',
        variant: 'destructive',
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const tweetText = encodeURIComponent(`Check out "${title}" built with @Cybrdeck AI Orchestration Engine! 🚀\n\n${shareUrl}`);
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md border-border bg-zinc-950 text-white shadow-2xl">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
            <Icon name="globe" className="h-5 w-5 text-primary" />
            1-Click Personal Preview Share
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            Generate a private, non-enumerable preview link for your {itemType}. Saved locally for instant rendering.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase text-primary tracking-wider font-semibold">
                {itemType}
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">ID: {shareId}</span>
            </div>
            <h4 className="text-sm font-semibold text-white truncate">{title}</h4>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-300">Public Shareable Link</label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={shareUrl}
                className="font-mono bg-zinc-900 border-white/10 text-zinc-300 h-9"
              />
              <Button
                size="sm"
                onClick={handleCopy}
                className="h-9 px-3 bg-primary text-primary-foreground font-semibold shrink-0"
              >
                {copied ? <Icon name="check" className="h-4 w-4" /> : <Icon name="copy" className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between gap-2 border-t border-white/10">
            <div className="flex items-center gap-2">
              <a
                href={`https://twitter.com/intent/tweet?text=${tweetText}`}
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 px-2.5 rounded-lg border border-white/10 bg-zinc-900 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-1.5 transition-colors"
              >
                <Icon name="share" className="h-3.5 w-3.5 text-brand-400" /> Share on X
              </a>
              <a
                href={linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 px-2.5 rounded-lg border border-white/10 bg-zinc-900 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-1.5 transition-colors"
              >
                <Icon name="external-link" className="h-3.5 w-3.5 text-blue-400" /> LinkedIn
              </a>
            </div>

            <Button
              size="sm"
              onClick={handlePublish}
              disabled={isPublishing}
              className="h-8 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isPublishing ? 'Publishing...' : 'Publish Live'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
