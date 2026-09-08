'use client';

import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ShowcaseItem {
  id: string;
  title: string;
  itemType: 'prototype' | 'video' | 'music' | 'image' | 'report';
  itemUrl?: string;
  codeSnippet?: string;
  publishedAt: string;
}

export default function SharePage() {
  const params = useParams();
  const id = params?.id as string;
  const { toast } = useToast();
  const [item, setItem] = useState<ShowcaseItem | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && id) {
      const stored = JSON.parse(localStorage.getItem('cybrdeck_public_showcases') || '[]');
      const found = stored.find((s: ShowcaseItem) => s.id === id);
      if (found) {
        setItem(found);
      } else {
        // Fallback placeholder for demonstration
        setItem({
          id,
          title: `Public Prototype Showcase (${id.slice(0, 8)})`,
          itemType: 'prototype',
          codeSnippet: `export default function CybrdeckDemo() {\n  return (\n    <div className="p-8 bg-zinc-950 text-white rounded-xl border border-white/10 text-center">\n      <h2 className="text-xl font-bold text-primary">Powered by Cybrdeck Engine</h2>\n      <p className="text-xs text-zinc-400 mt-2">Autonomous Prototyping & AI Orchestration</p>\n    </div>\n  );\n}`,
          publishedAt: new Date().toISOString(),
        });
      }
    }
  }, [id]);

  const handleCopyCode = () => {
    if (item?.codeSnippet) {
      navigator.clipboard.writeText(item.codeSnippet);
      setCopied(true);
      toast({
        title: 'Code Copied!',
        description: 'TSX prototype code copied to clipboard.',
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!item) {
    return (
      <div className="min-h-dvh bg-zinc-950 text-white flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <Sparkles className="h-8 w-8 text-primary animate-spin mx-auto" />
          <p className="text-sm font-mono text-zinc-400">Loading public showcase artifact...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-zinc-950 text-white selection:bg-primary selection:text-primary-foreground">
      {/* Header Bar */}
      <header className="h-14 border-b border-white/10 px-6 flex items-center justify-between bg-zinc-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Link
            href="/playground/app"
            className="text-xs font-semibold text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors"
          >
            <Icon name="arrow-left-md" className="h-4 w-4" /> Back to Playground
          </Link>
          <span className="text-zinc-600">|</span>
          <span className="text-xs font-mono text-primary font-bold uppercase tracking-wider">
            Cybrdeck Public Showcase
          </span>
        </div>

        <Link href="/playground/app">
          <Button size="sm" className="bg-primary text-primary-foreground font-semibold text-xs gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Open in Chat Workbench
          </Button>
        </Link>
      </header>

      {/* Main Content Area */}
      <div className="max-w-4xl mx-auto p-6 md:p-12 space-y-8">
        <div className="space-y-3 border-b border-white/10 pb-6">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-primary/10 border border-primary/20 text-primary">
              {item.itemType}
            </span>
            <span className="text-xs font-mono text-zinc-500">Published {new Date(item.publishedAt).toLocaleDateString()}</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">{item.title}</h1>
        </div>

        {/* Code / Media Render Card */}
        {item.codeSnippet && (
          <div className="rounded-xl border border-white/10 bg-zinc-900/80 overflow-hidden shadow-2xl space-y-0">
            <div className="h-10 px-4 bg-zinc-900 border-b border-white/10 flex items-center justify-between">
              <span className="text-xs font-mono text-zinc-400 flex items-center gap-1.5">
                <Icon name="code" className="h-3.5 w-3.5 text-primary" /> React TSX Prototype Code
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopyCode}
                className="h-7 text-xs text-zinc-300 hover:text-white gap-1.5"
              >
                {copied ? <Icon name="check" className="h-3.5 w-3.5 text-emerald-400" /> : <Icon name="copy" className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy TSX'}
              </Button>
            </div>
            <pre className="p-4 text-xs font-mono text-zinc-200 overflow-x-auto leading-relaxed bg-zinc-950">
              <code>{item.codeSnippet}</code>
            </pre>
          </div>
        )}

        {/* Media Player if URL exists */}
        {item.itemUrl && item.itemType === 'video' && (
          <div className="rounded-xl border border-white/10 overflow-hidden bg-black aspect-video flex items-center justify-center">
            <video src={item.itemUrl} controls className="w-full h-full object-contain" />
          </div>
        )}

        {item.itemUrl && item.itemType === 'image' && (
          <div className="rounded-xl border border-white/10 overflow-hidden bg-black p-2 flex items-center justify-center">
            <img src={item.itemUrl} alt={item.title} className="max-h-96 rounded-lg object-contain" />
          </div>
        )}
      </div>
    </main>
  );
}
