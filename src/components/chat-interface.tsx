"use client"

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sparkles,
  Mic,
  MicOff,
  ImageIcon as LucideImage,
  Volume2,
  VolumeX,
  RotateCcw,
  Send,
  User,
  SlidersHorizontal,
} from 'lucide-react';
import { mvpConsultantChat } from '@/ai/flows/mvp-consultant-flow';
import { cn } from '@/lib/utils';
import { useRoster } from '@/hooks/use-roster';
import { useFirestore, useUser } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import NextImage from 'next/image';

interface Message {
  role: 'user' | 'model';
  content: string;
  inferredSkills?: string[];
  showSpecialists?: boolean;
  images?: string[];
}

const SUGGESTED_PROMPTS = [
  'Design an MVP roadmap & tech stack',
  'Match specialists for my development team',
  'Review unit economics & launch strategy',
  'Explore AI architecture & APIs',
];

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1024;
        const MAX_HEIGHT = 1024;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => resolve(e.target?.result as string);
      img.src = e.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

const slug = (subs: string[]) =>
  new RegExp(`\\b(?:${subs.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');

const HARD_BLOCKLIST_RE = slug([
  'faggot',
  'fag',
  'kike',
  'nigger',
  'nigga',
  'chink',
  'spic',
  'wetback',
  'tranny',
  'retard',
  'paki',
  'towelhead',
]);

const SOFT_WARN_RE = slug(['whore', 'cunt', 'bitch']);

function classifyMessage(text: string): { kind: 'blocked' | 'warn' | null; reason: string } {
  const trimmed = text.trim();
  if (!trimmed) return { kind: null, reason: '' };
  if (HARD_BLOCKLIST_RE.test(trimmed)) {
    return {
      kind: 'blocked',
      reason: 'Message contains language that violates community guidelines. Rephrase and try again.',
    };
  }
  if (SOFT_WARN_RE.test(trimmed)) {
    return {
      kind: 'warn',
      reason: 'Consider rephrasing if you meant to ask a development or product question.',
    };
  }
  return { kind: null, reason: '' };
}

export function ChatInterface({ terminal = false }: { terminal?: boolean }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConversationMode, setIsConversationMode] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('sarah');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pitch, setPitch] = useState<number>(1.0);
  const [speed, setSpeed] = useState<number>(1.0);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [inputHint, setInputHint] = useState<{ kind: 'blocked' | 'warn'; message: string } | null>(null);
  const { toast } = useToast();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const smClientRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [playingMsgIndex, setPlayingMsgIndex] = useState<number | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioContextRef = useRef<AudioContext | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const vadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleSendRef = useRef<((textToSend?: string) => Promise<void>) | null>(null);
  const isConnectingRef = useRef<boolean>(false);
  const lastTranscriptRef = useRef<string>('');
  const { members } = useRoster();
  const firestore = useFirestore();
  const { user } = useUser();
  const sessionIdRef = useRef<string>('');

  useEffect(() => {
    sessionIdRef.current = Math.random().toString(36).substring(2, 15);
  }, []);

  // Initial greeting message when empty
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          role: 'model',
          content:
            "Hello! I am One Assistant. I can help you plan your architecture, build an MVP roadmap, or match you with vetted specialists for your project.\n\nTell me what you're working on, or pick a suggested topic below to begin.",
        },
      ]);
    }
  }, [messages.length]);

  useEffect(() => {
    if (messagesEndRef.current) {
      const viewport = messagesEndRef.current.closest('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      } else {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [messages, isLoading]);

  const playTTS = async (text: string, msgIndex?: number) => {
    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if (currentAudioContextRef.current) {
        try {
          activeSourcesRef.current.forEach((s) => {
            try {
              s.stop();
            } catch {}
          });
          activeSourcesRef.current = [];
          currentAudioContextRef.current.close();
        } catch {}
        currentAudioContextRef.current = null;
      }

      if (playingMsgIndex === msgIndex) {
        setPlayingMsgIndex(null);
        return;
      }

      if (msgIndex !== undefined) setPlayingMsgIndex(msgIndex);

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: selectedVoice,
          output_format: 'mp3',
          voice_settings: { speed, pitch },
        }),
      });

      if (!res.ok) throw new Error('TTS API error');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;

      audio.onended = () => {
        setPlayingMsgIndex(null);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setPlayingMsgIndex(null);
        URL.revokeObjectURL(url);
      };

      await audio.play();
    } catch (e) {
      console.warn('TTS playback error:', e);
      setPlayingMsgIndex(null);
    }
  };

  const handleSend = useCallback(
    async (textToSend?: string) => {
      const content = typeof textToSend === 'string' ? textToSend : input;
      if ((!content.trim() && uploadedImages.length === 0) || isLoading) return;

      const userMsg = content.trim();
      const currentImages = [...uploadedImages];

      setInput('');
      setUploadedImages([]);
      setInputHint(null);

      const newHistory: Message[] = [
        ...messages,
        { role: 'user', content: userMsg, images: currentImages.length > 0 ? currentImages : undefined },
      ];
      setMessages(newHistory);
      setIsLoading(true);

      try {
        const historyForAi = newHistory.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const result = await mvpConsultantChat({
          message: userMsg,
          history: historyForAi.slice(0, -1),
          images: currentImages,
        });

        setMessages((prev) => [
          ...prev,
          {
            role: 'model',
            content: result.response,
            inferredSkills: result.inferredSkills,
            showSpecialists: result.inferredSkills && result.inferredSkills.length > 0,
          },
        ]);

        if (firestore) {
          const chatsCol = collection(firestore, 'chats');
          addDoc(chatsCol, {
            sessionId: sessionIdRef.current,
            userId: user?.uid || 'anonymous',
            prompt: userMsg,
            response: result.response,
            inferredSkills: result.inferredSkills || [],
            timestamp: serverTimestamp(),
          }).catch((e) => console.error('Failed to log chat:', e));
        }

        if (isConversationMode) {
          playTTS(result.response);
        }
      } catch (error) {
        console.error('Chat error:', error);
        setMessages((prev) => [
          ...prev,
          { role: 'model', content: 'We encountered an error processing your request. Please try again.' },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [input, uploadedImages, isLoading, messages, isConversationMode, firestore, user]
  );

  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  const handleClearChat = () => {
    setMessages([
      {
        role: 'model',
        content:
          "Conversation reset. What new project or feature would you like to discuss?",
      },
    ]);
    setSelectedAgentIds([]);
  };

  return (
    <div className="flex flex-col h-full bg-[#020912] text-zinc-100 relative overflow-hidden select-none">
      {/* Executive Header */}
      <div className="h-12 px-4 border-b border-white/[0.08] bg-white/[0.02] flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center p-1 shrink-0">
            <NextImage
              src="/cybrdeck-logo/cybrdeck_icon_transparent.png"
              alt="Cybrdeck"
              width={18}
              height={18}
              className="object-contain"
            />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white tracking-tight">One Assistant</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-medium text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Online
              </span>
            </div>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-1.5">
          {/* Voice Selector & Settings Toggle */}
          <div className="relative">
            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={cn(
                'p-1.5 rounded-lg text-zinc-400 hover:text-white transition-colors border border-transparent hover:border-white/10 hover:bg-white/[0.04]',
                isSettingsOpen && 'text-brand-400 bg-white/[0.06] border-white/15'
              )}
              title="Voice Settings"
              aria-label="Voice settings"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>

            {isSettingsOpen && (
              <div className="absolute right-0 top-9 w-60 p-3.5 rounded-2xl bg-[#030d1a] border border-white/15 backdrop-blur-xl shadow-2xl z-50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-white">Voice Settings</span>
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="text-zinc-500 hover:text-zinc-300 text-xs"
                  >
                    Done
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400">Voice Persona</label>
                  <select
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    className="w-full h-8 px-2 rounded-lg bg-white/[0.05] text-zinc-200 text-xs border border-white/10 outline-none cursor-pointer"
                  >
                    <option value="sarah">Sarah (Natural)</option>
                    <option value="ariana">Ariana (Expressive)</option>
                    <option value="george">George (Authoritative)</option>
                    <option value="charlie">Charlie (Dynamic)</option>
                    <option value="oliver">Oliver (Calm)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-zinc-400">
                    <span>Speed</span>
                    <span className="text-zinc-200 font-medium">{speed.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.7"
                    max="1.5"
                    step="0.1"
                    value={speed}
                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                    className="w-full h-1 accent-brand-400 bg-white/20 appearance-none rounded-full cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Reset Chat */}
          <button
            onClick={handleClearChat}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white transition-colors border border-transparent hover:border-white/10 hover:bg-white/[0.04]"
            title="Reset Conversation"
            aria-label="Reset Conversation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <ScrollArea className="flex-1 p-4 bg-transparent">
        <div className="space-y-4 max-w-full">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                'flex gap-2.5 animate-in fade-in slide-in-from-bottom-1 duration-200',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {msg.role === 'model' && (
                <div className="w-6 h-6 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0 mt-1">
                  <Sparkles className="w-3 h-3 text-brand-400" />
                </div>
              )}

              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed transition-all',
                  msg.role === 'user'
                    ? 'bg-brand-500 text-zinc-950 font-medium rounded-tr-xs shadow-sm'
                    : 'bg-white/[0.04] border border-white/10 text-zinc-200 rounded-tl-xs shadow-sm'
                )}
              >
                {/* Images */}
                {msg.images && msg.images.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {msg.images.map((img, idx) => (
                      <div key={idx} className="w-16 h-16 rounded-lg border border-white/15 overflow-hidden bg-black/40">
                        <img src={img} alt="Attachment" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Text Content */}
                {msg.content.split('\n').map((line, j) => (
                  <p key={j} className={j > 0 ? 'mt-1.5' : ''}>
                    {line}
                  </p>
                ))}

                {/* TTS Audio button on assistant messages */}
                {msg.role === 'model' && (
                  <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between">
                    <button
                      onClick={() => playTTS(msg.content, i)}
                      className="inline-flex items-center gap-1.5 text-[10px] text-zinc-400 hover:text-brand-300 font-medium transition-colors py-0.5 px-1.5 rounded hover:bg-white/[0.04]"
                      aria-label="Play speech audio"
                    >
                      {playingMsgIndex === i ? (
                        <>
                          <VolumeX className="w-3 h-3 text-brand-400 animate-pulse" />
                          <span>Stop Audio</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3 h-3 text-zinc-400" />
                          <span>Listen</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Specialist Matchmaking Roster */}
                {msg.role === 'model' && msg.showSpecialists && members && members.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-zinc-300 uppercase tracking-wider">
                        Matched Specialists ({selectedAgentIds.length}/4 selected)
                      </span>
                    </div>

                    {msg.inferredSkills && msg.inferredSkills.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {msg.inferredSkills.map((skill) => (
                          <span
                            key={skill}
                            className="text-[9px] font-medium bg-brand-500/10 text-brand-300 px-2 py-0.5 rounded-full border border-brand-500/20"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-2">
                      {members
                        .map((member) => ({
                          ...member,
                          matchScore: msg.inferredSkills
                            ? member.skills.filter((s) =>
                                msg.inferredSkills?.some(
                                  (is) =>
                                    s.toLowerCase().includes(is.toLowerCase()) ||
                                    is.toLowerCase().includes(s.toLowerCase())
                                )
                              ).length
                            : 0,
                        }))
                        .sort((a, b) => b.matchScore - a.matchScore)
                        .slice(0, 3)
                        .map((member) => {
                          const isSelected = selectedAgentIds.includes(member.uid);
                          const handleSelectToggle = () => {
                            if (isSelected) {
                              setSelectedAgentIds((prev) => prev.filter((id) => id !== member.uid));
                            } else if (selectedAgentIds.length < 4) {
                              setSelectedAgentIds((prev) => [...prev, member.uid]);
                            }
                          };

                          return (
                            <div
                              key={member.id}
                              onClick={handleSelectToggle}
                              className={cn(
                                'p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer',
                                isSelected
                                  ? 'border-brand-500/50 bg-brand-500/10'
                                  : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                              )}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-full border border-white/15 overflow-hidden bg-zinc-900 shrink-0 flex items-center justify-center">
                                  {member.avatarUrl ? (
                                    <img src={member.avatarUrl} alt={member.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <User className="w-4 h-4 text-zinc-400" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <h4 className="text-xs font-semibold text-white truncate">{member.name}</h4>
                                  <p className="text-[10px] text-zinc-400 truncate">{member.role}</p>
                                </div>
                              </div>

                              <Button
                                type="button"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectToggle();
                                }}
                                className={cn(
                                  'h-6 px-2 text-[10px] font-medium rounded-lg transition-colors border',
                                  isSelected
                                    ? 'bg-brand-500 text-zinc-950 border-brand-400'
                                    : 'bg-transparent text-zinc-300 border-white/15 hover:bg-white/10'
                                )}
                              >
                                {isSelected ? 'Selected' : 'Select'}
                              </Button>
                            </div>
                          );
                        })}
                    </div>

                    {selectedAgentIds.length > 0 && (
                      <Button
                        onClick={() => {
                          const clientIdea = messages.find((m) => m.role === 'user')?.content || '';
                          router.push(
                            `/proposal-form?agentId=${selectedAgentIds.join(',')}&idea=${encodeURIComponent(clientIdea)}`
                          );
                        }}
                        className="w-full h-8 mt-2 bg-brand-500 hover:bg-brand-400 text-zinc-950 text-xs font-semibold rounded-xl shadow-md"
                      >
                        Connect with Selected ({selectedAgentIds.length})
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Quick Suggested Prompts on Initial Screen */}
          {messages.length === 1 && (
            <div className="pt-2 space-y-1.5">
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider px-1">
                Suggested Topics
              </span>
              <div className="flex flex-col gap-1.5">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    className="text-left px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-white/20 text-xs text-zinc-300 transition-all active:scale-[0.98]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Thinking / Loading indicator */}
          {isLoading && (
            <div className="flex gap-2.5 items-center animate-in fade-in duration-200">
              <div className="w-6 h-6 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-3 h-3 text-brand-400 animate-spin" />
              </div>
              <div className="bg-white/[0.04] border border-white/10 rounded-2xl px-3.5 py-2.5 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-3 border-t border-white/[0.08] bg-white/[0.02] shrink-0">
        {/* Uploaded Images Preview */}
        {uploadedImages.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 p-2 bg-white/[0.04] rounded-xl border border-white/10">
            {uploadedImages.map((img, idx) => (
              <div key={idx} className="relative group/img w-12 h-12 rounded-lg border border-white/20 overflow-hidden">
                <img src={img} alt="Uploaded attachment" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setUploadedImages((prev) => prev.filter((_, i) => i !== idx))}
                  className="absolute inset-0 bg-red-600/80 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity text-[10px] font-semibold"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative flex items-center bg-white/[0.04] border border-white/15 focus-within:border-brand-400/50 rounded-2xl p-1.5 transition-all">
          <textarea
            value={input}
            onChange={(e) => {
              const val = e.target.value;
              setInput(val);
              const c = classifyMessage(val);
              if (c.kind === null) setInputHint(null);
              else setInputHint({ kind: c.kind, message: c.reason });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (inputHint?.kind === 'blocked') return;
                if ((input.trim() || uploadedImages.length > 0) && !isLoading) {
                  handleSend();
                }
              }
            }}
            onPaste={(e) => {
              const items = e.clipboardData?.items;
              if (items) {
                for (let i = 0; i < items.length; i++) {
                  if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                      compressImage(file)
                        .then((compressed) => setUploadedImages((prev) => [...prev, compressed]))
                        .catch((err) => console.error('Image compression error:', err));
                    }
                  }
                }
              }
            }}
            placeholder="Ask anything or describe your vision..."
            aria-label="Ask anything or describe your vision"
            className="w-full min-h-[38px] max-h-[120px] bg-transparent outline-none px-3 py-1.5 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 resize-none block overflow-y-auto custom-scrollbar"
            rows={1}
          />

          <div className="flex items-center gap-1 shrink-0">
            {/* Attachment Button */}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              id="chat-image-upload"
              onChange={(e) => {
                const files = e.target.files;
                if (files) {
                  Array.from(files).forEach((file) => {
                    compressImage(file)
                      .then((compressed) => setUploadedImages((prev) => [...prev, compressed]))
                      .catch((err) => console.error('Upload compression error:', err));
                  });
                }
                e.target.value = '';
              }}
            />
            <label htmlFor="chat-image-upload">
              <span
                className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Attach Image"
              >
                <LucideImage className="w-4 h-4" />
              </span>
            </label>

            {/* Send Button */}
            <button
              onClick={() => {
                if (inputHint?.kind === 'blocked') return;
                handleSend();
              }}
              disabled={(!input.trim() && uploadedImages.length === 0) || isLoading || inputHint?.kind === 'blocked'}
              className="w-8 h-8 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-30 disabled:hover:bg-brand-500 text-zinc-950 flex items-center justify-center transition-all active:scale-[0.96] cursor-pointer shrink-0"
              aria-label="Send message"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {inputHint && (
          <div
            role="status"
            className={cn(
              'mt-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium border flex items-center gap-1.5',
              inputHint.kind === 'blocked'
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                : 'border-amber-500/25 bg-amber-500/10 text-amber-300'
            )}
          >
            <span>{inputHint.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}
