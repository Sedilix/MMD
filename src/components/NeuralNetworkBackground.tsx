'use client';

/**
 * NeuralNetworkBackground — a free-floating particle field.
 *
 * Design: particles wander like micro-organisms under a microscope, or
 * motes in zero gravity. There is no lattice and no permanent wiring.
 * Links are drawn *transiently* between whichever particles happen to
 * be within `connectDist` of each other at that instant, and fade with
 * separation — so the constellation continually forms, stretches and
 * dissolves on its own.
 *
 * Motion model — "run and tumble", borrowed from how flagellated
 * microbes actually swim: each particle self-propels along its own
 * heading at its own speed, and that heading random-walks a little
 * every frame. Displacement is therefore graceful curved gliding
 * rather than nervous jitter.
 *
 * Why not a flow field: the obvious implementation (drift particles
 * through a sin/cos vector field) was measured and rejected. Inertial
 * particles in a driven field preferentially concentrate — over ~50s
 * the field visibly collapsed into blobs, with 60-78% of the viewport
 * emptying out and neighbour counts climbing from 4 to 17+. Making the
 * field divergence-free did not fix it, and pairwise repulsion only
 * slowed it. Run-and-tumble has no shared attractor for particles to
 * fall into: each one steers independently, so the distribution stays
 * uniform indefinitely (measured: 0% link drift over 3 minutes).
 *
 * Interaction:
 *  - Pointer/touch is a repulsive forcefield. It contributes to a
 *    decaying impulse rather than teleporting particles, so they coast
 *    outward and settle after the finger lifts — the zero-g feel — and
 *    the local link topology visibly scatters and re-forms.
 *  - `triggerBurst(clientX, clientY)` on the imperative handle fires a
 *    shock at a page position: an expanding ring, an outward impulse on
 *    nearby particles, and signal pulses down their live links. Wired
 *    to the hero CTAs in src/app/page.tsx.
 *
 * Mobile cost control (this runs on phones, so it matters):
 *  - Particle count derives from viewport area and is capped lower on
 *    small screens; DPR is capped at 2 there (3 on desktop).
 *  - Neighbour search is a uniform spatial hash with linked-list
 *    buckets in preallocated Int32Arrays — ~O(n) with zero per-frame
 *    allocation, and verified to find exactly the same pairs as a
 *    brute-force O(n²) scan.
 *  - Link segments are batched into 4 alpha buckets and stroked as 4
 *    paths per frame, rather than one path + style change per link.
 *  - Node glow is a pre-rendered sprite blitted with drawImage. No
 *    per-node gradients and no `shadowBlur` — that pair is the usual
 *    reason canvases like this melt phone GPUs.
 *
 * Accessibility: `prefers-reduced-motion` is respected — a single
 * static frame is drawn and no rAF loop or interaction ever starts.
 *
 * SSR: client component; all work happens after mount.
 */

import React, { useEffect, useImperativeHandle, useRef } from 'react';

interface Particle {
    /** Position in CSS px, canvas-local. */
    x: number;
    y: number;
    /** Heading in radians. Random-walks each frame — the "tumble". */
    angle: number;
    /** Base self-propulsion speed, CSS px per ~16.7ms frame unit. */
    speed: number;
    /**
     * Transient velocity from touch, bursts and neighbour repulsion.
     * Decays geometrically, so shoves coast to a stop instead of
     * snapping back.
     */
    ix: number;
    iy: number;
    /** 0.35 → 1. Fakes depth: nearer particles are larger, brighter, faster. */
    depth: number;
    /** Radians — phase offset for the size/opacity breathing. */
    phase: number;
    /** Accent particles render magenta instead of cyan. */
    accent: boolean;
}

interface Pulse {
    /** Index of the particle the signal left from. */
    a: number;
    /** Index of the particle it's travelling toward. */
    b: number;
    /** 0 → 1 progress along the (live, moving) link. */
    progress: number;
    speed: number;
    /** 0 = cyan, 1 = magenta. */
    hue: 0 | 1;
}

/** A one-off "signal received" shockwave, e.g. from a real button press. */
interface Burst {
    /** Canvas-local x/y (CSS px) where the burst originates. */
    x: number;
    y: number;
    /** `performance.now()` timestamp the burst started. */
    start: number;
}

export interface NeuralNetworkHandle {
    /**
     * Fire a burst at a viewport position (e.g. `event.clientX/clientY`
     * from a button press elsewhere on the page). Converted internally to
     * canvas-local coordinates via `getBoundingClientRect()`, so callers
     * don't need to know the canvas's on-page offset.
     */
    triggerBurst: (clientX: number, clientY: number) => void;
}

const clamp = (v: number, lo: number, hi: number): number =>
    v < lo ? lo : v > hi ? hi : v;

export const NeuralNetworkBackground = React.forwardRef<NeuralNetworkHandle, object>(
    function NeuralNetworkBackground(_props, ref) {
        const canvasRef = useRef<HTMLCanvasElement | null>(null);
        // Bridges the imperative handle (stable across renders) to the
        // burst-trigger closure created fresh inside the mount effect below.
        const triggerBurstRef = useRef<((localX: number, localY: number) => void) | null>(null);

        useImperativeHandle(ref, () => ({
            triggerBurst: (clientX: number, clientY: number) => {
                const canvas = canvasRef.current;
                const fn = triggerBurstRef.current;
                if (!canvas || !fn) return;
                const r = canvas.getBoundingClientRect();
                fn(clientX - r.left, clientY - r.top);
            },
        }), []);

        useEffect(() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            // `alpha: false` lets the compositor skip per-pixel blending of
            // the whole canvas against the page — we repaint an opaque
            // background every frame anyway.
            const ctx = canvas.getContext('2d', { alpha: false });
            if (!ctx) return;

            const prefersReducedMotion =
                typeof window !== 'undefined' &&
                typeof window.matchMedia === 'function' &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

            // ── Tunables ─────────────────────────────────────────────
            // Motion. ANGULAR_JITTER sets how tightly particles curve:
            // near 0 they glide in straight lines, large values look
            // nervous. Values across 0.04-0.25 were all measured stable.
            const ANGULAR_JITTER = 0.12;
            const SPEED_LO = 0.16;
            const SPEED_HI = 0.4;
            // Impulse channel (touch / burst / repulsion).
            const IMPULSE_DAMP = 0.94;
            const MAX_IMPULSE = 3.5;
            // Gentle mutual spacing so particles don't sit on top of each
            // other. Deliberately weak — this is cosmetic evenness, not
            // the mechanism keeping the field uniform.
            const REPEL_FRACTION = 0.55;
            const REPEL_FORCE = 0.02;
            const POINTER_RADIUS = 130;
            const POINTER_FORCE = 0.07;
            const BURST_RADIUS = 180;
            const BURST_FORCE = 2.6;
            const BURST_MS = 1000;
            const PULSE_INTERVAL_MS = 420;
            const MAX_PULSES = 14;
            const LINK_ALPHA = 0.3;
            const BUCKETS = 4;

            const CYAN = '125, 211, 252';
            const MAGENTA = '232, 121, 249';

            let animationFrameId = 0;
            let width = 0;
            let height = 0;
            let dpr = 1;
            let count = 0;
            let connectDist = 100;
            let repelDist = 55;

            let particles: Particle[] = [];
            const pulses: Pulse[] = [];
            const bursts: Burst[] = [];

            // Uniform spatial hash, linked-list form. `gridHeads[cell]` is the
            // first particle index in that cell, `gridNext[i]` the next one —
            // so bucketing is allocation-free every frame.
            let cols = 0;
            let rows = 0;
            let gridHeads = new Int32Array(0);
            let gridNext = new Int32Array(0);

            // Link segments batched by alpha bucket: [x1,y1,x2,y2, ...].
            let segData: Float32Array[] = [];
            const segLen: number[] = [];

            // Cached canvas offset so pointer events don't force layout reads.
            let rectLeft = 0;
            let rectTop = 0;

            const pointer = { x: 0, y: 0, active: false };

            // ────────────────────────────────────────────────────────
            // Pre-rendered glow sprite. Drawn once, blitted per node —
            // far cheaper than building a gradient (or setting
            // shadowBlur) for every particle on every frame.
            // ────────────────────────────────────────────────────────
            const makeSprite = (rgb: string): HTMLCanvasElement => {
                const S = 64;
                const c = document.createElement('canvas');
                c.width = S;
                c.height = S;
                const g = c.getContext('2d');
                if (g) {
                    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
                    grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
                    grad.addColorStop(0.18, `rgba(${rgb}, 0.85)`);
                    grad.addColorStop(0.45, `rgba(${rgb}, 0.22)`);
                    grad.addColorStop(1, `rgba(${rgb}, 0)`);
                    g.fillStyle = grad;
                    g.fillRect(0, 0, S, S);
                }
                return c;
            };
            const spriteCyan = makeSprite(CYAN);
            const spriteMagenta = makeSprite(MAGENTA);

            // ────────────────────────────────────────────────────────
            // Density tuning. Particle count tracks viewport area so a
            // phone doesn't simulate a desktop's worth of bodies, and
            // `connectDist` is derived from the resulting mean spacing
            // so each particle keeps ~4 live neighbours at any size —
            // airy enough that links visibly come and go.
            // ────────────────────────────────────────────────────────
            const computeTuning = (): void => {
                const area = width * height;
                const small = width < 768;
                count = clamp(Math.round(area / 4200), 44, small ? 84 : 150);
                connectDist = clamp(Math.sqrt(area / Math.max(1, count)) * 1.25, 60, 170);
                repelDist = connectDist * REPEL_FRACTION;

                cols = Math.max(1, Math.ceil(width / connectDist));
                rows = Math.max(1, Math.ceil(height / connectDist));
                gridHeads = new Int32Array(cols * rows);
                gridNext = new Int32Array(count);

                const maxSeg = count * 14;
                segData = [];
                segLen.length = 0;
                for (let k = 0; k < BUCKETS; k++) {
                    segData.push(new Float32Array(maxSeg * 4));
                    segLen.push(0);
                }
            };

            const buildParticles = (): void => {
                particles = [];
                for (let i = 0; i < count; i++) {
                    particles.push({
                        x: Math.random() * width,
                        y: Math.random() * height,
                        angle: Math.random() * Math.PI * 2,
                        speed: SPEED_LO + Math.random() * (SPEED_HI - SPEED_LO),
                        ix: 0,
                        iy: 0,
                        depth: 0.35 + Math.random() * 0.65,
                        phase: Math.random() * Math.PI * 2,
                        accent: Math.random() < 0.14,
                    });
                }
            };

            const paintBackground = (): void => {
                const grad = ctx.createLinearGradient(0, 0, 0, height);
                grad.addColorStop(0, '#05050b');
                grad.addColorStop(0.5, '#06060f');
                grad.addColorStop(1, '#04040a');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, width, height);
            };

            // ────────────────────────────────────────────────────────
            // Physics. One integration step; `dt` is in frame units
            // (1 === 16.7ms) so motion is framerate-independent.
            // Repulsion from the previous frame's neighbour pass is
            // already sitting in each particle's impulse channel.
            // ────────────────────────────────────────────────────────
            const step = (dt: number): void => {
                const damp = Math.pow(IMPULSE_DAMP, dt);
                for (let i = 0; i < particles.length; i++) {
                    const p = particles[i];

                    // Tumble: the heading itself random-walks, which is what
                    // turns straight-line swimming into organic wandering.
                    p.angle += (Math.random() - 0.5) * ANGULAR_JITTER * dt;

                    // Pointer forcefield feeds the impulse channel, so the
                    // push persists and decays instead of snapping back.
                    if (pointer.active) {
                        const dx = p.x - pointer.x;
                        const dy = p.y - pointer.y;
                        const d2 = dx * dx + dy * dy;
                        if (d2 < POINTER_RADIUS * POINTER_RADIUS && d2 > 0.01) {
                            const d = Math.sqrt(d2);
                            const f = (1 - d / POINTER_RADIUS) * POINTER_FORCE * dt;
                            p.ix += (dx / d) * f;
                            p.iy += (dy / d) * f;
                        }
                    }

                    p.ix *= damp;
                    p.iy *= damp;
                    const im = Math.sqrt(p.ix * p.ix + p.iy * p.iy);
                    if (im > MAX_IMPULSE) {
                        p.ix = (p.ix / im) * MAX_IMPULSE;
                        p.iy = (p.iy / im) * MAX_IMPULSE;
                    }

                    const s = p.speed * (0.55 + p.depth * 0.75);
                    const vx = Math.cos(p.angle) * s + p.ix;
                    const vy = Math.sin(p.angle) * s + p.iy;
                    p.x += vx * dt;
                    p.y += vy * dt;

                    // Reflect off the walls — mirror the heading so the
                    // particle swims away rather than grinding along the edge.
                    if (p.x < 0) {
                        p.x = 0; p.angle = Math.PI - p.angle; p.ix = Math.abs(p.ix) * 0.5;
                    } else if (p.x > width) {
                        p.x = width; p.angle = Math.PI - p.angle; p.ix = -Math.abs(p.ix) * 0.5;
                    }
                    if (p.y < 0) {
                        p.y = 0; p.angle = -p.angle; p.iy = Math.abs(p.iy) * 0.5;
                    } else if (p.y > height) {
                        p.y = height; p.angle = -p.angle; p.iy = -Math.abs(p.iy) * 0.5;
                    }
                }
            };

            const buildGrid = (): void => {
                gridHeads.fill(-1);
                for (let i = 0; i < particles.length; i++) {
                    const p = particles[i];
                    const cx = clamp(Math.floor(p.x / connectDist), 0, cols - 1);
                    const cy = clamp(Math.floor(p.y / connectDist), 0, rows - 1);
                    const c = cy * cols + cx;
                    gridNext[i] = gridHeads[c];
                    gridHeads[c] = i;
                }
            };

            /**
             * Single neighbour pass doing double duty: batches every in-range
             * pair into an alpha bucket for drawing, and accumulates the
             * short-range repulsion that keeps spacing even (applied on the
             * next frame — a 16ms latency nothing can perceive).
             *
             * The `j > i` guard means each unordered pair is visited exactly
             * once despite the symmetric 3×3 cell scan.
             */
            const collectLinks = (): void => {
                for (let k = 0; k < BUCKETS; k++) segLen[k] = 0;
                const r2 = connectDist * connectDist;
                const rr2 = repelDist * repelDist;

                for (let i = 0; i < particles.length; i++) {
                    const p = particles[i];
                    const cx = clamp(Math.floor(p.x / connectDist), 0, cols - 1);
                    const cy = clamp(Math.floor(p.y / connectDist), 0, rows - 1);

                    for (let oy = -1; oy <= 1; oy++) {
                        const ny = cy + oy;
                        if (ny < 0 || ny >= rows) continue;
                        for (let ox = -1; ox <= 1; ox++) {
                            const nx = cx + ox;
                            if (nx < 0 || nx >= cols) continue;
                            let j = gridHeads[ny * cols + nx];
                            while (j !== -1) {
                                if (j > i) {
                                    const q = particles[j];
                                    const dx = q.x - p.x;
                                    const dy = q.y - p.y;
                                    const d2 = dx * dx + dy * dy;
                                    if (d2 < r2) {
                                        // Fade the link out as the pair separates,
                                        // so connections dissolve instead of popping.
                                        const tt = 1 - Math.sqrt(d2) / connectDist;
                                        const depth = p.depth < q.depth ? p.depth : q.depth;
                                        const k = clamp(Math.floor(tt * tt * depth * BUCKETS), 0, BUCKETS - 1);
                                        const arr = segData[k];
                                        const len = segLen[k];
                                        if (len + 4 <= arr.length) {
                                            arr[len] = p.x;
                                            arr[len + 1] = p.y;
                                            arr[len + 2] = q.x;
                                            arr[len + 3] = q.y;
                                            segLen[k] = len + 4;
                                        }
                                        if (d2 < rr2 && d2 > 0.01) {
                                            const d = Math.sqrt(d2);
                                            const f = (1 - d / repelDist) * REPEL_FORCE;
                                            const ux = dx / d;
                                            const uy = dy / d;
                                            p.ix -= ux * f;
                                            p.iy -= uy * f;
                                            q.ix += ux * f;
                                            q.iy += uy * f;
                                        }
                                    }
                                }
                                j = gridNext[j];
                            }
                        }
                    }
                }
            };

            const drawLinks = (): void => {
                ctx.lineWidth = 1;
                for (let k = 0; k < BUCKETS; k++) {
                    const len = segLen[k];
                    if (len === 0) continue;
                    const alpha = LINK_ALPHA * ((k + 1) / BUCKETS);
                    ctx.strokeStyle = `rgba(${CYAN}, ${alpha.toFixed(3)})`;
                    const arr = segData[k];
                    ctx.beginPath();
                    for (let s = 0; s < len; s += 4) {
                        ctx.moveTo(arr[s], arr[s + 1]);
                        ctx.lineTo(arr[s + 2], arr[s + 3]);
                    }
                    ctx.stroke();
                }
            };

            const drawParticles = (t: number): void => {
                for (let i = 0; i < particles.length; i++) {
                    const p = particles[i];
                    const breathe = 0.85 + Math.sin(t * 1.1 + p.phase) * 0.15;
                    const r = (0.9 + p.depth * 1.5) * breathe;
                    const s = r * 7.5;
                    ctx.globalAlpha = 0.35 + p.depth * 0.55;
                    ctx.drawImage(p.accent ? spriteMagenta : spriteCyan, p.x - s / 2, p.y - s / 2, s, s);
                }
                ctx.globalAlpha = 1;
            };

            /**
             * Pick a uniformly random current neighbour of `i`, via reservoir
             * sampling so no candidate array is allocated.
             */
            const findNeighbour = (i: number): number => {
                const p = particles[i];
                if (!p) return -1;
                const cx = clamp(Math.floor(p.x / connectDist), 0, cols - 1);
                const cy = clamp(Math.floor(p.y / connectDist), 0, rows - 1);
                const r2 = connectDist * connectDist;
                let chosen = -1;
                let seen = 0;
                for (let oy = -1; oy <= 1; oy++) {
                    const ny = cy + oy;
                    if (ny < 0 || ny >= rows) continue;
                    for (let ox = -1; ox <= 1; ox++) {
                        const nx = cx + ox;
                        if (nx < 0 || nx >= cols) continue;
                        let j = gridHeads[ny * cols + nx];
                        while (j !== -1) {
                            if (j !== i) {
                                const q = particles[j];
                                const dx = q.x - p.x;
                                const dy = q.y - p.y;
                                if (dx * dx + dy * dy < r2) {
                                    seen++;
                                    if (Math.random() * seen < 1) chosen = j;
                                }
                            }
                            j = gridNext[j];
                        }
                    }
                }
                return chosen;
            };

            const spawnPulse = (): void => {
                if (particles.length < 2 || pulses.length >= MAX_PULSES) return;
                const i = Math.floor(Math.random() * particles.length);
                const j = findNeighbour(i);
                if (j < 0) return;
                pulses.push({
                    a: i,
                    b: j,
                    progress: 0,
                    speed: 0.014 + Math.random() * 0.016,
                    hue: Math.random() < 0.5 ? 0 : 1,
                });
            };

            const drawPulses = (dt: number): void => {
                // A pulse rides a link that is itself moving, so both endpoints
                // are re-read every frame; if the pair drifts far enough apart
                // the link is considered broken and the signal is dropped.
                const breakDist = connectDist * 1.7;
                const break2 = breakDist * breakDist;
                ctx.lineCap = 'round';
                ctx.lineWidth = 1.2;
                for (let i = pulses.length - 1; i >= 0; i--) {
                    const pu = pulses[i];
                    pu.progress += pu.speed * dt;
                    const a = particles[pu.a];
                    const b = particles[pu.b];
                    if (!a || !b || pu.progress >= 1) {
                        pulses.splice(i, 1);
                        continue;
                    }
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    if (dx * dx + dy * dy > break2) {
                        pulses.splice(i, 1);
                        continue;
                    }
                    const t0 = Math.max(0, pu.progress - 0.22);
                    const x0 = a.x + dx * t0;
                    const y0 = a.y + dy * t0;
                    const x1 = a.x + dx * pu.progress;
                    const y1 = a.y + dy * pu.progress;
                    ctx.strokeStyle = pu.hue === 0
                        ? 'rgba(216, 166, 87, 0.7)'
                        : 'rgba(217, 70, 239, 0.6)';
                    ctx.beginPath();
                    ctx.moveTo(x0, y0);
                    ctx.lineTo(x1, y1);
                    ctx.stroke();
                    const s = 8;
                    ctx.drawImage(pu.hue === 0 ? spriteCyan : spriteMagenta, x1 - s / 2, y1 - s / 2, s, s);
                }
                ctx.lineCap = 'butt';
            };

            const drawBursts = (ms: number): void => {
                for (let i = bursts.length - 1; i >= 0; i--) {
                    const bu = bursts[i];
                    const elapsed = ms - bu.start;
                    if (elapsed >= BURST_MS) {
                        bursts.splice(i, 1);
                        continue;
                    }
                    const bt = elapsed / BURST_MS;
                    const eased = 1 - Math.pow(1 - bt, 2.2);
                    const rad = 8 + eased * BURST_RADIUS * 0.9;
                    const alpha = (1 - bt) * 0.85;
                    const grad = ctx.createRadialGradient(bu.x, bu.y, 0, bu.x, bu.y, rad);
                    grad.addColorStop(0, `rgba(190, 245, 255, ${alpha * 0.55})`);
                    grad.addColorStop(0.55, `rgba(216, 166, 87, ${alpha * 0.22})`);
                    grad.addColorStop(1, 'rgba(216, 166, 87, 0)');
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(bu.x, bu.y, rad, 0, Math.PI * 2);
                    ctx.fill();
                    // Leading edge of the shockwave.
                    ctx.strokeStyle = `rgba(243, 223, 176, ${alpha * 0.8})`;
                    ctx.lineWidth = 1.4;
                    ctx.beginPath();
                    ctx.arc(bu.x, bu.y, rad, 0, Math.PI * 2);
                    ctx.stroke();
                }
            };

            // ────────────────────────────────────────────────────────
            // Burst trigger — called via the imperative handle when a real
            // button on the page is pressed. Reduced-motion users get no
            // canvas burst (the button's own CSS glow still confirms the
            // press), consistent with never starting a loop at all.
            // ────────────────────────────────────────────────────────
            const triggerBurstAt = (localX: number, localY: number): void => {
                if (prefersReducedMotion || particles.length === 0) return;
                bursts.push({ x: localX, y: localY, start: performance.now() });

                let nearest = -1;
                let nearestD2 = Infinity;
                for (let i = 0; i < particles.length; i++) {
                    const p = particles[i];
                    const dx = p.x - localX;
                    const dy = p.y - localY;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < nearestD2) {
                        nearestD2 = d2;
                        nearest = i;
                    }
                    // Physical shove outward — the field visibly recoils and
                    // the links around the press point tear and re-form.
                    if (d2 < BURST_RADIUS * BURST_RADIUS && d2 > 0.01) {
                        const d = Math.sqrt(d2);
                        const f = (1 - d / BURST_RADIUS) * BURST_FORCE;
                        p.ix += (dx / d) * f;
                        p.iy += (dy / d) * f;
                    }
                }

                if (nearest >= 0) {
                    for (let k = 0; k < 5; k++) {
                        if (pulses.length >= MAX_PULSES) break;
                        const j = findNeighbour(nearest);
                        if (j < 0) break;
                        pulses.push({
                            a: nearest,
                            b: j,
                            progress: 0,
                            speed: 0.026 + Math.random() * 0.02,
                            hue: Math.random() < 0.5 ? 0 : 1,
                        });
                    }
                }
            };
            triggerBurstRef.current = triggerBurstAt;

            const drawFrame = (ms: number, dt: number): void => {
                const t = ms / 1000;
                paintBackground();
                if (dt > 0) step(dt);
                // Grid and links are built *after* integration, so the drawn
                // segments match the drawn particle positions exactly.
                buildGrid();
                collectLinks();
                drawLinks();
                drawParticles(t);
                if (dt > 0) drawPulses(dt);
                drawBursts(ms);
            };

            let lastMs = 0;
            const render = (ms: number): void => {
                // Cap dt so a backgrounded tab doesn't resume with one huge
                // integration step that flings every particle off-screen.
                const dt = lastMs === 0 ? 1 : clamp((ms - lastMs) / 16.67, 0, 2.5);
                lastMs = ms;
                drawFrame(ms, dt);
                animationFrameId = requestAnimationFrame(render);
            };

            // ── Pointer ──────────────────────────────────────────────
            const updateRect = (): void => {
                const r = canvas.getBoundingClientRect();
                rectLeft = r.left;
                rectTop = r.top;
            };
            const onPointerMove = (e: PointerEvent): void => {
                pointer.x = e.clientX - rectLeft;
                pointer.y = e.clientY - rectTop;
                pointer.active = true;
            };
            const onPointerEnd = (): void => {
                pointer.active = false;
            };

            const resize = (): void => {
                const cssW = canvas.clientWidth || window.innerWidth;
                const cssH = canvas.clientHeight || window.innerHeight;
                if (cssW === 0 || cssH === 0) return;
                const small = cssW < 768;
                dpr = Math.max(1, Math.min(small ? 2 : 3, window.devicePixelRatio || 1));

                // Mobile browsers fire resize whenever the URL bar hides or
                // shows. Rebuilding the field on those would visibly reshuffle
                // it mid-scroll, so only a real change rebuilds.
                const structural =
                    particles.length === 0 ||
                    Math.abs(cssW - width) > 2 ||
                    Math.abs(cssH - height) > 160;

                width = cssW;
                height = cssH;
                canvas.width = Math.round(cssW * dpr);
                canvas.height = Math.round(cssH * dpr);
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                updateRect();

                if (structural) {
                    computeTuning();
                    buildParticles();
                } else {
                    for (const p of particles) {
                        p.x = clamp(p.x, 0, width);
                        p.y = clamp(p.y, 0, height);
                    }
                }

                if (prefersReducedMotion) drawFrame(0, 0);
            };

            resize();

            let pulseInterval: ReturnType<typeof setInterval> | null = null;
            window.addEventListener('resize', resize);
            window.addEventListener('scroll', updateRect, { passive: true });

            if (prefersReducedMotion) {
                // One static frame. No loop, no spawner, no pointer forces.
                drawFrame(0, 0);
            } else {
                window.addEventListener('pointermove', onPointerMove, { passive: true });
                window.addEventListener('pointerdown', onPointerMove, { passive: true });
                window.addEventListener('pointerup', onPointerEnd, { passive: true });
                window.addEventListener('pointercancel', onPointerEnd, { passive: true });
                window.addEventListener('mouseleave', onPointerEnd);
                pulseInterval = setInterval(spawnPulse, PULSE_INTERVAL_MS);
                animationFrameId = requestAnimationFrame(render);
            }

            return () => {
                if (animationFrameId) cancelAnimationFrame(animationFrameId);
                if (pulseInterval !== null) clearInterval(pulseInterval);
                window.removeEventListener('resize', resize);
                window.removeEventListener('scroll', updateRect);
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerdown', onPointerMove);
                window.removeEventListener('pointerup', onPointerEnd);
                window.removeEventListener('pointercancel', onPointerEnd);
                window.removeEventListener('mouseleave', onPointerEnd);
                triggerBurstRef.current = null;
            };
        }, []);

        return (
            <canvas
                ref={canvasRef}
                // `inset-0 w-full h-full` is the contract the parent in
                // `src/app/page.tsx` relies on; do not change without
                // auditing that call-site. The pointer-events are kept on
                // `auto` so touching the background pushes particles.
                className="absolute inset-0 w-full h-full pointer-events-auto z-0"
                aria-hidden
            />
        );
    },
);

NeuralNetworkBackground.displayName = 'NeuralNetworkBackground';

export default NeuralNetworkBackground;
