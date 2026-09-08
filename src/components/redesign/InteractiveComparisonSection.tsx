'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Check,
  Copy,
  ArrowUpRight,
  Terminal,
  Layers,
  GitMerge,
  ShieldCheck,
  Cpu,
  Boxes,
  Code2,
} from 'lucide-react';
import { ContourGlassButton } from '@/components/ui/ContourGlassButton';
import { cn } from '@/lib/utils';

/** Apple Human Interface Guidelines / Emil Kowalski Spring Presets */
const APPLE_SPRINGS = {
  sheet: { type: 'spring', damping: 32, stiffness: 300, mass: 1 },
  iconPress: { type: 'spring', damping: 20, stiffness: 450, mass: 0.5 },
  fluidMorph: { type: 'spring', damping: 26, stiffness: 280, mass: 0.8 },
  snappy: { type: 'spring', damping: 28, stiffness: 360, mass: 0.7 },
} as const;

interface ComparisonScenario {
  id: string;
  title: string;
  tagline: string;
  category: string;
  prompt: string;
  claude: {
    modelName: string;
    fileName: string;
    focus: string;
    code: string;
  };
  gpt: {
    modelName: string;
    fileName: string;
    focus: string;
    code: string;
  };
  gemini: {
    modelName: string;
    fileName: string;
    focus: string;
    code: string;
  };
  consensus: {
    title: string;
    summary: string;
    convergencePoints: {
      label: string;
      description: string;
    }[];
  };
}

const COMPARISON_SCENARIOS: ComparisonScenario[] = [
  {
    id: 'crdt-sync',
    title: 'CRDT State Synchronization',
    tagline: 'Deterministic merge vectors, zero-allocation WebSocket heartbeats, and bounded backpressure.',
    category: 'Distributed Systems',
    prompt:
      'Implement an idempotent, zero-allocation WebSocket CRDT state synchronizer in TypeScript with deterministic peer vector clocks.',
    claude: {
      modelName: 'Claude 3.7 Sonnet',
      fileName: 'CRDTSyncEngine.ts',
      focus: 'Deterministic Vector Clock Deduplication',
      code: `export class CRDTSyncEngine<T> {
  private versionVector = new Map<string, number>();
  private buffer: Array<CRDTOperation<T>> = [];

  public applyRemote(op: CRDTOperation<T>): boolean {
    const current = this.versionVector.get(op.peerId) || 0;
    if (op.seq <= current) return false; // Idempotent deduplication
    this.versionVector.set(op.peerId, op.seq);
    this.executeDeterministicMerge(op);
    return true;
  }
}`,
    },
    gpt: {
      modelName: 'GPT-4o',
      fileName: 'WebSocketSyncManager.ts',
      focus: 'Binary Frame Protocol & Keepalive',
      code: `export class WebSocketSyncManager {
  private socket: WebSocket;
  private ackQueue = new Set<string>();

  constructor(endpoint: string) {
    this.socket = new WebSocket(endpoint);
    this.socket.binaryType = "arraybuffer";
    this.setupHeartbeat();
  }

  private setupHeartbeat() {
    // 0x9 WebSocket binary ping control frame
    setInterval(() => this.socket.send(new Uint8Array([0x9])), 15000);
  }
}`,
    },
    gemini: {
      modelName: 'Gemini 2.5 Pro',
      fileName: 'CRDTPipeline.ts',
      focus: 'Bounded Channel & Stream Compression',
      code: `// Multi-tier backpressure state pipeline
export const createCRDTPipeline = () => ({
  compressor: new StreamCompressor({ format: 'deflate-raw' }),
  backpressureQueue: new BoundedChannel({ capacity: 64_000 }),
  telemetryHook: (delta: number) => emitMetric('crdt_sync_ms', delta),
  flush: async (sink: ByteSink) => {
    while (!backpressureQueue.isEmpty()) {
      await sink.write(await compressor.compress(backpressureQueue.pop()));
    }
  }
});`,
    },
    consensus: {
      title: 'Unified High-Throughput Synchronization Engine',
      summary:
        "Combined Claude 3.7's deterministic version-vector deduplication with GPT-4o's binary heartbeat frame protocol and Gemini's 64k backpressure-bounded channel for zero-loss, low-latency state propagation.",
      convergencePoints: [
        {
          label: 'Idempotency',
          description: 'Version vectors prune out-of-order duplicate ops before memory buffering.',
        },
        {
          label: 'Transport',
          description: 'Raw ArrayBuffer binary frames eliminate JSON serialization overhead.',
        },
        {
          label: 'Backpressure',
          description: 'Bounded 64k channel prevents memory exhaustion during network partition recovery.',
        },
      ],
    },
  },
  {
    id: 'db-optimizer',
    title: 'PostgreSQL Sharding Router',
    tagline: 'Kernel hash-range partition pruning, Murmur3 connection pooling, and strict predicate isolation.',
    category: 'Database Architecture',
    prompt:
      'Design a distributed query planner that routes queries across horizontal Postgres tenant shards with zero cross-shard locks.',
    claude: {
      modelName: 'Claude 3.7 Sonnet',
      fileName: 'tenant_partition.sql',
      focus: 'Parallel-Safe Hash-Range Function',
      code: `CREATE OR REPLACE FUNCTION route_tenant_partition(tenant_uuid UUID)
RETURNS TABLE (shard_id INT, connection_dsn TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.dsn
  FROM cluster_shards s
  WHERE s.hash_range @> hashtext(tenant_uuid::text);
END;
$$ LANGUAGE plpgsql STABLE PARALLEL SAFE;`,
    },
    gpt: {
      modelName: 'GPT-4o',
      fileName: 'ShardRouter.ts',
      focus: 'Murmur3 Connection Multiplexing',
      code: `interface ShardRouterConfig {
  shards: Map<number, ConnectionPool>;
  hasher: (key: string) => number;
}

export function getTenantConnection(tenantId: string, cfg: ShardRouterConfig) {
  const hash = murmur3(tenantId) % cfg.shards.size;
  return cfg.shards.get(hash)!.acquire();
}`,
    },
    gemini: {
      modelName: 'Gemini 2.5 Pro',
      fileName: 'DistributedPlanner.ts',
      focus: 'Predicate Partition Pruning',
      code: `// Global Query Planner with Partition Pruning
export const distributedPlanner = {
  analyzePlan: (sql: string, tenantId: string) => {
    assertSingleTenantPredicate(sql, tenantId);
    return routeToShard(tenantId, {
      isolation: 'READ COMMITTED',
      pruneUnreferencedShards: true
    });
  }
};`,
    },
    consensus: {
      title: 'Zero-Lock Shard Partition & Connection Pipeline',
      summary:
        "Synthesized Claude 3.7's kernel-level hash-range partition function on the database engine with GPT-4o's Murmur3 connection pool multiplexer and Gemini's strict single-tenant predicate isolation layer.",
      convergencePoints: [
        {
          label: 'Kernel Pruning',
          description: 'Hash-range containment lookup routes queries directly at the Postgres engine level.',
        },
        {
          label: 'Pool Multiplexing',
          description: 'Murmur3 distribution ensures uniform load across tenant connection pools.',
        },
        {
          label: 'Zero Cross-Leakage',
          description: 'Single-tenant predicate verification guarantees queries never escape their partition.',
        },
      ],
    },
  },
  {
    id: 'raft-consensus',
    title: 'Raft Distributed Consensus',
    tagline: 'Monotonic election term progression, jittered heartbeat timeouts, and epoch lease fencing.',
    category: 'Consensus Protocols',
    prompt:
      'Implement a distributed Raft consensus node with monotonic term increments, election timeouts, and split-brain fencing.',
    claude: {
      modelName: 'Claude 3.7 Sonnet',
      fileName: 'RaftElection.ts',
      focus: 'Monotonic Term State Machine',
      code: `export class RaftLeaderElection {
  private currentTerm = 0;
  private votedFor: string | null = null;
  private state: 'FOLLOWER' | 'CANDIDATE' | 'LEADER' = 'FOLLOWER';

  public requestVote(candidateTerm: number, candidateId: string): boolean {
    if (candidateTerm > this.currentTerm) {
      this.currentTerm = candidateTerm;
      this.state = 'FOLLOWER';
      this.votedFor = null;
    }
    if (candidateTerm === this.currentTerm && (!this.votedFor || this.votedFor === candidateId)) {
      this.votedFor = candidateId;
      return true;
    }
    return false;
  }
}`,
    },
    gpt: {
      modelName: 'GPT-4o',
      fileName: 'ElectionTimer.ts',
      focus: 'Jittered Heartbeat Leases',
      code: `export class ElectionTimerManager {
  private timer: NodeJS.Timeout | null = null;
  private readonly baseTimeoutMs = 150;

  public resetHeartbeat(onTimeout: () => void): void {
    if (this.timer) clearTimeout(this.timer);
    // Randomized jitter to eliminate split-vote collisions
    const jitter = Math.floor(Math.random() * 150);
    this.timer = setTimeout(onTimeout, this.baseTimeoutMs + jitter);
  }
}`,
    },
    gemini: {
      modelName: 'Gemini 2.5 Pro',
      fileName: 'LeaseFencer.ts',
      focus: 'Split-Brain Epoch Fencing',
      code: `// Split-Brain Monotonic Lease Fencer
export class LeaseFencer {
  private activeLeaseExpiry = 0;

  public validateLease(quorumAcks: number, clusterSize: number): boolean {
    const hasQuorum = quorumAcks >= Math.floor(clusterSize / 2) + 1;
    if (hasQuorum) this.activeLeaseExpiry = Date.now() + 500;
    return hasQuorum && Date.now() < this.activeLeaseExpiry;
  }
}`,
    },
    consensus: {
      title: 'Fault-Tolerant Leader Election & Lease Epoch Engine',
      summary:
        "Adopted Claude 3.7's strict monotonic state machine with GPT-4o's jittered heartbeat timer to eliminate split-vote deadlocks, backed by Gemini's epoch lease fencer to guarantee zero split-brain write divergence.",
      convergencePoints: [
        {
          label: 'Term Monotonicity',
          description: 'Strict monotonic term increments prevent stale candidate transitions.',
        },
        {
          label: 'Collision Jitter',
          description: 'Randomized 150–300ms election windows resolve simultaneous split votes instantly.',
        },
        {
          label: 'Lease Fencing',
          description: 'Quorum-backed 500ms epoch lease prevents partitioned leaders from accepting rogue writes.',
        },
      ],
    },
  },
];

/** Minimalist, high-craft code syntax renderer */
function HighlightedCode({ code }: { code: string }) {
  const lines = code.trim().split('\n');

  return (
    <pre className="font-mono text-xs leading-relaxed text-zinc-300 overflow-x-auto selection:bg-brand-500/20 selection:text-white">
      <code>
        {lines.map((line, idx) => {
          const isComment = line.trim().startsWith('//');
          const isKeywordLine = /^\s*(export|class|private|public|interface|const|return|if|CREATE|BEGIN|SELECT|FROM|WHERE|LANGUAGE|RETURNS)\b/.test(
            line,
          );

          return (
            <div key={idx} className="table-row group">
              <span className="table-cell pr-4 text-right select-none text-zinc-600 group-hover:text-zinc-500 transition-colors text-[11px] w-6">
                {idx + 1}
              </span>
              <span
                className={cn(
                  'table-cell whitespace-pre',
                  isComment
                    ? 'text-zinc-500 italic'
                    : isKeywordLine
                    ? 'text-zinc-200'
                    : 'text-zinc-300',
                )}
              >
                {line}
              </span>
            </div>
          );
        })}
      </code>
    </pre>
  );
}

export function InteractiveComparisonSection({ id = 'playground' }: { id?: string }) {
  const [activeScenarioId, setActiveScenarioId] = useState(COMPARISON_SCENARIOS[0].id);
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const scenario =
    COMPARISON_SCENARIOS.find((s) => s.id === activeScenarioId) || COMPARISON_SCENARIOS[0];

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(key);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  return (
    <section
      id={id}
      className="relative z-20 w-full border-t border-white/5 bg-transparent px-4 py-24 sm:px-6 lg:px-8 scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto space-y-12 sm:space-y-16">
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
          <div className="max-w-3xl space-y-5">
            <div className="space-y-3">
              <h2 className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-white">
                Multi-model workbench. Disagreements settled in real time.
              </h2>
              <p className="text-base sm:text-lg leading-relaxed text-zinc-400">
                Run prompts simultaneously across frontier models. Review their divergent logic paths side by
                side, then synthesize the optimal consensus specification.
              </p>
            </div>

            {/* Disclaimer: this walkthrough is authored sample content, not a captured benchmark.
                Saying so is cheaper than being caught implying it. */}
            <p className="inline-flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-md px-3.5 py-1.5 text-xs text-zinc-400">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand-400/80" />
              <span>Illustrative walkthrough — sample responses and timings, not a benchmark run.</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3.5 shrink-0 self-start lg:self-auto">
            <ContourGlassButton
              effect="rim"
              shape="rectangle"
              asChild
              size="default"
            >
              <Link href="/playground">
                <Image
                  src="/cybrdeck-logo/playground_transparent.png"
                  alt=""
                  width={16}
                  height={16}
                  className="w-4 h-4 object-contain mr-1.5 transition-transform group-hover:scale-110"
                  aria-hidden
                />
                <span>Launch Playground</span>
              </Link>
            </ContourGlassButton>

            <ContourGlassButton
              effect="rim"
              asChild
              size="default"
              variant="secondary"
            >
              <Link href="/playground">
                <span>Learn More</span>
                <ArrowUpRight className="ml-1.5 w-3.5 h-3.5 text-zinc-300" />
              </Link>
            </ContourGlassButton>
          </div>
        </div>

        {/* Master Liquid Glass Container */}
        <div className="relative rounded-3xl cd-crystal p-5 sm:p-7 lg:p-8 space-y-6 sm:space-y-8 overflow-hidden">
          {/* Top Control Bar: Scenario Segmented Switcher */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
            <div className="inline-flex p-1.5 rounded-2xl cd-crystal cd-crystal--nested overflow-x-auto max-w-full">
              {COMPARISON_SCENARIOS.map((s) => {
                const isActive = activeScenarioId === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveScenarioId(s.id)}
                    className={cn(
                      'relative px-4 py-2 rounded-xl text-xs font-medium tracking-tight transition-colors duration-200 outline-none whitespace-nowrap active:scale-[0.98]',
                      isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-200',
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activePlaygroundTab"
                        transition={prefersReducedMotion ? { duration: 0 } : APPLE_SPRINGS.fluidMorph}
                        className="absolute inset-0 rounded-xl bg-white/[0.08] border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.25)]"
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      <span className={cn('h-1.5 w-1.5 rounded-full', isActive ? 'bg-brand-400' : 'bg-zinc-600')} />
                      {s.title}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80 animate-pulse" />
              <span>3 Frontier Models Active</span>
            </div>
          </div>

          {/* Prompt Specification Dock */}
          <div className="rounded-2xl cd-crystal cd-crystal--nested p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-brand-500/10 border border-brand-500/25 flex items-center justify-center text-brand-300 shrink-0">
                <Terminal className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-medium text-brand-300/80 tracking-wide uppercase block">
                  Evaluation Prompt · {scenario.category}
                </span>
                <p className="text-sm font-medium text-white truncate max-w-2xl">
                  {scenario.prompt}
                </p>
              </div>
            </div>

            <div className="shrink-0 hidden md:flex items-center gap-2 text-[11px] text-zinc-400 border border-white/5 rounded-lg px-2.5 py-1 bg-white/[0.02]">
              <Code2 className="w-3.5 h-3.5 text-brand-400" />
              <span>TypeScript Systems Spec</span>
            </div>
          </div>

          {/* Animated Model Slabs (Side-by-Side Triad) */}
          <AnimatePresence mode="wait">
            <motion.div
              key={scenario.id}
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6"
            >
              {/* 1. Claude 3.7 Sonnet */}
              <motion.div
                onHoverStart={() => setHoveredModel('claude')}
                onHoverEnd={() => setHoveredModel(null)}
                whileHover={prefersReducedMotion ? {} : { y: -3 }}
                transition={APPLE_SPRINGS.snappy}
                className={cn(
                  'rounded-2xl cd-crystal cd-crystal--nested flex flex-col justify-between overflow-hidden transition-opacity duration-200',
                  hoveredModel && hoveredModel !== 'claude' ? 'opacity-75' : 'opacity-100',
                )}
              >
                <div>
                  {/* Window Chrome Header */}
                  <div className="px-4 py-3.5 border-b border-white/[0.07] bg-white/[0.02] flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="h-2 w-2 rounded-full bg-brand-400/90" />
                      <span className="text-xs font-semibold text-white tracking-tight">
                        {scenario.claude.modelName}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {scenario.claude.fileName}
                      </span>
                    </div>

                    <button
                      onClick={() => handleCopy('claude', scenario.claude.code)}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors active:scale-95"
                      title="Copy implementation"
                      aria-label="Copy Claude implementation"
                    >
                      {copiedSnippet === 'claude' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Code Body */}
                  <div className="p-4 sm:p-5 bg-black/40 min-h-[220px]">
                    <HighlightedCode code={scenario.claude.code} />
                  </div>
                </div>

                {/* Model Architectural Orientation */}
                <div className="p-3.5 border-t border-white/[0.06] bg-white/[0.015] flex items-center gap-2">
                  <span className="text-[11px] text-zinc-400 leading-snug">
                    <strong className="text-white font-medium">Architecture:</strong>{' '}
                    {scenario.claude.focus}
                  </span>
                </div>
              </motion.div>

              {/* 2. GPT-4o */}
              <motion.div
                onHoverStart={() => setHoveredModel('gpt')}
                onHoverEnd={() => setHoveredModel(null)}
                whileHover={prefersReducedMotion ? {} : { y: -3 }}
                transition={APPLE_SPRINGS.snappy}
                className={cn(
                  'rounded-2xl cd-crystal cd-crystal--nested flex flex-col justify-between overflow-hidden transition-opacity duration-200',
                  hoveredModel && hoveredModel !== 'gpt' ? 'opacity-75' : 'opacity-100',
                )}
              >
                <div>
                  {/* Window Chrome Header */}
                  <div className="px-4 py-3.5 border-b border-white/[0.07] bg-white/[0.02] flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400/90" />
                      <span className="text-xs font-semibold text-white tracking-tight">
                        {scenario.gpt.modelName}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {scenario.gpt.fileName}
                      </span>
                    </div>

                    <button
                      onClick={() => handleCopy('gpt', scenario.gpt.code)}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors active:scale-95"
                      title="Copy implementation"
                      aria-label="Copy GPT implementation"
                    >
                      {copiedSnippet === 'gpt' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Code Body */}
                  <div className="p-4 sm:p-5 bg-black/40 min-h-[220px]">
                    <HighlightedCode code={scenario.gpt.code} />
                  </div>
                </div>

                {/* Model Architectural Orientation */}
                <div className="p-3.5 border-t border-white/[0.06] bg-white/[0.015] flex items-center gap-2">
                  <span className="text-[11px] text-zinc-400 leading-snug">
                    <strong className="text-white font-medium">Architecture:</strong>{' '}
                    {scenario.gpt.focus}
                  </span>
                </div>
              </motion.div>

              {/* 3. Gemini 2.5 Pro */}
              <motion.div
                onHoverStart={() => setHoveredModel('gemini')}
                onHoverEnd={() => setHoveredModel(null)}
                whileHover={prefersReducedMotion ? {} : { y: -3 }}
                transition={APPLE_SPRINGS.snappy}
                className={cn(
                  'rounded-2xl cd-crystal cd-crystal--nested flex flex-col justify-between overflow-hidden transition-opacity duration-200',
                  hoveredModel && hoveredModel !== 'gemini' ? 'opacity-75' : 'opacity-100',
                )}
              >
                <div>
                  {/* Window Chrome Header */}
                  <div className="px-4 py-3.5 border-b border-white/[0.07] bg-white/[0.02] flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="h-2 w-2 rounded-full bg-sky-400/90" />
                      <span className="text-xs font-semibold text-white tracking-tight">
                        {scenario.gemini.modelName}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {scenario.gemini.fileName}
                      </span>
                    </div>

                    <button
                      onClick={() => handleCopy('gemini', scenario.gemini.code)}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors active:scale-95"
                      title="Copy implementation"
                      aria-label="Copy Gemini implementation"
                    >
                      {copiedSnippet === 'gemini' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Code Body */}
                  <div className="p-4 sm:p-5 bg-black/40 min-h-[220px]">
                    <HighlightedCode code={scenario.gemini.code} />
                  </div>
                </div>

                {/* Model Architectural Orientation */}
                <div className="p-3.5 border-t border-white/[0.06] bg-white/[0.015] flex items-center gap-2">
                  <span className="text-[11px] text-zinc-400 leading-snug">
                    <strong className="text-white font-medium">Architecture:</strong>{' '}
                    {scenario.gemini.focus}
                  </span>
                </div>
              </motion.div>
            </motion.div>
          </AnimatePresence>

          {/* Unified Consensus Resolution Slab */}
          <div className="rounded-2xl cd-crystal cd-crystal--cyan p-6 sm:p-7 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-4 border-b border-white/10">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-brand-400/15 border border-brand-400/30 flex items-center justify-center text-brand-300">
                    <GitMerge className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-sm font-semibold text-white tracking-tight">
                    {scenario.consensus.title}
                  </h3>
                  <span className="rounded-full px-2.5 py-0.5 text-[10px] font-medium border border-brand-400/30 bg-brand-400/10 text-brand-300">
                    Consensus Resolution
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-3xl">
                  {scenario.consensus.summary}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <button
                  onClick={() =>
                    handleCopy(
                      'consensus',
                      `${scenario.consensus.title}\n\n${scenario.consensus.summary}\n\nKey Principles:\n` +
                        scenario.consensus.convergencePoints
                          .map((p) => `- ${p.label}: ${p.description}`)
                          .join('\n'),
                    )
                  }
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors active:scale-95"
                >
                  {copiedSnippet === 'consensus' ? 'Copied Full Spec' : 'Copy Consensus Spec'}
                </button>

                <ContourGlassButton effect="rim" shape="rectangle" asChild size="sm">
                  <Link href="/playground">
                    <Image
                      src="/cybrdeck-logo/playground_transparent.png"
                      alt=""
                      width={14}
                      height={14}
                      className="w-3.5 h-3.5 object-contain mr-1 transition-transform group-hover:scale-110"
                      aria-hidden
                    />
                    <span>Launch Playground</span>
                  </Link>
                </ContourGlassButton>

                <ContourGlassButton effect="rim" asChild size="sm" variant="secondary">
                  <Link href="/playground">
                    <span>Learn More</span>
                    <ArrowUpRight className="ml-1 w-3 h-3 text-zinc-300" />
                  </Link>
                </ContourGlassButton>
              </div>
            </div>

            {/* Architectural Convergence Points Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {scenario.consensus.convergencePoints.map((point) => (
                <div
                  key={point.label}
                  className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3.5 space-y-1"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
                    <span className="text-xs font-medium text-white">{point.label}</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    {point.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
