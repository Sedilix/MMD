"use client"

import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChatBootLoaderProps {
  onComplete: () => void;
}

const TEXT_START_HERE = "Start Here";
const TEXT_SYSTEM_BOOT = "Have an idea? Discuss it with One!";
const TEXT_STATE_PREFIX = "State: ";
const TEXT_SECURE_SHELL = "SECURE SHELL V2";
const TEXT_TRANSCEIVER_OK = "TRANSCEIVER OK";
const TEXT_CYBR_DEATH = "CYBR-DEATH-V3";

type BootPhase = 'init' | 'connecting' | 'indexing' | 'optimizing' | 'ready';

const style = {
  primaryColor: '',
  secondaryColor: '',
  accentColor: '',
  borderColor: 'border-black/20',
  progressBarBorder: 'border-black/20',
  progressBarFill: 'bg-gradient-to-r from-secondary via-primary to-primary shadow-[0_0_10px_rgba(0,0,0,0.7)]',
  buttonClass: 'bg-black/40 hover:bg-black/60 border-black/80 hover:border-black text-white shadow-[0_0_20px_rgba(0,0,0,0.5)] hover:shadow-[0_0_35px_rgba(0,0,0,0.9)]',
  gradientLogs: [] as string[],
};

export function ChatBootLoader({ onComplete }: ChatBootLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [bootPhase, setBootPhase] = useState<BootPhase>('init');
  const [isReady, setIsReady] = useState(false);
  const [hasStartedImplosion, setHasStartedImplosion] = useState(false);

  useEffect(() => {
    if (hasStartedImplosion) {
      const timer = setTimeout(() => {
        onComplete();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [hasStartedImplosion, onComplete]);

  const logMessages: { time: number; text: string; phase: BootPhase }[] = [
    { time: 200, text: ">> SYSTEM: INITIALIZING NEURAL CYBR-LINK...", phase: 'init' },
    { time: 500, text: ">> MODULE: loading quantum kernel decryption keys...", phase: 'init' },
    { time: 900, text: ">> NETWORK: establishing handshakes with secure proxies...", phase: 'connecting' },
    { time: 1300, text: ">> CORE: syncing virtual synapses with CYBRDECK grid...", phase: 'connecting' },
    { time: 1800, text: ">> PARSING: mapping user telemetry & workspace constraints...", phase: 'indexing' },
    { time: 2300, text: ">> OPTIMIZE: routing pipeline through low-latency edges...", phase: 'optimizing' },
    { time: 2800, text: ">> SECURE: encryption layers checked. sandbox active.", phase: 'optimizing' },
    { time: 3200, text: ">> PIPELINE: ONLINE. Welcome to Cybrdeck.", phase: 'ready' },
  ];

  useEffect(() => {
    let startTimestamp: number | null = null;
    const duration = 3400;

    const animateProgress = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      const currentProgress = Math.min((elapsed / duration) * 100, 100);

      setProgress(Math.floor(currentProgress));

      logMessages.forEach(msg => {
        if (elapsed >= msg.time) {
          setLogs(prev => {
            if (!prev.includes(msg.text)) {
              setBootPhase(msg.phase);
              return [...prev, msg.text];
            }
            return prev;
          });
        }
      });

      if (elapsed < duration) {
        requestAnimationFrame(animateProgress);
      } else {
        setProgress(100);
        setTimeout(() => setIsReady(true), 300);
      }
    };

    const animFrame = requestAnimationFrame(animateProgress);
    return () => cancelAnimationFrame(animFrame);
  }, []);

  const getPhaseIcon = () => {
    const iconClass = `h-5 w-5 ${style.primaryColor ? '' : 'text-primary'}`;
    const iconStyle = style.primaryColor ? { color: style.primaryColor } : undefined;
    switch (bootPhase) {
      case 'init': return <Cpu className={`${iconClass} animate-pulse`} style={iconStyle} />;
      case 'connecting': return <Icon name="radio" className={`${iconClass} animate-pulse`} style={iconStyle} />;
      case 'indexing': return <Icon name="terminal" className={`${iconClass} animate-pulse`} style={iconStyle} />;
      case 'optimizing': return <Icon name="shield" className={`${iconClass} animate-pulse`} style={iconStyle} />;
      case 'ready': return <Icon name="globe" className={`${iconClass} animate-bounce`} style={iconStyle} />;
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-between p-8 bg-black backdrop-blur-md rounded-2xl select-none overflow-hidden boot-loader-container">
      
      {/* Start Here Button Overlay */}
      <AnimatePresence>
        {isReady && !hasStartedImplosion && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5, filter: 'blur(10px)' }}
            transition={{ duration: 0.5, type: 'spring' }}
            className="absolute left-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
            style={{ top: 'calc(50% - 20px)' }}
          >
            <div className="relative p-[1.5px] rounded overflow-hidden group w-fit mx-auto shadow-[0_0_15px_rgba(255,255,255,0.3)]">
              {/* Rotating white glow border */}
              <div
                className="absolute inset-[-150%] animate-spin"
                style={{
                  animationDuration: '2.5s',
                  background: 'conic-gradient(from 0deg, transparent 0%, transparent 40%, rgba(255,255,255,0.95) 50%, transparent 60%, transparent 100%)',
                }}
              />
              {/* Button face */}
              <button
                onClick={() => setHasStartedImplosion(true)}
                className="relative z-10 px-8 py-3 rounded-[3px] bg-black hover:bg-zinc-950 text-white text-xs font-mono font-bold tracking-widest uppercase transition-all duration-300 hover:text-white cursor-pointer block border border-white/10"
              >
                {TEXT_START_HERE}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!hasStartedImplosion && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className={`w-full flex items-center justify-between border-b pb-4 z-10 ${style.borderColor}`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-1.5 rounded border ${style.primaryColor ? 'bg-primary/5 border-primary/20' : 'bg-black/10 border-black/30'}`}
                style={style.primaryColor ? { borderColor: `${style.primaryColor}33`, backgroundColor: `${style.primaryColor}11` } : undefined}
              >
                {getPhaseIcon()}
              </div>
              <div>
                <h4
                  className={`text-xs font-headline font-bold tracking-widest uppercase ${style.primaryColor ? '' : 'text-foreground'}`}
                  style={style.primaryColor ? { color: style.primaryColor } : undefined}
                >
                  {TEXT_SYSTEM_BOOT}
                </h4>
                <p
                  className={`text-[9px] font-headline uppercase tracking-widest ${style.secondaryColor ? '' : 'text-muted-foreground'}`}
                  style={style.secondaryColor ? { color: style.secondaryColor } : undefined}
                >
                  {TEXT_STATE_PREFIX}{bootPhase}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span
                className={`text-xs font-mono font-bold tracking-widest ${style.accentColor ? '' : 'text-foreground'}`}
                style={style.accentColor ? { color: style.accentColor } : undefined}
              >
                {progress}%
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!hasStartedImplosion && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, x: -50 }}
            className={`absolute bottom-20 left-8 z-10 w-full max-w-xs max-h-[30%] overflow-y-auto flex flex-col justify-end gap-1 font-mono text-[9px] text-left scrollbar-none ${style.primaryColor ? '' : 'text-foreground/80'}`}
          >
            {logs.map((log, index) => (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                key={index} 
                className={`border-l pl-2 py-0.5 ${style.borderColor}`}
                style={style.gradientLogs.length > 0 ? { color: style.gradientLogs[index % style.gradientLogs.length] } : undefined}
              >
                {log}
              </motion.div>
            ))}
            <div className={`flex items-center gap-1 animate-pulse border-l pl-2 mt-1 ${style.borderColor}`}
              style={style.primaryColor ? { color: style.primaryColor } : undefined}
            >
              <span>&gt;&gt;</span>
              <span className={`h-3 w-1.5 ${style.primaryColor ? '' : 'bg-primary/80'}`}
                style={style.primaryColor ? { backgroundColor: style.primaryColor } : undefined}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!hasStartedImplosion && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, y: 20 }}
            className="w-full z-10 space-y-4"
          >
            <div className={`w-full h-1.5 bg-background border rounded-full overflow-hidden p-[1px] ${style.progressBarBorder}`}>
              <div 
                className={`h-full rounded-full transition-all duration-100 ease-out ${style.progressBarFill}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            
            <div className={`flex items-center justify-between text-[8px] font-mono uppercase tracking-widest opacity-60 ${style.primaryColor ? '' : 'text-muted-foreground'}`}>
              <span style={style.primaryColor ? { color: style.primaryColor } : undefined}>{TEXT_SECURE_SHELL}</span>
              <span style={style.secondaryColor ? { color: style.secondaryColor } : undefined}>{TEXT_TRANSCEIVER_OK}</span>
              <span style={style.accentColor ? { color: style.accentColor } : undefined}>{TEXT_CYBR_DEATH}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
