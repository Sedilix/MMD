'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '@/components/ui/icon';
import { StudioShell } from './StudioShell';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
// Music has no coolicons equivalent, so the room rail stores each icon as
// a render function — one table, either library, still able to take the
// caller's active-state className.
import { Music, Sparkles, Waves, Disc, Mic, Video } from 'lucide-react';
import audioModelsData from '@/data/studio/audio-models.json';
import { cn } from '@/lib/utils';
import { STUDIO_COSTS } from '@/lib/playground/tier-config';
import { ModelUsedBadge, LoadingRegion, ErrorRegion } from './StudioShared';
import { throwStudioError, resolveStudioError, type StudioApiError } from '@/lib/studio/studio-errors';
import { error as logError } from '@/lib/log';

interface AudioStudioProps {
  onClose: () => void;
}

const ELEVEN_VOICES = [
  { label: 'Sarah (Female - Professional)', value: 'sarah' },
  { label: 'Rachel (Female - Conversational)', value: 'rachel' },
  { label: 'Drew (Male - Narrative)', value: 'drew' },
  { label: 'Clyde (Male - Warm)', value: 'clyde' },
  { label: 'Adam (Male - Deep)', value: 'adam' }
];

const OPENAI_VOICES = [
  { label: 'Alloy (Neutral - Balanced)', value: 'alloy' },
  { label: 'Echo (Male - Crisp)', value: 'echo' },
  { label: 'Fable (Neutral - Narrative)', value: 'fable' },
  { label: 'Onyx (Male - Deep)', value: 'onyx' },
  { label: 'Nova (Female - Energetic)', value: 'nova' },
  { label: 'Shimmer (Female - Professional)', value: 'shimmer' }
];

export default function AudioStudio({ onClose }: AudioStudioProps) {
  const { user } = useUser();
  const { toast } = useToast();

  const [activeSubTab, setActiveSubTab] = useState<'tts' | 'music' | 'stt'>('tts');
  const [showGuideModal, setShowGuideModal] = useState(false);

  // ─── TTS State ───
  const [ttsText, setTtsText] = useState('');
  const [ttsModel, setTtsModel] = useState('eleven_v3');
  const [ttsVoice, setTtsVoice] = useState('sarah');
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [ttsGenerating, setTtsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ─── Music Composition State ───
  const [musicPrompt, setMusicPrompt] = useState('');
  const [musicLyrics, setMusicLyrics] = useState('');
  const [musicModel, setMusicModel] = useState('fun-music-v1');
  const [musicGender, setMusicGender] = useState<'female' | 'male'>('female');
  const [audioFormat, setAudioFormat] = useState<'mp3' | 'wav'>('mp3');
  const [musicGenerating, setMusicGenerating] = useState(false);
  const [musicAudioUrl, setMusicAudioUrl] = useState<string | null>(null);
  const [musicIsPlaying, setMusicIsPlaying] = useState(false);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);

  // Derived model lookups — must run AFTER the useState hooks above so the
  // lexical bindings (`ttsModel`, `musicModel`) are initialized. Previously
  // declared before the state, which threw a TDZ ReferenceError on every
  // mount of the Audio Studio tab.
  const selectedTtsModelData = audioModelsData.tts.find((m) => m.apiVersionId === ttsModel || m.id === ttsModel);
  // Mirror lookup for the selected music model so the button can show the
  // model's real credit cost instead of a hardcoded 5.
  const selectedMusicModelData = audioModelsData.music.find((m) => m.apiVersionId === musicModel || m.id === musicModel);

  // Echoed model + per-code error for music. The music route echoes `model` in
  // its success payload, so the result shows the model that actually composed
  // the track (not just the requested one) — a silent fallback is visible.
  const [musicModelEcho, setMusicModelEcho] = useState<string | null>(null);
  const [musicError, setMusicError] = useState<StudioApiError | null>(null);

  // Per-code error state for TTS + STT, surfaced inline (in addition to toast).
  const [ttsError, setTtsError] = useState<StudioApiError | null>(null);
  const [sttError, setSttError] = useState<StudioApiError | null>(null);
  // Echoed model for STT (the transcribe route does not echo, so this is the
  // requested model; surfaced for parity with the other audio results).
  const [sttModelEcho, setSttModelEcho] = useState<string | null>(null);

  const handleMusicGenerate = async () => {
    if (!musicPrompt.trim() && !musicLyrics.trim()) {
      toast({
        title: 'Prompt or Lyrics Required',
        description: 'Describe the music style or provide lyrics to compose.',
        variant: 'destructive',
      });
      return;
    }

    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'You must be signed in to compose music.',
        variant: 'destructive',
      });
      return;
    }

    setMusicError(null);
    setMusicGenerating(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/studio/music', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: musicPrompt || undefined,
          lyrics: musicLyrics || undefined,
          model: musicModel,
          gender: musicGender,
          format: audioFormat,
        })
      });

      if (!res.ok) {
        await throwStudioError(res, 'Music composition failed');
      }

      const data = await res.json();
      // The music route echoes the model that actually composed the track.
      setMusicModelEcho(data.model || musicModel);
      setMusicAudioUrl(data.audioUrl);

      toast({
        title: 'Music Composed',
        description: data.duration
          ? `Your ${data.duration}s track has been synthesized (${data.creditsUsed} credits).`
          : 'Your track has been synthesized.',
      });
    } catch (e: any) {
      const apiErr = e as StudioApiError;
      if (apiErr && apiErr.kind) {
        setMusicError(apiErr);
        toast({
          title: apiErr.title,
          description: apiErr.message,
          variant: 'destructive',
        });
        logError('[AudioStudio] music failed', { kind: apiErr.kind, raw: apiErr.rawCode });
      } else {
        const resolved = resolveStudioError(undefined, e?.message, e);
        setMusicError({ ...resolved, message: resolved.description, name: 'Error' } as StudioApiError);
        toast({
          title: resolved.title,
          description: resolved.description,
          variant: 'destructive',
        });
        logError('[AudioStudio] music failed', e);
      }
    } finally {
      setMusicGenerating(false);
    }
  };

  // Sync voice list with model provider
  useEffect(() => {
    if (ttsModel.includes('eleven')) {
      setTtsVoice('sarah');
    } else {
      setTtsVoice('alloy');
    }
  }, [ttsModel]);

  // Audio element events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audioUrl]);

  const handleTtsGenerate = async () => {
    if (!ttsText.trim()) {
      toast({
        title: 'Empty text',
        description: 'Provide some text to speak.',
        variant: 'destructive',
      });
      return;
    }

    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'You must be signed in to generate speech.',
        variant: 'destructive',
      });
      return;
    }

    setTtsError(null);
    setTtsGenerating(true);
    setAudioUrl(null);
    setIsPlaying(false);

    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: ttsText,
          voice: ttsVoice,
          model: ttsModel,
          // Forward the Speed control so it actually affects generation (was:
          // a purely decorative slider whose value was never sent). The TTS
          // route passes `speed` through to the upstream provider.
          speed: ttsSpeed,
        })
      });

      if (!res.ok) {
        // The TTS route returns JSON on error (not a blob), so parse the body
        // for the per-code friendly message rather than letting the raw text
        // leak into the UI.
        await throwStudioError(res, 'TTS failed');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      toast({
        title: 'Speech Synthesized',
        description: 'Voice clip ready to play.',
      });

    } catch (e: any) {
      const apiErr = e as StudioApiError;
      if (apiErr && apiErr.kind) {
        setTtsError(apiErr);
        toast({
          title: apiErr.title,
          description: apiErr.message,
          variant: 'destructive',
        });
        logError('[AudioStudio] tts failed', { kind: apiErr.kind, raw: apiErr.rawCode });
      } else {
        const resolved = resolveStudioError(undefined, e?.message, e);
        setTtsError({ ...resolved, message: resolved.description, name: 'Error' } as StudioApiError);
        toast({
          title: resolved.title,
          description: resolved.description,
          variant: 'destructive',
        });
        logError('[AudioStudio] tts failed', e);
      }
    } finally {
      setTtsGenerating(false);
    }
  };

  const handlePlayPause = () => {
    if (!audioRef.current || !audioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  // Infer the correct file extension from the audio URL so a WAV/AAC/OGG
  // track doesn't download mislabeled as .mp3 (the music route honors the
  // user's format choice, but the filename always said .mp3 before).
  const extFromUrl = (url: string): string => {
    if (url.startsWith('data:audio/wav')) return 'wav';
    if (url.startsWith('data:audio/aac')) return 'aac';
    if (url.startsWith('data:audio/ogg')) return 'ogg';
    const m = url.match(/\.([a-z0-9]{2,4})(\?|$)/i);
    if (m) return m[1].toLowerCase();
    return 'mp3';
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = `cybrdeck-voice-${Date.now()}.${extFromUrl(audioUrl)}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ─── STT State ───
  const [sttFile, setSttFile] = useState<File | null>(null);
  const [sttDuration, setSttDuration] = useState<number>(0);
  const [sttModel, setSttModel] = useState('whisper-1');
  const [sttTranscript, setSttTranscript] = useState('');
  const [sttTranscribing, setSttTranscribing] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ─── Real-time STT State (Speechmatics) ───
  // Mirrors the lifecycle in src/components/chat-interface.tsx but is driven by a
  // Start/Stop button pair and accumulates the live transcript into a textarea.
  // No new server route — reuses the existing GET /api/stt/token issuer.
  const [rtRecording, setRtRecording] = useState(false);
  const [rtConnecting, setRtConnecting] = useState(false);
  const [rtTranscript, setRtTranscript] = useState('');
  const [rtError, setRtError] = useState<string | null>(null);
  const smClientRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const lastTranscriptRef = useRef<string>('');
  // Server-issued id for the current grant — threaded back on stop so the
  // metering call settles the SAME session it was issued against, rather
  // than a bare uid the server would have to guess a session for.
  const sttSessionIdRef = useRef<string | null>(null);

  // The Speechmatics entry is display-only — selecting it switches the STT tab
  // into real-time mode and disables the batch "Transcribe Audio" button.
  const isRealtimeMode = sttModel === 'speechmatics-rt' || sttModel === 'speechmatics';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSttFile(file);
      setSttTranscript('');
      
      // Get audio duration
      const audio = new Audio();
      audio.src = URL.createObjectURL(file);
      audio.onloadedmetadata = () => {
        setSttDuration(audio.duration);
      };
    }
  };

  const handleSttTranscribe = async () => {
    if (!sttFile) {
      toast({
        title: 'No audio file',
        description: 'Select or drop an audio file first.',
        variant: 'destructive',
      });
      return;
    }

    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'You must be signed in to transcribe.',
        variant: 'destructive',
      });
      return;
    }

    setSttError(null);
    setSttTranscribing(true);
    try {
      const idToken = await user.getIdToken();
      const form = new FormData();
      form.append('file', sttFile);
      form.append('model', sttModel);
      form.append('duration', String(sttDuration || 60));

      const res = await fetch('/api/studio/transcribe', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`
        },
        body: form
      });

      if (!res.ok) {
        await throwStudioError(res, 'Transcription failed');
      }

      const data = await res.json();
      setSttTranscript(data.text);
      // The transcribe route does not echo the model, so surface the requested
      // model for parity with the other audio results.
      setSttModelEcho(sttModel);
      toast({
        title: 'Transcription Complete',
        description: 'Audio text successfully extracted.',
      });

    } catch (e: any) {
      const apiErr = e as StudioApiError;
      if (apiErr && apiErr.kind) {
        setSttError(apiErr);
        toast({
          title: apiErr.title,
          description: apiErr.message,
          variant: 'destructive',
        });
        logError('[AudioStudio] stt failed', { kind: apiErr.kind, raw: apiErr.rawCode });
      } else {
        const resolved = resolveStudioError(undefined, e?.message, e);
        setSttError({ ...resolved, message: resolved.description, name: 'Error' } as StudioApiError);
        toast({
          title: resolved.title,
          description: resolved.description,
          variant: 'destructive',
        });
        logError('[AudioStudio] stt failed', e);
      }
    } finally {
      setSttTranscribing(false);
    }
  };

  const handleCopyTranscript = async () => {
    if (!sttTranscript) return;
    try {
      await navigator.clipboard.writeText(sttTranscript);
      setCopiedTranscript(true);
      setTimeout(() => setCopiedTranscript(false), 2000);
      toast({
        title: 'Copied',
        description: 'Transcript copied to clipboard.',
      });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Could not copy transcript.',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadTranscript = () => {
    if (!sttTranscript) return;
    const blob = new Blob([sttTranscript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cybrdeck-transcript-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ─── Real-time STT helpers ───
  // Stops the MediaRecorder, releases the mic tracks, and closes the
  // Speechmatics RealtimeClient. Safe to call repeatedly; clears refs.
  const stopRealtime = React.useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn('[AudioStudio] failed to stop MediaRecorder', e);
      }
    }
    mediaRecorderRef.current = null;

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }

    if (smClientRef.current) {
      try {
        smClientRef.current.stopRecognition();
      } catch (e) {
        console.warn('[AudioStudio] failed to stop Speechmatics recognition', e);
      }
      smClientRef.current = null;
    }
    lastTranscriptRef.current = '';
  }, []);

  const handleStartRecording = async () => {
    setRtError(null);
    setRtConnecting(true);
    setRtTranscript('');
    lastTranscriptRef.current = '';

    try {
      const headers: Record<string, string> = {};
      if (user) {
        try {
          const idToken = await user.getIdToken();
          headers['Authorization'] = `Bearer ${idToken}`;
        } catch (e) {
          logError('[AudioStudio] failed to get id token for STT', e);
        }
      }

      const response = await fetch('/api/stt/token', { headers });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (response.status === 402) {
          // Guests get a real, bounded allowance rather than an error
          // that reads as broken — the message names the fix.
          throw new Error(body?.message || 'Real-time transcription limit reached. Sign in for more.');
        }
        throw new Error(`Failed to fetch STT token: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      if (!data.token) {
        throw new Error('STT token response missing token');
      }
      const jwt = data.token;
      // Guests never call the metering endpoint (see handleStopRecording) —
      // their session was already billed in full at issuance. This is only
      // used on the signed-in reconciliation path below.
      sttSessionIdRef.current = typeof data.sessionId === 'string' ? data.sessionId : null;

      // Dynamic import keeps the Speechmatics SDK out of the initial bundle,
      // matching chat-interface.tsx.
      const { RealtimeClient } = await import('@speechmatics/real-time-client');
      const client = new RealtimeClient({ url: 'wss://eu.rt.speechmatics.com/v2' });
      smClientRef.current = client;

      client.addEventListener('receiveMessage', (e: any) => {
        if (client !== smClientRef.current) return; // guard against ghost clients
        if (e.data?.message === 'AddTranscript') {
          const transcript = e.data.metadata?.transcript;
          if (!transcript || transcript === lastTranscriptRef.current) return;
          lastTranscriptRef.current = transcript;
          setRtTranscript((prev) => `${prev} ${transcript}`.trim());
        }
      });

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0 && client.socketState === 'open') {
          client.sendAudio(e.data);
        }
      };

      await client.start(jwt, {
        transcription_config: { language: 'en', operating_point: 'enhanced', enable_entities: true, max_delay: 2 },
        audio_format: { type: 'file' }
      });

      if (stream.active) {
        mediaRecorder.start(250);
        recordingStartTimeRef.current = Date.now();
        setRtRecording(true);
      } else {
        throw new Error('Microphone stream became inactive unexpectedly. Please check your microphone permissions and hardware.');
      }
    } catch (error: any) {
      const message = error?.message || String(error);
      logError('[AudioStudio] real-time STT failed', error);
      let userMessage = 'Real-time connection failed. Please try again.';
      if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('denied') || message.toLowerCase().includes('notallowed')) {
        userMessage = 'Microphone access denied. Please allow microphone access in your browser settings.';
      } else if (message.toLowerCase().includes('notfound') || message.toLowerCase().includes('devicenotfound')) {
        userMessage = 'No microphone found. Please connect a microphone and try again.';
      }
      setRtError(userMessage);
      toast({ title: 'Real-time STT Error', description: userMessage, variant: 'destructive' });
      stopRealtime();
      setRtRecording(false);
    } finally {
      setRtConnecting(false);
    }
  };

  const recordingStartTimeRef = useRef<number | null>(null);

  const handleStopRecording = async () => {
    stopRealtime();
    setRtRecording(false);
    setRtConnecting(false);

    if (recordingStartTimeRef.current) {
      const elapsedSec = (Date.now() - recordingStartTimeRef.current) / 1000;
      recordingStartTimeRef.current = null;

      if (user && elapsedSec > 2) {
        try {
          const idToken = await user.getIdToken();
          const meterRes = await fetch('/api/stt/token', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${idToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              durationSeconds: Math.ceil(elapsedSec),
              model: 'speechmatics-rt',
              // Ties this settlement to the exact grant it is reconciling
              // against, rather than the server guessing which of the
              // caller's sessions to charge.
              sessionId: sttSessionIdRef.current,
            }),
          });
          if (meterRes.ok) {
            const data = await meterRes.json();
            if (data.creditsDeducted > 0) {
              toast({
                title: 'Recording Billed',
                description: `Used ${data.creditsDeducted} credits for ${Math.ceil(elapsedSec)}s real-time STT session.`,
              });
            }
          }
        } catch (err) {
          console.warn('[AudioStudio] STT metering error:', err);
        }
      }
    }
  };

  // Release the mic + close the socket on unmount so we never leak them.
  useEffect(() => {
    return () => {
      stopRealtime();
    };
  }, [stopRealtime]);

  // If the user switches away from the Speechmatics model mid-session, stop.
  useEffect(() => {
    if (!isRealtimeMode && rtRecording) {
      stopRealtime();
      setRtRecording(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRealtimeMode]);

  // ─── Music Waitlist State ───
  const [musicEmail, setMusicEmail] = useState('');
  const [musicLoading, setMusicLoading] = useState(false);

  const handleMusicSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!musicEmail || !musicEmail.includes('@')) {
      toast({
        title: 'Invalid Email',
        description: 'Please enter a valid email address.',
        variant: 'destructive',
      });
      return;
    }

    setMusicLoading(true);
    setTimeout(() => {
      setMusicLoading(false);
      setMusicEmail('');
      toast({
        title: 'Added to Music Waitlist',
        description: "We'll notify you when Suno and MiniMax audio models are online.",
      });
    }, 1000);
  };

  return (
    <StudioShell 
      title="Audio & Music Studio" 
      description="Create, refine, and transcribe high-fidelity vocal and musical tracks."
      onClose={onClose}
    >
      <div className="flex flex-col h-full flex-1 overflow-hidden bg-[#03161c]">
        
        {/* Room rail · workspace · session rail */}
        <div className="flex flex-1 min-h-0">
          {/* Room rail */}
          <nav
            aria-label="Audio rooms"
            className="flex w-[212px] shrink-0 flex-col gap-2 border-r border-brand-900/40 bg-[#021a22]/70 p-3 backdrop-blur-xl select-none"
          >
            {([
              { id: 'tts', icon: (c: string) => <Icon name="volume-max" className={c} aria-hidden="true" />, name: 'Text-to-Speech', hint: 'Voice synthesis' },
              { id: 'music', icon: (c: string) => <Music className={c} aria-hidden="true" />, name: 'Music', hint: 'Track composition' },
              { id: 'stt', icon: (c: string) => <Icon name="file-document" className={c} aria-hidden="true" />, name: 'Transcription', hint: 'Speech to text' },
            ] as const).map((room) => {
              const active = activeSubTab === room.id;
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => setActiveSubTab(room.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                    active
                      ? 'border-brand-400/40 bg-brand-400/10 text-brand-200'
                      : 'border-transparent text-zinc-400 hover:bg-white/5 hover:text-zinc-200',
                  )}
                >
                  {room.icon(cn('h-4 w-4 shrink-0', active ? 'text-brand-300' : 'text-zinc-500'))}
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold tracking-tight">{room.name}</span>
                    <span className={cn('block text-[10px]', active ? 'text-brand-200/70' : 'text-zinc-500')}>{room.hint}</span>
                  </span>
                </button>
              );
            })}
            <div className="mt-auto pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowGuideModal(true)}
                className="w-full text-xs gap-1.5 h-8 border-brand-400/30 text-brand-300 hover:bg-brand-400/10"
              >
                <Sparkles className="h-3.5 w-3.5" /> Capabilities & Guide
              </Button>
            </div>
          </nav>

          {/* Workspace */}
          <div className="flex-1 min-w-0 overflow-auto p-4 lg:p-5">
          
          {/* Text-to-Speech room */}
          {activeSubTab === 'tts' && (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-4">
              {/* Composer */}
              <section className="rounded-2xl border border-brand-900/40 bg-[#031d24]/75 p-5 backdrop-blur-xl space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold tracking-tight text-zinc-50">Voice Composer</h3>
                  {selectedTtsModelData?.badge && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-brand-400/40 text-brand-300 bg-brand-400/10 font-medium">
                      {selectedTtsModelData.badge}
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-brand-200/60 uppercase tracking-wider">Speech Model</label>
                    <select
                      value={ttsModel}
                      onChange={(e) => setTtsModel(e.target.value)}
                      className="w-full h-9 rounded-md border border-brand-900/50 bg-[#021a22] px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-brand-400/60"
                    >
                      {audioModelsData.tts.map((model) => (
                        <option key={model.id} value={model.apiVersionId}>
                          {model.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-brand-200/60 uppercase tracking-wider">Voice Character</label>
                    <select
                      value={ttsVoice}
                      onChange={(e) => setTtsVoice(e.target.value)}
                      className="w-full h-9 rounded-md border border-brand-900/50 bg-[#021a22] px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-brand-400/60"
                    >
                      {ttsModel.includes('eleven')
                        ? ELEVEN_VOICES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)
                        : OPENAI_VOICES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)
                      }
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-semibold text-brand-200/60 uppercase tracking-wider">
                      <span>Speed</span>
                      <span className="text-zinc-200 font-mono tabular-nums">{ttsSpeed.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={ttsSpeed}
                      onChange={(e) => setTtsSpeed(parseFloat(e.target.value))}
                      className="w-full accent-brand-400 bg-brand-950 rounded-lg appearance-none cursor-pointer h-1.5 mt-2.5"
                    />
                  </div>
                </div>

                {selectedTtsModelData?.description && (
                  <p className="text-[10px] text-zinc-400 leading-relaxed">
                    {selectedTtsModelData.description}
                  </p>
                )}

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] font-semibold text-brand-200/60 uppercase tracking-wider">
                    <span>Script</span>
                    <span className="text-zinc-400 font-mono tabular-nums normal-case">{ttsText.length} chars</span>
                  </div>
                  <Textarea
                    placeholder="Enter the text that should be spoken by the selected voice actor..."
                    value={ttsText}
                    onChange={(e) => setTtsText(e.target.value)}
                    className="min-h-[160px] resize-none p-3 bg-[#021a22] border-brand-900/50 text-zinc-100"
                  />
                </div>

                {/* aria-live loading region for the TTS wait. */}
                {ttsGenerating && <LoadingRegion label="Synthesizing speech…" />}

                <Button
                  type="button"
                  onClick={handleTtsGenerate}
                  disabled={ttsGenerating}
                  className="w-full h-10 gap-2 text-xs font-semibold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  {ttsGenerating ? (
                    <>
                      <Icon name="loading" className="h-4 w-4 animate-spin" />
                      Synthesizing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      {(() => {
                        // Per-model credit rate (each voice model has its own
                        // creditsPer1000); fall back to the global default.
                        const per1000 = selectedTtsModelData?.creditsPer1000 ?? STUDIO_COSTS.ttsPer1000;
                        const credits = Math.max(1, Math.ceil(ttsText.trim().length / 1000) * per1000);
                        return <>Generate Speech ({credits} credits)</>;
                      })()}
                    </>
                  )}
                </Button>
              </section>

              {/* Playback workspace */}
              <section className="rounded-2xl border border-brand-900/40 bg-[#031d24]/75 p-6 backdrop-blur-xl flex flex-col items-center justify-center text-center">
                {audioUrl ? (
                  <div className="w-full max-w-md space-y-6">
                    <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-400/10 border border-brand-400/20 text-brand-300">
                      <Disc className={cn("h-10 w-10 text-brand-300", isPlaying && "animate-spin")} style={{ animationDuration: '6s' }} />
                    </div>

                    <div className="space-y-2 select-none">
                      <h4 className="text-sm font-semibold tracking-tight text-zinc-50">Speech Output</h4>
                      <div className="flex justify-center">
                        <ModelUsedBadge model={ttsModel} detail={`voice ${ttsVoice}`} size="md" />
                      </div>
                    </div>

                    {/* Progress slider */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-mono tabular-nums text-zinc-400 select-none">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                      </div>
                      <div
                        className="h-1 bg-brand-950 rounded-full w-full cursor-pointer relative"
                        onClick={(e) => {
                          if (!audioRef.current) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const percent = (e.clientX - rect.left) / rect.width;
                          audioRef.current.currentTime = percent * duration;
                        }}
                      >
                        <div
                          className="h-full bg-brand-400 rounded-full"
                          style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-4">
                      <audio ref={audioRef} src={audioUrl} />
                      <Button
                        type="button"
                        onClick={handlePlayPause}
                        className="h-12 w-12 rounded-full p-0 flex items-center justify-center bg-brand-500 text-[#03161c] hover:bg-brand-400 transition-all shadow-md"
                      >
                        {isPlaying ? <Icon name="pause" className="h-5 w-5" /> : <Icon name="play" className="h-5 w-5 pl-0.5" />}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleDownload}
                        className="h-10 px-4 gap-2 text-xs font-semibold uppercase tracking-wider border-brand-900/60 bg-[#021a22] text-zinc-200 hover:bg-brand-950"
                      >
                        <Icon name="download" className="h-4 w-4" /> Download
                      </Button>
                    </div>
                  </div>
                ) : ttsError ? (
                  <ErrorRegion
                    title={ttsError.title}
                    description={ttsError.message}
                    onRetry={handleTtsGenerate}
                    className="w-full max-w-md"
                  />
                ) : (
                  <div className="border border-dashed border-brand-900/60 rounded-2xl flex flex-col items-center justify-center text-center p-8 select-none max-w-sm">
                    <Waves className="h-10 w-10 text-brand-300/20 mb-3 animate-pulse" />
                    <h4 className="text-xs font-semibold text-zinc-300">Voice Synthesizer Workspace</h4>
                    <p className="text-[10px] text-zinc-500 mt-1 max-w-xs leading-relaxed">
                      Pick a voice, write your script, and generate to hear high-fidelity speech synthesis.
                    </p>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* Music room */}
          {activeSubTab === 'music' && (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-4">
              {/* Composer */}
              <section className="rounded-2xl border border-brand-900/40 bg-[#031d24]/75 p-5 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold tracking-tight text-zinc-50">Track Composer</h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-brand-200/60 uppercase tracking-wider">Music Engine</label>
                    <select
                      value={musicModel}
                      onChange={(e) => setMusicModel(e.target.value)}
                      className="w-full h-9 rounded-md border border-brand-900/50 bg-[#021a22] px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-brand-400/60"
                    >
                      {audioModelsData.music.map((m) => (
                        <option key={m.id} value={m.apiVersionId}>
                          {m.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-brand-200/60 uppercase tracking-wider">Format</label>
                    <select
                      value={audioFormat}
                      onChange={(e) => setAudioFormat(e.target.value as any)}
                      className="w-full h-9 rounded-md border border-brand-900/50 bg-[#021a22] px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-brand-400/60"
                    >
                      <option value="mp3">MP3 (320 kbps)</option>
                      <option value="wav">WAV (24-bit 48kHz)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-brand-200/60 uppercase tracking-wider">Vocal Gender</label>
                    <div className="grid grid-cols-2 gap-1">
                      {(['female', 'male'] as const).map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setMusicGender(g)}
                          disabled={musicModel === 'fun-music-preview'}
                          className={cn(
                            'h-9 rounded-md text-[11px] font-medium capitalize border transition-all',
                            musicGender === g
                              ? 'bg-brand-500 text-[#03161c] border-brand-500'
                              : 'bg-[#021a22] border-brand-900/50 text-zinc-400 hover:text-zinc-200',
                            musicModel === 'fun-music-preview' && 'opacity-40 cursor-not-allowed'
                          )}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-brand-200/60 uppercase tracking-wider">Composition Prompt</label>
                  <Textarea
                    placeholder="Describe the musical genre, mood, instruments, and style..."
                    value={musicPrompt}
                    onChange={(e) => setMusicPrompt(e.target.value)}
                    className="min-h-[120px] resize-none p-3 bg-[#021a22] border-brand-900/50 text-zinc-100"
                  />
                  <div className="flex flex-wrap gap-1 pt-1">
                    {['Upbeat synthwave with heavy bass', 'Lo-fi chill beats with piano and rain ambient', 'Cinematic orchestral soundtrack with epic drums'].map((sp, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setMusicPrompt(sp)}
                        className="text-[10px] bg-brand-400/10 hover:bg-brand-400/20 text-brand-300 px-2 py-0.5 rounded-md text-left truncate max-w-full"
                      >
                        + {sp.slice(0, 28)}...
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold text-brand-200/60 uppercase tracking-wider">Lyrics (Optional)</label>
                    <span className="text-[9px] text-zinc-500 font-mono tabular-nums">{musicLyrics.length}/2000</span>
                  </div>
                  <Textarea
                    placeholder="Paste custom lyrics with section tags like [verse], [chorus], [bridge]. When provided, lyrics take priority over the prompt. Supports Chinese and English."
                    value={musicLyrics}
                    onChange={(e) => setMusicLyrics(e.target.value.slice(0, 2000))}
                    className="min-h-[120px] resize-none p-3 bg-[#021a22] border-brand-900/50 text-zinc-100 font-mono text-[11px] leading-relaxed"
                  />
                </div>

                {/* aria-live loading region so screen readers announce the
                    composing wait. */}
                {musicGenerating && (
                  <LoadingRegion label="Composing track…" />
                )}
                <Button
                  type="button"
                  onClick={handleMusicGenerate}
                  disabled={musicGenerating}
                  className="w-full h-10 gap-2 text-xs font-semibold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  {musicGenerating ? (
                    <>
                      <Icon name="loading" className="h-4 w-4 animate-spin" />
                      Composing Track...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Compose Track ({selectedMusicModelData?.credits ?? 20} credits)
                    </>
                  )}
                </Button>
              </section>

              {/* Output player */}
              <section className="rounded-2xl border border-brand-900/40 bg-[#031d24]/75 p-6 backdrop-blur-xl flex flex-col items-center justify-center text-center">
                {musicAudioUrl ? (
                  <div className="w-full max-w-md space-y-6">
                    <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-400/10 border border-brand-400/20 text-brand-300">
                      <Disc className={cn("h-10 w-10 text-brand-300", musicIsPlaying && "animate-spin")} style={{ animationDuration: '4s' }} />
                    </div>

                    <div className="space-y-2 select-none">
                      <h4 className="text-sm font-semibold tracking-tight text-zinc-50">Composition Output</h4>
                      {/* Echoed model — the music route returns the model that
                          actually composed the track, so a silent fallback is
                          visible. Falls back to the requested model if absent. */}
                      <div className="flex justify-center">
                        <ModelUsedBadge model={musicModelEcho ?? musicModel} detail={audioFormat.toUpperCase()} size="md" />
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-4">
                      <audio ref={musicAudioRef} src={musicAudioUrl} controls autoPlay className="w-full" />
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        if (musicAudioUrl) {
                          localStorage.setItem('cybrdeck_cross_studio_audio_url', musicAudioUrl);
                          toast({
                            title: "Audio Track Bound to Cross-Studio Pipeline",
                            description: "Attached generated track to Video Studio! Open Video Studio to render with background audio.",
                          });
                        }
                      }}
                      className="w-full h-9 gap-2 text-xs font-semibold uppercase tracking-wider border-purple-500/30 text-purple-300 bg-purple-950/20 hover:bg-purple-900/40"
                    >
                      <Video className="h-4 w-4 text-purple-400" />
                      Attach Track to Video Studio
                    </Button>
                  </div>
                ) : musicError ? (
                  <ErrorRegion
                    title={musicError.title}
                    description={musicError.message}
                    onRetry={handleMusicGenerate}
                    className="w-full max-w-md"
                  />
                ) : (
                  <div className="border border-dashed border-brand-900/60 rounded-2xl flex flex-col items-center justify-center text-center p-8 select-none max-w-sm">
                    <Disc className="h-10 w-10 text-brand-300/20 mb-3 animate-spin" style={{ animationDuration: '10s' }} />
                    <h4 className="text-xs font-semibold text-zinc-300">AI Music Composer Workspace</h4>
                    <p className="text-[10px] text-zinc-500 mt-1 max-w-xs leading-relaxed">
                      Describe your music style, pick a tempo, and compose background tracks and instrumental scores.
                    </p>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* Transcription room */}
          {activeSubTab === 'stt' && (
            <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-4">
              {/* Source panel */}
              <section className="rounded-2xl border border-brand-900/40 bg-[#031d24]/75 p-5 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold tracking-tight text-zinc-50">Speech to Text</h3>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-brand-200/60 uppercase tracking-wider">STT Model</label>
                  <select
                    value={sttModel}
                    onChange={(e) => setSttModel(e.target.value)}
                    className="w-full h-9 rounded-md border border-brand-900/50 bg-[#021a22] px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-brand-400/60"
                  >
                    {audioModelsData.stt.map((model) => (
                      <option key={model.id} value={model.apiVersionId}>
                        {model.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                {isRealtimeMode ? (
                  /* Real-time Speechmatics controls. No file upload; the Studio
                     records from the mic and streams to the Speechmatics WS. */
                  <div className="space-y-3">
                    <div className="border border-dashed border-brand-900/60 rounded-xl p-6 text-center flex flex-col items-center justify-center gap-2 select-none">
                      <Mic className={cn("h-6 w-6", rtRecording ? "text-rose-400 animate-pulse" : "text-zinc-500")} />
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-medium text-zinc-200">
                          {rtRecording ? 'Live microphone' : 'Microphone input'}
                        </p>
                        <p className="text-[9px] text-zinc-500">
                          {rtRecording ? 'Streaming audio to Speechmatics…' : 'Press Start to stream your mic in real time.'}
                        </p>
                      </div>
                    </div>
                    {rtConnecting && <LoadingRegion label="Connecting to Speechmatics…" />}
                    {rtRecording ? (
                      <Button
                        type="button"
                        onClick={handleStopRecording}
                        className="w-full h-10 gap-2 text-xs font-semibold uppercase tracking-wider bg-rose-600 hover:bg-rose-500 text-white"
                      >
                        <Icon name="square" className="h-4 w-4" />
                        Stop Recording
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={handleStartRecording}
                        disabled={rtConnecting}
                        className="w-full h-10 gap-2 text-xs font-semibold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white"
                      >
                        {rtConnecting ? (
                          <>
                            <Icon name="loading" className="h-4 w-4 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Mic className="h-4 w-4" />
                            Start Recording
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Upload zone */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-brand-200/60 uppercase tracking-wider">Audio Source</label>

                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="audio/*"
                        className="hidden"
                      />

                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className={cn(
                          "border border-dashed border-brand-900/60 hover:border-brand-400/50 bg-[#021a22]/60 rounded-xl p-6 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-2",
                          sttFile && "border-solid border-brand-400/30 bg-brand-400/5"
                        )}
                      >
                        <Icon name="file-upload" className={cn("h-6 w-6 text-zinc-500", sttFile && "text-brand-300")} />
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-medium text-zinc-200">
                            {sttFile ? sttFile.name : 'Select Audio File'}
                          </p>
                          <p className="text-[9px] text-zinc-500 font-mono tabular-nums">
                            {sttFile
                              ? `${(sttFile.size / (1024 * 1024)).toFixed(2)} MB · ${formatTime(sttDuration)}`
                              : 'MP3, WAV, M4A up to 25MB'
                            }
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* aria-live loading region for the transcription wait. */}
                    {sttTranscribing && <LoadingRegion label="Transcribing audio…" />}

                    <Button
                      type="button"
                      onClick={handleSttTranscribe}
                      disabled={sttTranscribing || !sttFile}
                      className="w-full h-10 gap-2 text-xs font-semibold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40"
                    >
                      {sttTranscribing ? (
                        <>
                          <Icon name="loading" className="h-4 w-4 animate-spin" />
                          Transcribing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Transcribe Audio ({Math.max(10, Math.ceil((sttDuration || 60) / 60) * STUDIO_COSTS.transcribePerMin)} credits)
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </section>

              {/* Transcript output */}
              <section className="rounded-2xl border border-brand-900/40 bg-[#031d24]/75 backdrop-blur-xl flex flex-col min-h-[420px] overflow-hidden p-5 gap-3">
                <div className="flex items-center justify-between gap-2 select-none">
                  <h3 className="text-[10px] font-semibold uppercase text-brand-200/60 tracking-wider flex items-center gap-1.5">
                    <Icon name="file-document" className="h-3.5 w-3.5" /> Transcription output
                  </h3>
                  <div className="flex items-center gap-2">
                    {sttModelEcho && <ModelUsedBadge model={sttModelEcho} />}
                    {sttTranscript && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleCopyTranscript}
                          className="h-7 text-[10px] gap-1 px-2.5 border-brand-900/60 bg-[#021a22] text-zinc-300 hover:bg-brand-950"
                        >
                          {copiedTranscript ? <Icon name="check" className="h-3.5 w-3.5 text-emerald-400" /> : <Icon name="copy" className="h-3.5 w-3.5" />}
                          Copy
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleDownloadTranscript}
                          className="h-7 text-[10px] gap-1 px-2.5 border-brand-900/60 bg-[#021a22] text-zinc-300 hover:bg-brand-950"
                        >
                          <Icon name="download" className="h-3.5 w-3.5" />
                          Download
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-h-0 min-w-0">
                  {isRealtimeMode ? (
                    rtError ? (
                      <ErrorRegion
                        title="Real-time STT Error"
                        description={rtError}
                        onRetry={handleStartRecording}
                        className="h-full"
                      />
                    ) : (
                      <Textarea
                        readOnly
                        value={rtTranscript}
                        placeholder={rtRecording ? 'Listening… speak into your microphone.' : 'Press Start Recording to begin streaming your microphone to Speechmatics.'}
                        className="w-full h-full font-sans resize-none p-5 bg-[#021a22]/60 border-brand-900/50 text-zinc-100"
                      />
                    )
                  ) : sttTranscribing ? (
                    <div
                      role="status"
                      aria-live="polite"
                      className="h-full border border-dashed border-brand-900/60 rounded-xl flex flex-col items-center justify-center text-center p-8 select-none"
                    >
                      <Icon name="loading" className="h-8 w-8 text-brand-400 animate-spin mb-3" />
                      <p className="text-xs font-medium text-zinc-200">Extracting audio narrative...</p>
                      <p className="text-[10px] text-zinc-500 mt-1">This may take 15-30 seconds depending on file duration.</p>
                    </div>
                  ) : sttError ? (
                    <ErrorRegion
                      title={sttError.title}
                      description={sttError.message}
                      onRetry={handleSttTranscribe}
                      className="h-full"
                    />
                  ) : sttTranscript ? (
                    <Textarea
                      readOnly
                      value={sttTranscript}
                      className="w-full h-full font-sans resize-none p-5 bg-[#021a22]/60 border-brand-900/50 text-zinc-100"
                    />
                  ) : (
                    <div className="h-full border border-dashed border-brand-900/60 rounded-xl flex flex-col items-center justify-center text-center p-8 select-none">
                      <Icon name="file-document" className="h-10 w-10 text-brand-300/20 mb-3" />
                      <h4 className="text-xs font-semibold text-zinc-300">Transcription Canvas</h4>
                      <p className="text-[10px] text-zinc-500 mt-1 max-w-xs leading-relaxed">
                        Upload an audio recording, click transcribe, and the extracted transcript will appear here.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
          </div>

          {/* Session rail — honest status, no invented meters */}
          <aside className="hidden xl:flex w-[240px] shrink-0 flex-col gap-3 border-l border-brand-900/40 bg-[#021a22]/70 p-3 backdrop-blur-xl select-none">
            <div className="rounded-xl border border-brand-900/40 bg-[#031d24]/80 p-3 space-y-2">
              <h4 className="text-[10px] font-semibold text-brand-200/60 uppercase tracking-wider">Session</h4>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-zinc-500">Room</span>
                <span className="text-zinc-200 font-medium">
                  {activeSubTab === 'tts' ? 'Text-to-Speech' : activeSubTab === 'music' ? 'Music' : 'Transcription'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-zinc-500">Status</span>
                <span className={cn('flex items-center gap-1.5 font-medium', rtRecording ? 'text-rose-300' : 'text-zinc-300')}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', rtRecording ? 'bg-rose-400 animate-pulse' : 'bg-zinc-600')} aria-hidden="true" />
                  {rtRecording ? 'Recording' : rtConnecting ? 'Connecting' : 'Idle'}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-brand-900/40 bg-[#031d24]/80 p-3 space-y-2">
              <h4 className="text-[10px] font-semibold text-brand-200/60 uppercase tracking-wider">Estimated cost</h4>
              <p className="text-[11px] text-zinc-200 font-mono tabular-nums">
                {activeSubTab === 'tts' &&
                  (() => {
                    const per1000 = selectedTtsModelData?.creditsPer1000 ?? STUDIO_COSTS.ttsPer1000;
                    return `${Math.max(1, Math.ceil(ttsText.trim().length / 1000) * per1000)} credits`;
                  })()}
                {activeSubTab === 'music' && `${selectedMusicModelData?.credits ?? 20} credits / track`}
                {activeSubTab === 'stt' &&
                  (isRealtimeMode
                    ? '4 credits / min streamed'
                    : `${Math.max(10, Math.ceil((sttDuration || 60) / 60) * STUDIO_COSTS.transcribePerMin)} credits`)}
              </p>
              <p className="text-[9px] text-zinc-500 leading-relaxed">
                Charged only on delivered output. Failed generations cost nothing.
              </p>
            </div>

            <div className="rounded-xl border border-brand-900/40 bg-[#031d24]/80 p-3 space-y-2">
              <h4 className="text-[10px] font-semibold text-brand-200/60 uppercase tracking-wider">Microphone</h4>
              <p className="text-[10px] text-zinc-400 leading-relaxed">
                {rtRecording
                  ? 'Streaming to Speechmatics in real time.'
                  : 'Idle. Real-time mode uses the Speechmatics room in Transcription.'}
              </p>
            </div>
          </aside>
        </div>

        {/* Model Capabilities & Pricing Guide Modal */}
        {showGuideModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-[#031d24] border border-brand-900/50 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-brand-900/50 px-6 py-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Audio Models Capabilities & Pricing Guide</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  className="text-zinc-400 hover:text-zinc-100 text-xs font-semibold px-2.5 py-1 rounded bg-white/5 hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              <div className="flex-1 overflow-auto p-6 space-y-6">
                {/* Text-to-Speech Table */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                    <Icon name="volume-max" className="h-4 w-4" /> Text-to-Speech (TTS)
                  </h4>
                  <div className="border border-brand-900/50 rounded-xl overflow-hidden bg-[#021a22]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-brand-950/40 border-b border-brand-900/50 text-[11px] uppercase tracking-wider text-brand-200/60">
                        <tr>
                          <th className="p-3">Need</th>
                          <th className="p-3">Recommended Model</th>
                          <th className="p-3">Cybrdeck Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50 text-foreground">
                        <tr>
                          <td className="p-3 font-medium text-zinc-400">Lowest latency</td>
                          <td className="p-3 font-mono text-primary">sonic-turbo <span className="text-xs text-zinc-400">(Cartesia)</span></td>
                          <td className="p-3 font-mono">7 credits / 1K chars</td>
                        </tr>
                        <tr>
                          <td className="p-3 font-medium text-zinc-400">Most languages (74)</td>
                          <td className="p-3 font-mono text-primary">eleven_v3 <span className="text-xs text-zinc-400">(ElevenLabs)</span></td>
                          <td className="p-3 font-mono">18 credits / 1K chars</td>
                        </tr>
                        <tr>
                          <td className="p-3 font-medium text-zinc-400">Cheapest</td>
                          <td className="p-3 font-mono text-primary">sonic-turbo <span className="text-xs text-zinc-400">(Cartesia)</span></td>
                          <td className="p-3 font-mono">7 credits / 1K chars</td>
                        </tr>
                        <tr>
                          <td className="p-3 font-medium text-zinc-400">General purpose / WebSocket</td>
                          <td className="p-3 font-mono text-primary">sonic-3 <span className="text-xs text-zinc-400">(Cartesia)</span></td>
                          <td className="p-3 font-mono">10 credits / 1K chars</td>
                        </tr>
                        <tr>
                          <td className="p-3 font-medium text-zinc-400">Fine voice control</td>
                          <td className="p-3 font-mono text-primary">eleven_flash_v2_5 <span className="text-xs text-zinc-400">(ElevenLabs)</span></td>
                          <td className="p-3 font-mono">9 credits / 1K chars</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Speech-to-Text (Batch) Table */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                    <Icon name="file-document" className="h-4 w-4" /> Speech-to-Text (Batch File Upload)
                  </h4>
                  <div className="border border-brand-900/50 rounded-xl overflow-hidden bg-[#021a22]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-brand-950/40 border-b border-brand-900/50 text-[11px] uppercase tracking-wider text-brand-200/60">
                        <tr>
                          <th className="p-3">Need</th>
                          <th className="p-3">Recommended Model</th>
                          <th className="p-3">Cybrdeck Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50 text-foreground">
                        <tr>
                          <td className="p-3 font-medium text-zinc-400">Cheapest & Fastest</td>
                          <td className="p-3 font-mono text-primary">ink-whisper <span className="text-xs text-zinc-400">(Cartesia)</span></td>
                          <td className="p-3 font-mono">3 credits / min</td>
                        </tr>
                        <tr>
                          <td className="p-3 font-medium text-zinc-400">Highest accuracy & Longest (4h)</td>
                          <td className="p-3 font-mono text-primary">universal-3-pro <span className="text-xs text-zinc-400">(AssemblyAI)</span></td>
                          <td className="p-3 font-mono">5 credits / min</td>
                        </tr>
                        <tr>
                          <td className="p-3 font-medium text-zinc-400">Golden Standard</td>
                          <td className="p-3 font-mono text-primary">whisper-1 <span className="text-xs text-zinc-400">(OpenAI)</span></td>
                          <td className="p-3 font-mono">10 credits / min</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Speech-to-Text (Streaming) Table */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                    <Mic className="h-4 w-4" /> Speech-to-Text (Streaming Realtime)
                  </h4>
                  <div className="border border-brand-900/50 rounded-xl overflow-hidden bg-[#021a22]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-brand-950/40 border-b border-brand-900/50 text-[11px] uppercase tracking-wider text-brand-200/60">
                        <tr>
                          <th className="p-3">Need</th>
                          <th className="p-3">Recommended Model</th>
                          <th className="p-3">Cybrdeck Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50 text-foreground">
                        <tr>
                          <td className="p-3 font-medium text-zinc-400">Lowest latency (66ms)</td>
                          <td className="p-3 font-mono text-primary">ink-whisper <span className="text-xs text-zinc-400">(Cartesia)</span></td>
                          <td className="p-3 font-mono">4 credits / min</td>
                        </tr>
                        <tr>
                          <td className="p-3 font-medium text-zinc-400">Cheapest English</td>
                          <td className="p-3 font-mono text-primary">universal-streaming-english <span className="text-xs text-zinc-400">(AssemblyAI)</span></td>
                          <td className="p-3 font-mono">3 credits / min</td>
                        </tr>
                        <tr>
                          <td className="p-3 font-medium text-zinc-400">Most languages (99+)</td>
                          <td className="p-3 font-mono text-primary">whisper-rt <span className="text-xs text-zinc-400">(AssemblyAI)</span></td>
                          <td className="p-3 font-mono">7 credits / min</td>
                        </tr>
                        <tr>
                          <td className="p-3 font-medium text-zinc-400">Highest accuracy</td>
                          <td className="p-3 font-mono text-primary">u3-rt-pro <span className="text-xs text-zinc-400">(AssemblyAI)</span></td>
                          <td className="p-3 font-mono">10 credits / min</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </StudioShell>
  );
}
