"use client"

import React, { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/icon';
import { useFirestore, useUser } from '@/firebase';
import EmojiPicker from '../community/EmojiPicker';
import { collection, query, addDoc, serverTimestamp, onSnapshot, orderBy } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Award } from 'lucide-react';

interface ForumPost {
  id: string;
  title: string;
  content: string;
  category: 'announcement' | 'security' | 'proposal';
  authorName: string;
  authorEmail: string;
  createdAt: any;
}

export default function AgentForum() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<'announcement' | 'security' | 'proposal'>('announcement');

  useEffect(() => {
    if (!firestore || !user) return;

    let unsubscribe = () => {}; 
    let isMounted = true; 

    const initForum = async () => {
      setLoading(true);

      try {
        // 1. Force the token refresh
        const idTokenResult = await user.getIdTokenResult(true);
        console.log("[AgentForum] Current Token Claims:", idTokenResult.claims);

        // 2. Buffer to let Firestore WebSocket re-authenticate with the new token
        await new Promise(resolve => setTimeout(resolve, 500));

        // 3. Build the query
        const q = query(
          collection(firestore, 'forum_posts'),
          orderBy('createdAt', 'desc')
        );

        // 4. Start the listener
        if (isMounted) {
          unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched: ForumPost[] = [];
            snapshot.forEach(doc => {
              fetched.push({ id: doc.id, ...doc.data() } as ForumPost);
            });
            setPosts(fetched);
            setLoading(false);
          }, (error) => {
            console.error(`[AgentForum] Permission error for ${user?.email} (${user?.uid}):`, error.code);
            setLoading(false);
          });
        }
      } catch (err) {
        console.error("[AgentForum] Failed to refresh token:", err);
        setLoading(false);
      }
    };

    initForum();

    return () => {
      isMounted = false;
      unsubscribe(); 
    };
  }, [firestore, user]);

  const handleSubmitPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !user || !title.trim() || !content.trim()) return;
    setIsSubmitting(true);

    try {
      await addDoc(collection(firestore, 'forum_posts'), {
        title: title.trim(),
        content: content.trim(),
        category,
        authorName: user.displayName || user.email?.split('@')[0] || 'Unknown Agent',
        authorEmail: user.email || '',
        createdAt: serverTimestamp(),
      });

      toast({ title: "Bulletin Pinned", description: "Your message has been broadcasted to the agent forum." });
      setTitle('');
      setContent('');
      setCategory('announcement');
    } catch (e: any) {
      console.error("Failed to post message", e);
      toast({ title: "Broadcast Failure", description: e.message || "Failed to post.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCategoryBadge = (cat: ForumPost['category']) => {
    switch (cat) {
      case 'announcement':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
            <Icon name="map-pin" className="w-2.5 h-2.5" /> Announcement
          </span>
        );
      case 'security':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase">
            <Icon name="shield-warning" className="w-2.5 h-2.5" /> Security Threat
          </span>
        );
      case 'proposal':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase">
            <Award className="w-2.5 h-2.5" /> Collaboration
          </span>
        );
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Left Column: Post Form */}
      <div className="lg:col-span-1 space-y-6">
        <div className="border-b border-border pb-4">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Icon name="terminal" className="h-6 w-6 text-primary" />
            Agent Forum
          </h1>
          <p className="text-xs text-muted-foreground mt-1 uppercase font-mono">
            Secure Monospaced Bulletin Board
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-lg">
          <h3 className="text-sm font-mono font-bold text-white/70 uppercase mb-4 tracking-wider">
            Pin New Announcement
          </h3>
          
          <form onSubmit={handleSubmitPost} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider block">Bulletin Category</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setCategory('announcement')}
                  className={`py-1.5 px-2 rounded-lg text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                    category === 'announcement'
                      ? 'bg-blue-500/15 border-blue-500/40 text-blue-400'
                      : 'bg-black/20 border-white/5 text-white/40 hover:text-white/70'
                  }`}
                >
                  Global
                </button>
                <button
                  type="button"
                  onClick={() => setCategory('security')}
                  className={`py-1.5 px-2 rounded-lg text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                    category === 'security'
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                      : 'bg-black/20 border-white/5 text-white/40 hover:text-white/70'
                  }`}
                >
                  Security
                </button>
                <button
                  type="button"
                  onClick={() => setCategory('proposal')}
                  className={`py-1.5 px-2 rounded-lg text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                    category === 'proposal'
                      ? 'bg-purple-500/15 border-purple-500/40 text-purple-400'
                      : 'bg-black/20 border-white/5 text-white/40 hover:text-white/70'
                  }`}
                >
                  Proposal
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider block">Subject</label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Brief summary header..."
                required
                maxLength={80}
                className="bg-background/50 font-mono"
              />
            </div>

            <div className="space-y-1 relative">
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider block">Transmission Content</label>
                <EmojiPicker
                  onSelect={(emoji) => setContent((prev) => prev + emoji)}
                  className="absolute right-0 top-0"
                />
              </div>
              <Textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Broadcast your coordinates, threat intel, or request partner assistance..."
                required
                rows={5}
                className="bg-background/50 font-mono resize-none leading-relaxed"
              />
            </div>

            <Button 
              type="submit" 
              disabled={isSubmitting} 
              className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Icon name="loading" className="w-3.5 h-3.5 animate-spin" /> Broadcasting...
                </>
              ) : (
                <>
                  <Icon name="paper-plane" className="w-3.5 h-3.5" /> Broadcast Node
                </>
              )}
            </Button>
          </form>
        </div>
      </div>

      {/* Right Column: Bulletin Board Posts */}
      <div className="lg:col-span-2 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground font-mono text-xs">
            <Icon name="loading" className="h-6 w-6 animate-spin mb-3 text-primary" />
            <span>MOUNTING BULLETIN ENCRYPTIONS...</span>
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-border rounded-xl bg-background/50">
            <Icon name="message" className="h-10 w-10 text-muted-foreground mb-3 opacity-40" />
            <h3 className="text-sm font-mono font-bold text-foreground uppercase">Board is Empty</h3>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              No bulletin announcements mapped to the network yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1 custom-scrollbar">
            {posts.map(post => (
              <div 
                key={post.id} 
                className="bg-card border border-border/80 rounded-xl p-5 hover:border-border transition-all flex flex-col justify-between font-mono"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2">
                    {getCategoryBadge(post.category)}
                    
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Icon name="user" className="w-3 h-3" /> {post.authorName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Icon name="calendar" className="w-3 h-3" />
                        {post.createdAt && typeof post.createdAt === 'object' && 'seconds' in post.createdAt
                          ? new Date(post.createdAt.seconds * 1000).toLocaleDateString()
                          : 'Just now'}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-white tracking-tight uppercase">
                    {post.title}
                  </h3>
                  
                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono bg-black/20 p-4 rounded-lg border border-white/5">
                    {post.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
