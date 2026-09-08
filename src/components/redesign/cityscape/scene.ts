import { MARK_CONTOURS, MARK_RATIO } from './mark';

/**
 * Cybrdeck tower — procedural isometric city scene.
 *
 * Renders the hero artwork at runtime instead of shipping a raster illustration,
 * so the scene is resolution-independent, recolourable from brand tokens, and
 * carries the Cybrdeck mark in its own architecture rather than as an overlay:
 *
 *   - the tower's plan is the rounded-corner card from the logo's "D";
 *   - the mark itself stands on the roof as an illuminated sign, traced from
 *     the real logo geometry and sheared into the isometric plane;
 *   - the logo's broadcast arc becomes the beacon sweep over the city.
 *
 * Everything here is exact geometry (projected quads on an isometric grid), not
 * a drawing of a picture: floors, mullions, partitions and desks are specified
 * shapes, which is what lets the same code render crisply at any DPR.
 */

/* ------------------------------------------------------------------ *
 * Projection
 * ------------------------------------------------------------------ */

const COS30 = Math.cos(Math.PI / 6);
/**
 * Vertical squash. 0.5 is textbook isometric; higher reads as a higher camera.
 * Held below 0.5 so the tower reads as tall rather than as a roof plane seen
 * from above — the roof is the least interesting face and eats the frame fast.
 */
const TILT = 0.35;

/** World (x east, y up, z north) -> unscaled screen offset. */
function px(x: number, z: number) {
  return (x - z) * COS30;
}
function py(x: number, z: number, y: number) {
  return (x + z) * TILT - y;
}

/* ------------------------------------------------------------------ *
 * Deterministic RNG — the scene must be identical across renders so a
 * resize never reshuffles the city under the viewer.
 * ------------------------------------------------------------------ */

export function makeRng(seed: number) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ *
 * Colour helpers
 * ------------------------------------------------------------------ */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16,
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbStr(r: number, g: number, b: number, a = 1) {
  return a >= 1
    ? `rgb(${r | 0},${g | 0},${b | 0})`
    : `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

/** Multiply toward black (f<1) or toward white (f>1). */
function shade(rgb: [number, number, number], f: number): [number, number, number] {
  if (f <= 1) return [rgb[0] * f, rgb[1] * f, rgb[2] * f];
  const t = Math.min(1, f - 1);
  return [
    rgb[0] + (255 - rgb[0]) * t,
    rgb[1] + (255 - rgb[1]) * t,
    rgb[2] + (255 - rgb[2]) * t,
  ];
}

function mix(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/* ------------------------------------------------------------------ *
 * Palette
 *
 * Tiered rather than uniform. An evenly-weighted rainbow reads as noise at
 * window scale; a dominant cool field with warm mid-tones and a thin band of
 * hot accents reads as a lit building. Roughly 62 / 27 / 11.
 * ------------------------------------------------------------------ */

/**
 * Brand cool — carries the building. Kept fully saturated rather than tinted
 * toward grey: a muted "tasteful" cyan at window scale just reads as dirty.
 */
const TIER_COOL: [number, number, number][] = [
  hexToRgb('#d8a657'),
  hexToRgb('#c68f3d'),
  hexToRgb('#38bdf8'),
  hexToRgb('#2dd4bf'),
  hexToRgb('#0ea5e9'),
];

/** Office warmth — the ordinary light of a floor working late. */
const TIER_WARM: [number, number, number][] = [
  hexToRgb('#fbbf24'),
  hexToRgb('#f59e0b'),
  hexToRgb('#fcd34d'),
  hexToRgb('#fb923c'),
];

/**
 * Jewel accents. Violet and emerald rather than primary red and lime — they
 * sit inside the twilight's own hue family, so they read as rich rather than
 * as a clown palette, and they let the share rise without the facade shouting.
 */
const TIER_HOT: [number, number, number][] = [
  hexToRgb('#a78bfa'),
  hexToRgb('#f472b6'),
  hexToRgb('#34d399'),
  hexToRgb('#fb7185'),
];

function pickInterior(r: number, pick: number): [number, number, number] {
  if (r < 0.62) return TIER_COOL[(pick * TIER_COOL.length) | 0];
  if (r < 0.87) return TIER_WARM[(pick * TIER_WARM.length) | 0];
  return TIER_HOT[(pick * TIER_HOT.length) | 0];
}

// Night sky, black rather than violet.
//
// The rooftop crown is clear optical glass, and clear glass has no appearance
// of its own — it shows whatever is behind it. Against the violet sky it used
// to hang in, it transmitted violet and read as a tinted pane; the material
// only resolves into glass over darkness, which is why every reference for it
// is shot on black.
//
// Near-black rather than pure #000 across the ramp: the skyline needs a hair
// of separation at the horizon or the far city loses its silhouette entirely.
// The city's colour now comes from where it should — lit windows and signage —
// instead of from an ambient wash over everything.
const SKY_TOP = hexToRgb('#000000');
const SKY_MID = hexToRgb('#03040a');
const HORIZON = hexToRgb('#0a0b14');
const HORIZON_WARM = hexToRgb('#12111c');

const SLAB = hexToRgb('#080f18');
const MULLION = hexToRgb('#050a11');
const ROOF = hexToRgb('#0a121c');
const BRAND = hexToRgb('#d8a657');

/* ------------------------------------------------------------------ *
 * Tower plan — the rounded-corner card footprint from the logo mark
 * ------------------------------------------------------------------ */

interface PlanPt {
  x: number;
  z: number;
  nx: number;
  nz: number;
}

/**
 * Samples the rounded-rectangle footprint and returns only the run of the
 * perimeter whose outward normal faces the camera, ordered right-to-left in
 * screen space. Straight runs and corner arcs are sampled by arc length so
 * window columns stay evenly spaced as the facade curves.
 */
function visiblePlan(halfW: number, halfD: number, r: number, samples: number): PlanPt[] {
  const pts: PlanPt[] = [];
  const push = (x: number, z: number, nx: number, nz: number) => pts.push({ x, z, nx, nz });

  // Corner arc centres, walked in the order the visible run appears.
  const c4 = { x: halfW - r, z: -halfD + r }; // +x / -z corner
  const c1 = { x: halfW - r, z: halfD - r }; //  +x / +z corner (faces camera)
  const c2 = { x: -halfW + r, z: halfD - r }; // -x / +z corner

  // Arc-length budget across the whole visible run, so sampling is uniform.
  const straightX = 2 * halfD - 2 * r; // the +x facade run
  const straightZ = 2 * halfW - 2 * r; // the +z facade run
  const arcQuarter = (Math.PI / 2) * r;
  const total = arcQuarter * 0.5 + straightX + arcQuarter + straightZ + arcQuarter * 0.5;
  const step = total / samples;

  const arc = (
    c: { x: number; z: number },
    from: number,
    to: number,
    len: number,
  ) => {
    const n = Math.max(2, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const a = from + ((to - from) * i) / n;
      push(c.x + r * Math.cos(a), c.z + r * Math.sin(a), Math.cos(a), Math.sin(a));
    }
  };

  const line = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    nx: number,
    nz: number,
    len: number,
  ) => {
    const n = Math.max(2, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      push(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, nx, nz);
    }
  };

  // -45deg on the +x/-z corner is the right-hand silhouette edge.
  arc(c4, -Math.PI / 4, 0, arcQuarter * 0.5);
  line(halfW, -halfD + r, halfW, halfD - r, 1, 0, straightX);
  arc(c1, 0, Math.PI / 2, arcQuarter);
  line(halfW - r, halfD, -halfW + r, halfD, 0, 1, straightZ);
  arc(c2, Math.PI / 2, (Math.PI * 3) / 4, arcQuarter * 0.5);
  // Close on the left-hand silhouette edge.
  push(
    c2.x + r * Math.cos((Math.PI * 3) / 4),
    c2.z + r * Math.sin((Math.PI * 3) / 4),
    Math.cos((Math.PI * 3) / 4),
    Math.sin((Math.PI * 3) / 4),
  );

  return pts;
}

/** Full closed footprint, for the roof plane. */
function fullPlan(halfW: number, halfD: number, r: number, per = 10): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const corners = [
    { x: halfW - r, z: halfD - r, a0: 0 },
    { x: -halfW + r, z: halfD - r, a0: Math.PI / 2 },
    { x: -halfW + r, z: -halfD + r, a0: Math.PI },
    { x: halfW - r, z: -halfD + r, a0: (Math.PI * 3) / 2 },
  ];
  for (const c of corners) {
    for (let i = 0; i <= per; i++) {
      const a = c.a0 + (Math.PI / 2) * (i / per);
      out.push({ x: c.x + r * Math.cos(a), z: c.z + r * Math.sin(a) });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The Cybrdeck mark, as drawable geometry
 * ------------------------------------------------------------------ */

/** Traces the mark's outer silhouette only — used for the extruded body. */
function traceCardOutline(ctx: CanvasRenderingContext2D) {
  const c = MARK_CONTOURS[0];
  ctx.beginPath();
  ctx.moveTo(c[0], c[1]);
  for (let i = 2; i < c.length; i += 2) ctx.lineTo(c[i], c[i + 1]);
  ctx.closePath();
}

/** Traces the full mark: silhouette plus counters, for an even-odd fill. */
function traceMark(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  for (const c of MARK_CONTOURS) {
    ctx.moveTo(c[0], c[1]);
    for (let i = 2; i < c.length; i += 2) ctx.lineTo(c[i], c[i + 1]);
    ctx.closePath();
  }
}

/**
 * Draws the rooftop pedestal ambient light pool and sky bloom.
 * The actual 3D optical glass CybrDeck crown is rendered via Three.js WebGL (TowerCrown3D).
 */
function drawCrownGlow(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  time: number,
  still: boolean,
) {
  const { ox, oy, unit } = scene.proj;
  const { cx, cz, baseY, W } = scene.crown;
  const S = (x: number, z: number) => ox + px(x, z) * unit;
  const T = (x: number, z: number, y: number) => oy + py(x, z, y) * unit;

  const phase = time * 0.42;
  const theta = still
    ? -Math.PI / 4
    : -Math.PI / 4 + phase - 0.2 * Math.sin(2 * phase);

  const dx = Math.cos(theta);
  const dz = Math.sin(theta);
  const facing = dx - dz;
  const openness = Math.min(1, Math.abs(facing) / Math.SQRT2);

  const midX = S(cx, cz);

  // Soft neutral white/silver caustic pool on the pedestal roof below the crystal
  const poolY = T(cx, cz, baseY - 1);
  const poolR = W * unit * 0.75;
  const pool = ctx.createRadialGradient(midX, poolY, 0, midX, poolY, poolR);
  pool.addColorStop(0, `rgba(255, 255, 255, ${0.28 * (0.4 + openness * 0.6)})`);
  pool.addColorStop(0.35, 'rgba(230, 235, 245, 0.10)');
  pool.addColorStop(0.7, 'rgba(200, 210, 225, 0.03)');
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(midX, poolY);
  ctx.scale(1, TILT * 1.6);
  ctx.translate(-midX, -poolY);
  ctx.fillStyle = pool;
  ctx.fillRect(midX - poolR, poolY - poolR, poolR * 2, poolR * 2);
  ctx.restore();
}

/** Screen-space bounding box for the rooftop 3D Three.js crown. */
export function getCrownScreenBounds(scene: Scene) {
  const { ox, oy, unit } = scene.proj;
  const { cx, cz, baseY, W } = scene.crown;
  const H = W * MARK_RATIO;
  const midX = ox + px(cx, cz) * unit;
  // Pedestal top is at baseY (roofY + 8/9).
  // The bottom of the 3D mark hovers 2 world units above the pedestal surface.
  // The 3D mark has height H * unit in screen pixels.
  // Therefore the center is placed at pedestalScreenY - (H * 0.5 + 2) * unit:
  const pedestalScreenY = oy + py(cx, cz, baseY) * unit;
  const logoPixelHeight = H * unit;
  const midY = pedestalScreenY - logoPixelHeight * 0.5 - 2 * unit;
  const boxSize = Math.round(logoPixelHeight * 2.0);
  return {
    midX,
    midY,
    width: W * unit,
    height: logoPixelHeight,
    boxSize,
  };
}


/* ------------------------------------------------------------------ *
 * Scene types
 * ------------------------------------------------------------------ */

interface Cell {
  /** Screen-space parallelogram: top-left, top-right, bottom-right, bottom-left. */
  q: [number, number, number, number, number, number, number, number];
  r: number;
  g: number;
  b: number;
  /** Phase offset so live cells do not blink in lockstep. */
  phase: number;
}

/**
 * One community/lab room's geometry, captured at bake time so the live layer
 * can place a moving walker in it without re-deriving the room from the plan.
 * The six numbers are exactly `at()`'s inputs inside the room blocks — storing
 * them is cheaper than storing a closure, and Scene must stay serialisable
 * enough to hand across a resize without dragging bake-time locals along.
 */
interface CrowdRoom {
  lx0: number;
  lx1: number;
  ly0t: number;
  ly1t: number;
  ly0b: number;
  ly1b: number;
  /** Storey half-height in screen px — below the drawPerson threshold, skip. */
  hh: number;
  /** Per-room phase/speed/colour seed, so rooms never walk in lockstep. */
  seed: number;
}

export interface Scene {
  w: number;
  h: number;
  dpr: number;
  base: HTMLCanvasElement;
  live: Cell[];
  /** Community/lab rooms, walked by the live crowd layer. */
  crowd: CrowdRoom[];
  /**
   * Windows in the surrounding city that are DARK in the baked image, kept so
   * the pointer can switch them on as it passes. Flat typed arrays rather than
   * an array of objects: this is scanned in full every frame, and the per-frame
   * cost of chasing a few thousand object pointers is exactly the cost worth
   * avoiding here.
   */
  dormant: {
    /** 8 floats per window — the screen-space quad, as fillQuad takes them. */
    q: Float32Array;
    /** Screen-space centre, for the distance test. */
    cx: Float32Array;
    cy: Float32Array;
    /** Atmospheric fade at that window, 0 near … 1 far. */
    fade: Float32Array;
    r: Uint8Array;
    g: Uint8Array;
    b: Uint8Array;
    /** Per-window 0…1 noise, used to vary warm-up rate and idle timing. */
    seed: Float32Array;
  };
  /**
   * Mutable lighting state for {@link Scene.dormant}, carried between frames.
   *
   * Brightness used to be a pure function of pointer distance, which made the
   * lit pool a hard disc that switched off the instant it moved on. Each window
   * now latches instead: a fast attack while the pointer is near, a slow decay
   * once it leaves, so the cursor drags a fading comet-tail of rooms behind it.
   *
   * The catch is that a decaying window has to keep being drawn long after it
   * leaves the pointer's radius, so a per-frame scan of the whole array can no
   * longer find the work. `active` is the answer: the set of windows with any
   * light left in them, compacted each frame as they fade out.
   */
  pulse: {
    /** Current brightness of every window, 0…1. */
    level: Float32Array;
    /** Indices with `level > 0`, the only ones the frame loop touches. */
    active: Int32Array;
    activeCount: number;
    /** Membership flags for `active`, so re-adding is O(1). */
    inActive: Uint8Array;
    /** Frame number a target was last written for, to avoid clearing `target`. */
    stamp: Int32Array;
    target: Float32Array;
    frame: number;
    /** Elapsed `t` at the previous frame, for a frame-rate independent ease. */
    lastT: number;
    /** Windows that blink on their own when the pointer is nowhere near. */
    idle: Int32Array;
  };
  /**
   * Uniform screen-space bucketing of `dormant`, so a frame tests the windows
   * around the pointer instead of all of them. Standard CSR layout: `items`
   * holds indices grouped by cell, `start[c]…start[c+1]` delimits cell `c`.
   */
  grid: {
    cell: number;
    cols: number;
    rows: number;
    start: Int32Array;
    items: Int32Array;
  };
  /**
   * Roof planes of the city blocks, for the bounce pass. Only roofs nothing
   * else covers — filtered through the same stencil as the windows.
   */
  roofs: {
    q: Float32Array;
    cx: Float32Array;
    cy: Float32Array;
    fade: Float32Array;
  };
  /**
   * Half-buffers for the bloom pass, or null where it is switched off. Two,
   * because blurring a canvas requires a source distinct from its destination.
   */
  fx: {
    src: HTMLCanvasElement;
    blur: HTMLCanvasElement;
    /** Tower and podium silhouette, punched out of the bloom before compositing. */
    mask: HTMLCanvasElement;
    scale: number;
    w: number;
    h: number;
  } | null;
  /**
   * Projection constants, so the per-frame layer can place world-space objects
   * without rebuilding the closures buildScene uses.
   */
  proj: { ox: number; oy: number; unit: number };
  /** Where the rooftop mark stands, in world units. */
  crown: { cx: number; cz: number; baseY: number; W: number };
  /** Screen-space centre of the tower, for the copy-side gradient anchor. */
  focus: { x: number; y: number };
  /**
   * Closed screen-space outline of each floor's glass band, ground floor first.
   * Lets the page light a range of floors when the matching capability is
   * hovered — the interaction the whole metaphor exists for.
   */
  floors: Float32Array[];
  /** Total floors, so callers can address bands without importing constants. */
  floorCount: number;
}

export interface BuildOptions {
  /** Fewer city blocks and live cells on small or low-power screens. */
  quality?: 'high' | 'low';
  seed?: number;
  /** Horizontal placement of the tower, 0–1 across the canvas. */
  focusX?: number;
}

/* ------------------------------------------------------------------ *
 * Scene construction
 * ------------------------------------------------------------------ */

const TOWER_H = 252;
const HALF_W = 53;
const HALF_D = 41;
const CORNER_R = 18;
/**
 * Floor and bay counts are legibility budgets, not detail dials. Past roughly
 * 40 bays across the visible facade each room falls under ~5px and the tower
 * reads as static instead of as a stack of lit interiors.
 */
const FLOORS = 17;

/**
 * Floors given over to the partner ticker board. Three consecutive rows inside
 * the 3F partner band, so the board reads as a bank of streaming lines rather
 * than one lonely strip.
 */
export const TICKER_FLOORS = [9, 10, 11];

/**
 * Ground floors given over to the community. Rendered as one open, brightly lit
 * hall packed with people rather than as partitioned offices — 1F is the front
 * door of the building and of the company, so it has to look occupied.
 *
 * Two floors, because a single 20px band cannot fit a figure with a readable
 * head and body on top of the floor and ceiling lines.
 */
const COMMUNITY_FLOORS = [0, 1];

/**
 * Client floors, rendered as an exposed laboratory: no glazing at all, the
 * facade simply open so the slab edges, the structural columns and the work
 * going on inside are all visible. Cool and clinical, against the warm hall
 * below it — the contrast is what makes the stack read as different kinds of
 * room rather than one building with recoloured windows.
 */
const LAB_FLOORS = [5, 6];

/** Clothing for the crowd. Saturated, so a 3px figure still carries colour. */
const CROWD: [number, number, number][] = [
  hexToRgb('#f87171'),
  hexToRgb('#fbbf24'),
  hexToRgb('#34d399'),
  hexToRgb('#60a5fa'),
  hexToRgb('#f472b6'),
  hexToRgb('#a78bfa'),
  hexToRgb('#d8a657'),
  hexToRgb('#fb923c'),
  hexToRgb('#e2e8f0'),
];

const SKIN: [number, number, number][] = [
  hexToRgb('#f2d3b3'),
  hexToRgb('#d9a978'),
  hexToRgb('#a3714a'),
  hexToRgb('#6f4527'),
  hexToRgb('#4a2c18'),
];

/**
 * One person, standing on `footY` at screen x `x`.
 *
 * A head circle over a capsule body. At this scale that is the whole of a
 * legible person — anything more detailed turns to mush, anything less reads
 * as a dot. Drawn in screen space because world-vertical projects to
 * screen-vertical, so people stand upright wherever they are on the facade.
 */
function drawPerson(
  ctx: CanvasRenderingContext2D,
  x: number,
  footY: number,
  h: number,
  rand: () => number,
  dim: number,
  opts: { seated?: boolean; arms?: boolean; gesture?: boolean } = {},
) {
  const headR = h * (opts.seated ? 0.23 : 0.2);
  const bodyW = h * (opts.seated ? 0.42 : 0.36);
  const bodyTop = footY - h + headR * 1.6;
  const bodyH = footY - bodyTop;

  const shirt = shade(CROWD[(rand() * CROWD.length) | 0], dim);
  const skin = shade(SKIN[(rand() * SKIN.length) | 0], dim);
  // Pulled unconditionally, ahead of every branch below that might use it.
  // A caller that re-seeds `rand` fresh every frame (the crowd walkers do,
  // to keep each figure's colours stable while only its position animates)
  // needs the SAME number of rand() calls to happen every frame regardless
  // of which optional parts end up drawn — a call buried inside an `if
  // (opts.gesture)` block fires only on the frames where that flag is true,
  // which shifts every pull after it and makes unrelated attributes (hair
  // colour, below) flicker in step with the gesture toggling on and off.
  const armSide = rand() < 0.5 ? -1 : 1;

  // Chair-back, drawn before the body so it reads as furniture the figure sits
  // in rather than a shadow floating behind it. Seated only — a standing
  // figure has nothing behind it to draw.
  if (opts.seated) {
    ctx.fillStyle = rgbStr(...shade(shirt, 0.55));
    ctx.beginPath();
    ctx.roundRect(
      x - bodyW * 0.46,
      bodyTop - bodyH * 0.1,
      bodyW * 0.92,
      bodyH * 0.42,
      bodyW * 0.3,
    );
    ctx.fill();
  }

  ctx.fillStyle = rgbStr(...shirt);
  ctx.beginPath();
  ctx.roundRect(x - bodyW / 2, bodyTop, bodyW, bodyH, bodyW * 0.4);
  ctx.fill();

  // Legs band: a standing figure is two garments, not one column of colour.
  // Seated figures skip it — the desk already occludes exactly this region.
  if (!opts.seated && h > 8) {
    ctx.fillStyle = rgbStr(...shade(shirt, 0.62));
    ctx.beginPath();
    ctx.roundRect(
      x - bodyW * 0.42,
      footY - bodyH * 0.34,
      bodyW * 0.84,
      bodyH * 0.34,
      bodyW * 0.25,
    );
    ctx.fill();
  }

  // Arms reaching forward, which is what makes a seated figure read as working
  // at the desk rather than as a torso parked behind it. A standing figure can
  // instead throw one arm up mid-gesture — the tell of someone talking rather
  // than idling — never both at once.
  if (opts.arms && h > 7) {
    const armW = Math.max(0.7, bodyW * 0.22);
    ctx.fillStyle = rgbStr(...skin);
    ctx.fillRect(x - bodyW * 0.62, bodyTop + bodyH * 0.3, armW, bodyH * 0.34);
    ctx.fillRect(x + bodyW * 0.4, bodyTop + bodyH * 0.3, armW, bodyH * 0.34);
  } else if (opts.gesture && h > 8) {
    const armW = Math.max(0.7, bodyW * 0.22);
    ctx.fillStyle = rgbStr(...skin);
    ctx.save();
    ctx.translate(x + armSide * bodyW * 0.52, bodyTop + bodyH * 0.14);
    ctx.rotate(armSide * 0.55);
    ctx.beginPath();
    ctx.roundRect(-armW / 2, 0, armW, bodyH * 0.4, armW * 0.4);
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = rgbStr(...skin);
  ctx.beginPath();
  ctx.arc(x, footY - h + headR, headR, 0, Math.PI * 2);
  ctx.fill();

  // Hair cap, so heads are not a row of identical beads.
  if (h > 8) {
    ctx.fillStyle = rgbStr(...shade(hexToRgb(rand() < 0.5 ? '#2b1d16' : '#4a3325'), dim));
    ctx.beginPath();
    ctx.arc(x, footY - h + headR * 0.88, headR * 0.95, Math.PI, Math.PI * 2);
    ctx.fill();
  }
}

export function buildScene(
  w: number,
  h: number,
  dpr: number,
  opts: BuildOptions = {},
): Scene {
  const quality = opts.quality ?? 'high';
  const rand = makeRng(opts.seed ?? 20260822);
  const focusX = opts.focusX ?? 0.5;

  const base = document.createElement('canvas');
  base.width = Math.max(1, Math.round(w * dpr));
  base.height = Math.max(1, Math.round(h * dpr));
  const ctx = base.getContext('2d')!;
  ctx.scale(dpr, dpr);

  // Fit: the whole tower plus its plaza has to sit inside the frame, so the
  // building is sized off the height and stood far enough up that the podium
  // is not sheared off by the bottom edge.
  // 0.60 rather than 0.66: the rooftop crown stands ~66 world units above the
  // roof, and at the larger scale its top cleared the floating nav by nothing
  // at all — on a tall viewport it was cropped by the top of the frame.
  const unit = (h * 0.6) / TOWER_H;
  const originX = w * focusX;
  // Sits low enough that the rooftop crown clears the floating nav overlaying
  // the top of the hero, while the podium still lands inside the frame.
  const originY = h * 0.93;
  const S = (x: number, z: number) => originX + px(x, z) * unit;
  const T = (x: number, z: number, y: number) => originY + py(x, z, y) * unit;

  const horizonY = h * 0.3;

  drawSky(ctx, w, h, horizonY, focusX);

  const live: Cell[] = [];
  const floors: Float32Array[] = [];
  const crowd: CrowdRoom[] = [];
  const dormantAccum: DormantAccum = {
    q: [], cx: [], cy: [], fade: [], r: [], g: [], b: [], owner: [], seed: [],
  };
  const roofAccum: RoofAccum = { q: [], cx: [], cy: [], fade: [], owner: [] };

  // Coverage map for the dormant-window filter below. Kept at 1 device pixel
  // per CSS pixel whatever the display's DPR: it is only ever asked which
  // silhouette owns a point, and the windows it arbitrates over are a few
  // pixels across, so a 2x buffer would quadruple the readback for nothing.
  const stencilCanvas = document.createElement('canvas');
  stencilCanvas.width = Math.max(1, Math.round(w));
  stencilCanvas.height = Math.max(1, Math.round(h));
  const stencil: Stencil = {
    ctx: stencilCanvas.getContext('2d', { willReadFrequently: true })!,
    w: stencilCanvas.width,
    h: stencilCanvas.height,
  };

  drawCity(ctx, {
    S, T, rand, quality, w, h, unit, horizonY,
    dormant: dormantAccum, stencil, roofs: roofAccum,
  });
  const podiumRing = drawPlaza(ctx, { S, T, rand, unit });
  const { crownSpec, occluders } = drawTower(ctx, {
    S, T, rand, unit, live, quality, floors, crowd,
  });

  // Drop every dormant window that something else ends up painted over.
  //
  // The dark windows these replace are hidden for free by the painter's
  // algorithm — the city goes down back to front, then the plaza, then the
  // tower. Their lit counterparts are a per-frame layer over the finished
  // bitmap and inherit none of that ordering, so anything the bake buried has
  // to be dropped here instead. Two things bury them: the tower and its
  // podium, and — the case the ring test used to miss entirely — nearer city
  // blocks, which is why unrelated grids of light used to float across
  // foreground facades.
  //
  // The stencil already holds every block's silhouette in paint order. Adding
  // the tower and podium to it turns the whole question into one lookup per
  // window against a single readback, instead of a point-in-polygon sweep over
  // a ring list that would have to grow to thousands of entries to cover the
  // city as well.
  {
    for (const ring of [...occluders, podiumRing]) {
      stampStencil(stencil, STENCIL_OCCLUDER, (c) => {
        c.moveTo(ring[0], ring[1]);
        for (let i = 2; i < ring.length; i += 2) c.lineTo(ring[i], ring[i + 1]);
        c.closePath();
      });
    }

    const cov = stencil.ctx.getImageData(0, 0, stencil.w, stencil.h).data;
    const ownerAt = (x: number, y: number) => {
      const ix = Math.round(x);
      const iy = Math.round(y);
      // Off-canvas cannot be covered by anything, so treat it as still owned.
      if (ix < 0 || iy < 0 || ix >= stencil.w || iy >= stencil.h) return -1;
      const o = (iy * stencil.w + ix) * 4;
      return (cov[o] << 16) | (cov[o + 1] << 8) | cov[o + 2];
    };

    /**
     * True when `id` still owns every corner of the quad at `q[o…o+7]`, plus
     * its centre.
     *
     * Testing the centre alone left shapes that straddle a silhouette edge
     * half-lit over the building in front of them. The corners are each pulled
     * a little toward the centre so the samples land off the antialiased
     * boundary itself, where the blended colour belongs to no id at all.
     */
    const unoccluded = (q: number[], o: number, x: number, y: number, id: number) => {
      const covered = (at: number) => at !== -1 && at !== id;
      for (let k = 0; k < 4; k++) {
        const qx = q[o + k * 2];
        const qy = q[o + k * 2 + 1];
        if (covered(ownerAt(qx + (x - qx) * 0.3, qy + (y - qy) * 0.3))) return false;
      }
      return !covered(ownerAt(x, y));
    };

    const keep: DormantAccum = {
      q: [], cx: [], cy: [], fade: [], r: [], g: [], b: [], owner: [], seed: [],
    };
    for (let i = 0; i < dormantAccum.cx.length; i++) {
      const x = dormantAccum.cx[i];
      const y = dormantAccum.cy[i];
      const o = i * 8;
      const id = dormantAccum.owner[i];
      if (!unoccluded(dormantAccum.q, o, x, y, id)) continue;

      for (let k = 0; k < 8; k++) keep.q.push(dormantAccum.q[o + k]);
      keep.cx.push(x);
      keep.cy.push(y);
      keep.fade.push(dormantAccum.fade[i]);
      keep.r.push(dormantAccum.r[i]);
      keep.g.push(dormantAccum.g[i]);
      keep.b.push(dormantAccum.b[i]);
      keep.owner.push(id);
      keep.seed.push(dormantAccum.seed[i]);
    }
    dormantAccum.q = keep.q;
    dormantAccum.cx = keep.cx;
    dormantAccum.cy = keep.cy;
    dormantAccum.fade = keep.fade;
    dormantAccum.r = keep.r;
    dormantAccum.g = keep.g;
    dormantAccum.b = keep.b;
    dormantAccum.owner = keep.owner;
    dormantAccum.seed = keep.seed;

    // Roofs go through the same test. A roof is a whole block top rather than a
    // 3px pane, so requiring every corner to survive drops any roof a neighbour
    // clips at all — which is what the bounce wants: light landing on a plane
    // that is only half there reads as a hole in the skyline.
    const keepRoof: RoofAccum = { q: [], cx: [], cy: [], fade: [], owner: [] };
    for (let i = 0; i < roofAccum.cx.length; i++) {
      const o = i * 8;
      const id = roofAccum.owner[i];
      if (!unoccluded(roofAccum.q, o, roofAccum.cx[i], roofAccum.cy[i], id)) continue;
      for (let k = 0; k < 8; k++) keepRoof.q.push(roofAccum.q[o + k]);
      keepRoof.cx.push(roofAccum.cx[i]);
      keepRoof.cy.push(roofAccum.cy[i]);
      keepRoof.fade.push(roofAccum.fade[i]);
      keepRoof.owner.push(id);
    }
    roofAccum.q = keepRoof.q;
    roofAccum.cx = keepRoof.cx;
    roofAccum.cy = keepRoof.cy;
    roofAccum.fade = keepRoof.fade;
    roofAccum.owner = keepRoof.owner;
  }

  // Atmospheric wash over everything, strongest at the horizon.
  const haze = ctx.createLinearGradient(0, horizonY - h * 0.16, 0, h);
  haze.addColorStop(0, rgbStr(...HORIZON, 0));
  haze.addColorStop(0.19, rgbStr(...HORIZON, 0.46));
  haze.addColorStop(0.52, rgbStr(...HORIZON, 0.1));
  haze.addColorStop(1, 'rgba(2,6,15,0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, horizonY - h * 0.16, w, h);

  // Neon halo: light spilling off the facade into the air around it. Drawn
  // before the vignette so the vignette still shapes it.
  const haloY = originY - TOWER_H * unit * 0.45;
  const haloR = TOWER_H * unit * 0.85;
  const halo = ctx.createRadialGradient(originX, haloY, 0, originX, haloY, haloR);
  halo.addColorStop(0, rgbStr(...BRAND, 0.16));
  halo.addColorStop(0.35, rgbStr(...BRAND, 0.08));
  halo.addColorStop(0.7, rgbStr(...BRAND, 0.025));
  halo.addColorStop(1, rgbStr(...BRAND, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(originX - haloR, haloY - haloR, haloR * 2, haloR * 2);

  // Bloom, before the vignette so the vignette still shapes it. Light bleeding
  // past the edges of a source is what separates "neon sign at night" from
  // "flat shapes filled with bright colour", and it is the single largest step
  // this renderer can take toward looking photographed rather than drawn.
  applyBloom(base, ctx, dpr, 0.62);

  // Vignette. Darkens the frame edges so the eye lands on the tower instead of
  // wandering into the repeating city, and gives the copy side a quieter ground.
  const vig = ctx.createRadialGradient(
    w * focusX,
    h * 0.52,
    Math.min(w, h) * 0.3,
    w * focusX,
    h * 0.52,
    Math.max(w, h) * 0.88,
  );
  vig.addColorStop(0, 'rgba(1,4,12,0)');
  vig.addColorStop(0.5, 'rgba(1,4,12,0.2)');
  vig.addColorStop(0.78, 'rgba(1,4,12,0.55)');
  vig.addColorStop(1, 'rgba(1,4,12,0.88)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  const dormantCount = dormantAccum.cx.length;

  // Bucket the windows by screen cell. The frame loop walks only the cells the
  // pointer's disc overlaps, so the per-frame cost tracks the size of the lit
  // pool rather than the size of the city.
  const grid = (() => {
    const cell = 64;
    const cols = Math.max(1, Math.ceil(w / cell));
    const rows = Math.max(1, Math.ceil(h / cell));
    const cellOf = (i: number) => {
      const gx = Math.min(cols - 1, Math.max(0, Math.floor(dormantAccum.cx[i] / cell)));
      const gy = Math.min(rows - 1, Math.max(0, Math.floor(dormantAccum.cy[i] / cell)));
      return gy * cols + gx;
    };
    const start = new Int32Array(cols * rows + 1);
    for (let i = 0; i < dormantCount; i++) start[cellOf(i) + 1]++;
    for (let c = 0; c < cols * rows; c++) start[c + 1] += start[c];
    const items = new Int32Array(dormantCount);
    const head = start.slice(0, cols * rows);
    for (let i = 0; i < dormantCount; i++) items[head[cellOf(i)]++] = i;
    return { cell, cols, rows, start, items };
  })();

  // The windows that blink unprompted. Held to a small share of the city:
  // every window taking a turn would read as a screensaver rather than as a
  // handful of people still at their desks.
  const idle: number[] = [];
  for (let i = 0; i < dormantCount; i++) {
    if (dormantAccum.seed[i] < IDLE_SHARE) idle.push(i);
  }

  // Half-resolution buffers for the per-frame bloom, and the silhouette that
  // keeps its spill off the tower.
  //
  // Skipped entirely at low quality: that path exists for small and low-power
  // screens, and a blur plus two composites per frame is the first thing that
  // should go when there is no headroom for it.
  const fx = (() => {
    if (quality !== 'high') return null;
    const scale = 0.5;
    const bw = Math.max(1, Math.round(w * scale));
    const bh = Math.max(1, Math.round(h * scale));
    const make = () => {
      const c = document.createElement('canvas');
      c.width = bw;
      c.height = bh;
      return c;
    };
    const src = make();
    const blur = make();
    const mask = make();
    const mctx = mask.getContext('2d')!;
    mctx.scale(scale, scale);
    mctx.fillStyle = '#000';
    for (const ring of [...occluders, podiumRing]) {
      mctx.beginPath();
      mctx.moveTo(ring[0], ring[1]);
      for (let i = 2; i < ring.length; i += 2) mctx.lineTo(ring[i], ring[i + 1]);
      mctx.closePath();
      mctx.fill();
    }
    return { src, blur, mask, scale, w: bw, h: bh };
  })();

  return {
    w,
    h,
    dpr,
    base,
    live,
    crowd,
    dormant: {
      q: new Float32Array(dormantAccum.q),
      cx: new Float32Array(dormantAccum.cx),
      cy: new Float32Array(dormantAccum.cy),
      fade: new Float32Array(dormantAccum.fade),
      r: new Uint8Array(dormantAccum.r),
      g: new Uint8Array(dormantAccum.g),
      b: new Uint8Array(dormantAccum.b),
      seed: new Float32Array(dormantAccum.seed),
    },
    pulse: {
      level: new Float32Array(dormantCount),
      active: new Int32Array(dormantCount),
      activeCount: 0,
      inActive: new Uint8Array(dormantCount),
      stamp: new Int32Array(dormantCount).fill(-1),
      target: new Float32Array(dormantCount),
      frame: 0,
      lastT: 0,
      idle: new Int32Array(idle),
    },
    grid,
    roofs: {
      q: new Float32Array(roofAccum.q),
      cx: new Float32Array(roofAccum.cx),
      cy: new Float32Array(roofAccum.cy),
      fade: new Float32Array(roofAccum.fade),
    },
    fx,
    proj: { ox: originX, oy: originY, unit },
    crown: crownSpec,
    floors,
    floorCount: FLOORS,
    focus: { x: originX, y: originY - TOWER_H * unit * 0.5 },
  };
}

/**
 * Additive bloom pass over the baked scene.
 *
 * Downscales the frame, blurs it, and composites it back with `lighter`, so
 * every bright window bleeds a halo into the air around it. Working at half
 * resolution makes the blur cheap and, because bloom is low-frequency by
 * definition, costs nothing visually.
 */
function applyBloom(
  base: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  dpr: number,
  strength: number,
) {
  const w = base.width;
  const h = base.height;
  const sw = Math.max(1, Math.round(w / 2));
  const sh = Math.max(1, Math.round(h / 2));

  const small = document.createElement('canvas');
  small.width = sw;
  small.height = sh;
  const sctx = small.getContext('2d');
  if (!sctx) return;
  sctx.filter = `blur(${Math.max(2, 4 * dpr)}px)`;
  sctx.drawImage(base, 0, 0, sw, sh);

  ctx.save();
  // The context carries a dpr scale; the composite works in device pixels.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = strength;
  ctx.drawImage(small, 0, 0, w, h);
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * Sky
 * ------------------------------------------------------------------ */

function drawSky(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  horizonY: number,
  focusX: number,
) {
  // One gradient across the whole frame — splitting sky and ground into two
  // fills leaves a hard seam exactly where the eye is looking for the horizon.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgbStr(...SKY_TOP));
  g.addColorStop(horizonY / h / 1.8, rgbStr(...SKY_MID));
  g.addColorStop((horizonY / h) * 0.92, rgbStr(...HORIZON));
  g.addColorStop(horizonY / h, rgbStr(...HORIZON_WARM));
  g.addColorStop(Math.min(1, horizonY / h + 0.24), rgbStr(...shade(HORIZON_WARM, 0.45)));
  g.addColorStop(1, rgbStr(...shade(HORIZON, 0.2)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Cool bloom behind the tower crown.
  const bloom = ctx.createRadialGradient(
    w * focusX,
    horizonY * 0.66,
    0,
    w * focusX,
    horizonY * 0.66,
    Math.max(w, h) * 0.45,
  );
  bloom.addColorStop(0, rgbStr(...BRAND, 0.14));
  bloom.addColorStop(0.5, rgbStr(...BRAND, 0.04));
  bloom.addColorStop(1, rgbStr(...BRAND, 0));
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, w, h);
}

/* ------------------------------------------------------------------ *
 * Background city
 * ------------------------------------------------------------------ */

interface DrawCtx {
  S: (x: number, z: number) => number;
  T: (x: number, z: number, y: number) => number;
  rand: () => number;
  quality: 'high' | 'low';
  w: number;
  h: number;
  unit: number;
  horizonY: number;
  /** Collects dark city windows the pointer can later light. */
  dormant: DormantAccum;
  /** Coverage map, stamped block by block in the same order the city paints. */
  stencil: Stencil;
  /** Collects block roof planes for the bounce pass. */
  roofs: RoofAccum;
}

/** Bake-time accumulator for {@link Scene.dormant}; converted to typed arrays once. */
interface DormantAccum {
  q: number[];
  cx: number[];
  cy: number[];
  fade: number[];
  r: number[];
  g: number[];
  b: number[];
  /**
   * Id of the block that owns each window, matched against the coverage
   * stencil to find windows a nearer block has since painted over. Bake-time
   * only — dropped before the typed arrays are built.
   */
  owner: number[];
  /** Per-window 0…1 noise. See {@link Scene.dormant.seed}. */
  seed: number[];
}

/** Bake-time accumulator for {@link Scene.roofs}. */
interface RoofAccum {
  q: number[];
  cx: number[];
  cy: number[];
  fade: number[];
  owner: number[];
}

/**
 * Screen-space coverage map, painted in lockstep with the baked image: each
 * silhouette is stamped in a colour that encodes its id, so after the bake the
 * pixel under any point names whatever ended up on top of it.
 *
 * This exists because the pointer-lit windows are drawn per frame OVER the
 * finished bitmap and so inherit none of the painter's-algorithm ordering that
 * hides their dark counterparts. Without it, a window on a distant block that
 * a nearer block has completely covered still lights up — a bright grid
 * floating over a facade it has nothing to do with.
 */
interface Stencil {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

/** Id stamped for the tower, its podium and anything else that is not a block. */
const STENCIL_OCCLUDER = 0xffffff;

/* --- Window lighting ------------------------------------------------ *
 *
 * Time constants, in seconds, for the attack/decay latch. The asymmetry is
 * the whole effect: a room answers the cursor almost at once and then takes
 * its time going dark, which is what leaves a tail behind the pointer instead
 * of a disc travelling with it.
 */
const PULSE_ATTACK_TAU = 0.055;
const PULSE_DECAY_TAU = 0.26;
/** Below this a window is dark enough to drop out of the active set. */
const PULSE_EPSILON = 0.004;

/** Share of city windows that ever blink unprompted. */
const IDLE_SHARE = 0.075;
/** Seconds between one idle window's turns, and how long a turn lasts. */
const IDLE_PERIOD = 34;
const IDLE_ON = 3.1;
/** Idle blinks sit below the pointer's own light so they never compete with it. */
const IDLE_LEVEL = 0.5;

/** Bounce light picked up by roof planes near the pointer. */
const ROOF_SHEEN = hexToRgb('#b7cee8');
const ROOF_SHEEN_GAIN = 0.15;

/** Fills a closed screen-space path into the stencil under `id`'s colour. */
function stampStencil(st: Stencil, id: number, trace: (c: CanvasRenderingContext2D) => void) {
  const c = st.ctx;
  c.beginPath();
  trace(c);
  c.fillStyle = `rgb(${(id >> 16) & 255},${(id >> 8) & 255},${id & 255})`;
  c.fill();
}

/**
 * Colours a dark city window takes when the pointer wakes it. Indexed
 * deterministically from the window's own grid position rather than drawn from
 * `rand()` — see the capture site in `drawCityBlock` for why that matters.
 */
const DORMANT_TINTS: [number, number, number][] = [
  hexToRgb('#d8a657'),
  hexToRgb('#38bdf8'),
  hexToRgb('#fbbf24'),
  hexToRgb('#fcd34d'),
  hexToRgb('#2dd4bf'),
];

function drawCity(ctx: CanvasRenderingContext2D, d: DrawCtx) {
  const { S, T, rand, quality, w, h, dormant, stencil, roofs } = d;
  const blocks: {
    x: number;
    z: number;
    bw: number;
    bd: number;
    bh: number;
    depth: number;
  }[] = [];

  // Small, dense blocks. The tower only reads as monumental if its neighbours
  // are clearly a different order of size.
  const spread = quality === 'high' ? 1250 : 900;
  const stepG = quality === 'high' ? 56 : 84;

  for (let gx = -spread; gx <= spread; gx += stepG) {
    for (let gz = -spread; gz <= spread; gz += stepG) {
      const x = gx + (rand() - 0.5) * stepG * 0.5;
      const z = gz + (rand() - 0.5) * stepG * 0.5;

      // Keep the tower's plot and its plaza clear.
      if (Math.abs(x) < 130 && Math.abs(z) < 120) continue;

      const depth = x + z;
      // Everything in front of the tower stays low so it reads as foreground
      // rooftops rather than blocking the subject.
      const front = depth > 90;
      // Skewed distribution: mostly mid-rise with occasional towers, which is
      // what gives a skyline a silhouette instead of a hedge.
      const spike = rand();
      const bh = front
        ? 10 + rand() * 18
        : 16 + rand() * 44 + (spike > 0.9 ? rand() * 86 : 0);

      blocks.push({
        x,
        z,
        bw: stepG * (0.26 + rand() * 0.3),
        bd: stepG * (0.26 + rand() * 0.3),
        bh,
        depth,
      });
    }
  }

  // Painter's algorithm: smaller (x+z) is farther from the camera.
  blocks.sort((a, b) => a.depth - b.depth);

  for (let bi = 0; bi < blocks.length; bi++) {
    const b = blocks[bi];
    // Atmospheric perspective toward the horizon colour. Deliberately strong:
    // the far city has to dissolve into the sky or the tower has no depth to
    // stand in front of.
    const fade = Math.min(1, Math.max(0, Math.pow((-b.depth + 340) / 1350, 0.62)));
    // Ids start at 1 so an unpainted stencil pixel (transparent black, read as
    // id 0) can never be mistaken for a block.
    stampBlockSilhouette(stencil, bi + 1, S, T, b);
    drawCityBlock(ctx, S, T, rand, b, fade, dormant, w, h, bi + 1);

    // Roof plane, kept for the bounce pass. Recorded even when off-screen or
    // buried; both are dropped by the same filter the windows go through.
    const rx0 = b.x - b.bw / 2;
    const rx1 = b.x + b.bw / 2;
    const rz0 = b.z - b.bd / 2;
    const rz1 = b.z + b.bd / 2;
    const rq = [
      S(rx0, rz0), T(rx0, rz0, b.bh),
      S(rx1, rz0), T(rx1, rz0, b.bh),
      S(rx1, rz1), T(rx1, rz1, b.bh),
      S(rx0, rz1), T(rx0, rz1, b.bh),
    ];
    const rcx = (rq[0] + rq[2] + rq[4] + rq[6]) / 4;
    const rcy = (rq[1] + rq[3] + rq[5] + rq[7]) / 4;
    if (rcx >= -60 && rcx <= w + 60 && rcy >= -60 && rcy <= h + 60) {
      roofs.q.push(...rq);
      roofs.cx.push(rcx);
      roofs.cy.push(rcy);
      roofs.fade.push(fade);
      roofs.owner.push(bi + 1);
    }
  }
}

/**
 * Stamps a block's outline into the coverage map.
 *
 * The roof and both camera-facing walls go in as subpaths of ONE fill. Filling
 * them separately would leave the shared edges antialiased against whatever is
 * underneath, laying hairlines of a blended colour down the middle of the
 * block that read as a different id and so falsely occlude the windows beside
 * them; a single nonzero fill covers the union with no interior seams.
 */
function stampBlockSilhouette(
  st: Stencil,
  id: number,
  S: (x: number, z: number) => number,
  T: (x: number, z: number, y: number) => number,
  b: { x: number; z: number; bw: number; bd: number; bh: number },
) {
  const x0 = b.x - b.bw / 2;
  const x1 = b.x + b.bw / 2;
  const z0 = b.z - b.bd / 2;
  const z1 = b.z + b.bd / 2;
  const quad = (c: CanvasRenderingContext2D, pts: [number, number][]) => {
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
  };
  stampStencil(st, id, (c) => {
    // Roof.
    quad(c, [
      [S(x0, z0), T(x0, z0, b.bh)],
      [S(x1, z0), T(x1, z0, b.bh)],
      [S(x1, z1), T(x1, z1, b.bh)],
      [S(x0, z1), T(x0, z1, b.bh)],
    ]);
    // The two camera-facing walls, matching the faces drawCityBlock paints.
    quad(c, [
      [S(x1, z0), T(x1, z0, b.bh)],
      [S(x1, z1), T(x1, z1, b.bh)],
      [S(x1, z1), T(x1, z1, 0)],
      [S(x1, z0), T(x1, z0, 0)],
    ]);
    quad(c, [
      [S(x1, z1), T(x1, z1, b.bh)],
      [S(x0, z1), T(x0, z1, b.bh)],
      [S(x0, z1), T(x0, z1, 0)],
      [S(x1, z1), T(x1, z1, 0)],
    ]);
  });
}

function drawCityBlock(
  ctx: CanvasRenderingContext2D,
  S: (x: number, z: number) => number,
  T: (x: number, z: number, y: number) => number,
  rand: () => number,
  b: { x: number; z: number; bw: number; bd: number; bh: number },
  fade: number,
  dormant: DormantAccum,
  viewW: number,
  viewH: number,
  /** Stencil id of this block, recorded with every window it contributes. */
  blockId: number,
) {
  const x0 = b.x - b.bw / 2;
  const x1 = b.x + b.bw / 2;
  const z0 = b.z - b.bd / 2;
  const z1 = b.z + b.bd / 2;

  const wash = (c: [number, number, number], amt: number) =>
    mix(c, HORIZON, Math.min(0.88, fade * amt));

  // Roof — kept dark. A pale roof plane on every block turns the skyline into
  // a field of grey lids and flattens the whole depth cue.
  fillQuad(
    ctx,
    S(x0, z0),
    T(x0, z0, b.bh),
    S(x1, z0),
    T(x1, z0, b.bh),
    S(x1, z1),
    T(x1, z1, b.bh),
    S(x0, z1),
    T(x0, z1, b.bh),
    rgbStr(...wash(shade(ROOF, 1.12), 0.75)),
  );

  // Two camera-facing walls
  const faces: { a: [number, number]; b: [number, number]; lit: number }[] = [
    { a: [x1, z0], b: [x1, z1], lit: 0.92 },
    { a: [x1, z1], b: [x0, z1], lit: 0.62 },
  ];

  for (const f of faces) {
    const [fax, faz] = f.a;
    const [fbx, fbz] = f.b;
    fillQuad(
      ctx,
      S(fax, faz),
      T(fax, faz, b.bh),
      S(fbx, fbz),
      T(fbx, fbz, b.bh),
      S(fbx, fbz),
      T(fbx, fbz, 0),
      S(fax, faz),
      T(fax, faz, 0),
      rgbStr(...wash(shade(SLAB, f.lit), 1)),
    );

    // Window grid
    const cols = Math.max(2, Math.round(Math.hypot(fbx - fax, fbz - faz) / 6));
    const rows = Math.max(2, Math.round(b.bh / 7));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (rand() > 0.62) {
          // A dark window. Record a deterministic slice of these so the
          // pointer can switch them on later.
          //
          // Selection is by grid position, NOT by rand(): every extra rand()
          // call here would advance the shared sequence and reshuffle the
          // entire city downstream of it, so a purely additive feature would
          // silently redesign the skyline. Same reason the tint is indexed
          // rather than picked.
          if ((c + r) % 2 === 0) {
            const dt0 = (c + 0.22) / cols;
            const dt1 = (c + 0.78) / cols;
            const dyb = (r + 0.25) * (b.bh / rows);
            const dyt = (r + 0.78) * (b.bh / rows);
            const dax = fax + (fbx - fax) * dt0;
            const daz = faz + (fbz - faz) * dt0;
            const dbx = fax + (fbx - fax) * dt1;
            const dbz = faz + (fbz - faz) * dt1;

            const qx0 = S(dax, daz);
            const qy0 = T(dax, daz, dyt);
            const qx1 = S(dbx, dbz);
            const qy1 = T(dbx, dbz, dyt);
            const qy2 = T(dbx, dbz, dyb);
            const qy3 = T(dax, daz, dyb);

            // Off-screen windows can never be near the pointer, so they are
            // dead weight in a per-frame scan — drop them at bake time.
            const midX = (qx0 + qx1) / 2;
            const midY = (qy0 + qy2) / 2;
            if (
              midX >= -40 &&
              midX <= viewW + 40 &&
              midY >= -40 &&
              midY <= viewH + 40
            ) {
              const tint = DORMANT_TINTS[(c * 7 + r * 3) % DORMANT_TINTS.length];
              dormant.q.push(qx0, qy0, qx1, qy1, qx1, qy2, qx0, qy3);
              dormant.cx.push(midX);
              dormant.cy.push(midY);
              dormant.fade.push(fade);
              dormant.r.push(tint[0]);
              dormant.g.push(tint[1]);
              dormant.b.push(tint[2]);
              dormant.owner.push(blockId);
              // Hashed from the window's own address for exactly the reason
              // the tint is indexed rather than picked: another rand() call
              // here would advance the shared sequence and redesign every
              // block drawn after this one.
              const hs =
                Math.sin((c + 1) * 12.9898 + (r + 1) * 78.233 + blockId * 3.717) * 43758.5453;
              dormant.seed.push(hs - Math.floor(hs));
            }
          }
          continue;
        }
        const t0 = (c + 0.22) / cols;
        const t1 = (c + 0.78) / cols;
        const yb = (r + 0.25) * (b.bh / rows);
        const yt = (r + 0.78) * (b.bh / rows);
        const ax = fax + (fbx - fax) * t0;
        const az = faz + (fbz - faz) * t0;
        const bx2 = fax + (fbx - fax) * t1;
        const bz2 = faz + (fbz - faz) * t1;

        const col = pickInterior(rand(), rand());
        const lit = shade(col, 0.34 + rand() * 0.4);
        fillQuad(
          ctx,
          S(ax, az),
          T(ax, az, yt),
          S(bx2, bz2),
          T(bx2, bz2, yt),
          S(bx2, bz2),
          T(bx2, bz2, yb),
          S(ax, az),
          T(ax, az, yb),
          rgbStr(...mix(lit, HORIZON, Math.min(0.9, fade))),
        );
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Street-level plaza
 * ------------------------------------------------------------------ */

function drawPlaza(
  ctx: CanvasRenderingContext2D,
  d: { S: DrawCtx['S']; T: DrawCtx['T']; rand: () => number; unit: number },
): number[] {
  const { S, T, rand } = d;
  const pw = HALF_W + 26;
  const pd = HALF_D + 22;
  const ph = 17;

  // Podium mass
  fillQuad(
    ctx,
    S(-pw, -pd),
    T(-pw, -pd, ph),
    S(pw, -pd),
    T(pw, -pd, ph),
    S(pw, pd),
    T(pw, pd, ph),
    S(-pw, pd),
    T(-pw, pd, ph),
    rgbStr(...shade(ROOF, 1.15)),
  );

  // Light spilling from the storefronts onto the deck, so the plaza reads as
  // an occupied surface rather than an empty slab.
  const spillA = S(0, 0);
  const spillB = T(0, 0, ph);
  const spill = ctx.createRadialGradient(spillA, spillB, 0, spillA, spillB, pw * 3.6);
  spill.addColorStop(0, rgbStr(...shade(BRAND, 0.8), 0.16));
  spill.addColorStop(0.55, rgbStr(...HORIZON_WARM, 0.1));
  spill.addColorStop(1, 'rgba(0,0,0,0)');
  fillQuad(
    ctx,
    S(-pw, -pd),
    T(-pw, -pd, ph),
    S(pw, -pd),
    T(pw, -pd, ph),
    S(pw, pd),
    T(pw, pd, ph),
    S(-pw, pd),
    T(-pw, pd, ph),
    spill,
  );

  const faces: { a: [number, number]; b: [number, number]; lit: number }[] = [
    { a: [pw, -pd], b: [pw, pd], lit: 0.95 },
    { a: [pw, pd], b: [-pw, pd], lit: 0.66 },
  ];

  for (const f of faces) {
    const [fax, faz] = f.a;
    const [fbx, fbz] = f.b;
    fillQuad(
      ctx,
      S(fax, faz),
      T(fax, faz, ph),
      S(fbx, fbz),
      T(fbx, fbz, ph),
      S(fbx, fbz),
      T(fbx, fbz, 0),
      S(fax, faz),
      T(fax, faz, 0),
      rgbStr(...shade(SLAB, f.lit * 0.9)),
    );

    // Storefront bays with awnings — the plaza's colour comes from signage.
    const bays = Math.max(4, Math.round(Math.hypot(fbx - fax, fbz - faz) / 9));
    for (let i = 0; i < bays; i++) {
      const t0 = (i + 0.12) / bays;
      const t1 = (i + 0.88) / bays;
      const ax = fax + (fbx - fax) * t0;
      const az = faz + (fbz - faz) * t0;
      const bx2 = fax + (fbx - fax) * t1;
      const bz2 = faz + (fbz - faz) * t1;

      // Street level is where the hot accents belong — signage and awnings are
      // the one place a saturated colour is doing a real job.
      const col = pickInterior(0.55 + rand() * 0.45, rand());

      // Lit shop interior
      fillQuad(
        ctx,
        S(ax, az),
        T(ax, az, ph * 0.62),
        S(bx2, bz2),
        T(bx2, bz2, ph * 0.62),
        S(bx2, bz2),
        T(bx2, bz2, ph * 0.08),
        S(ax, az),
        T(ax, az, ph * 0.08),
        rgbStr(...shade(col, 0.62 + rand() * 0.3)),
      );

      // Awning band
      fillQuad(
        ctx,
        S(ax, az),
        T(ax, az, ph * 0.78),
        S(bx2, bz2),
        T(bx2, bz2, ph * 0.78),
        S(bx2, bz2),
        T(bx2, bz2, ph * 0.64),
        S(ax, az),
        T(ax, az, ph * 0.64),
        rgbStr(...shade(pickInterior(0.6 + rand() * 0.4, rand()), 0.9)),
      );
    }
  }

  // Podium silhouette: an isometric box's outline is a hexagon — the top
  // face's two far edges, then the two near walls dropping to the ground.
  // The near top corner (pw, pd, ph) sits inside this ring, so it is not a
  // vertex of the outline.
  return [
    S(-pw, pd), T(-pw, pd, ph),
    S(-pw, -pd), T(-pw, -pd, ph),
    S(pw, -pd), T(pw, -pd, ph),
    S(pw, -pd), T(pw, -pd, 0),
    S(pw, pd), T(pw, pd, 0),
    S(-pw, pd), T(-pw, pd, 0),
  ];
}

/* ------------------------------------------------------------------ *
 * The tower
 * ------------------------------------------------------------------ */

function drawTower(
  ctx: CanvasRenderingContext2D,
  d: {
    S: DrawCtx['S'];
    T: DrawCtx['T'];
    rand: () => number;
    unit: number;
    live: Cell[];
    quality: 'high' | 'low';
    floors: Float32Array[];
    crowd: CrowdRoom[];
  },
): {
  crownSpec: { cx: number; cz: number; baseY: number; W: number };
  /** Flat [x,y,…] screen rings that hide the city behind them. */
  occluders: number[][];
} {
  const { S, T, rand, unit, live, quality, floors, crowd } = d;

  const plan = visiblePlan(HALF_W, HALF_D, CORNER_R, quality === 'high' ? 44 : 30);
  const baseY = 12; // sits on the podium
  // Storey heights are not uniform. The community hall and the lab are the two
  // floors the visitor is meant to look INTO, and at a shared storey height
  // their rooms came out ~10px wide by 16px tall — too little to draw a person
  // at a desk, which is why they read as texture rather than as occupied rooms.
  // Giving them double height is also how real lobbies and labs are built.
  const floorScale = (fl: number) =>
    COMMUNITY_FLOORS.includes(fl) ? 2.3 : LAB_FLOORS.includes(fl) ? 2 : 1;

  let scaleTotal = 0;
  for (let fl = 0; fl < FLOORS; fl++) scaleTotal += floorScale(fl);
  const storey = (TOWER_H - baseY) / scaleTotal;

  // Cumulative floor bases, so a taller storey pushes everything above it up.
  const floorBase: number[] = [];
  {
    let acc = baseY;
    for (let fl = 0; fl < FLOORS; fl++) {
      floorBase.push(acc);
      acc += storey * floorScale(fl);
    }
  }

  // Light direction, in plan. Drives per-strip facade brightness.
  const LX = 0.42;
  const LZ = 0.91;

  for (let f = 0; f < FLOORS; f++) {
    const floorH = storey * floorScale(f);
    const yb = floorBase[f];
    const yt = yb + floorH;
    const glassB = yb + floorH * 0.16;
    const glassT = yt - floorH * 0.1;

    // Ticker floors carry the partner board instead of offices, so their bays
    // are baked as a dark screen. Doing this at bake time rather than painting
    // over the windows per frame means the bloom pass sees the board and glows
    // from it, instead of glowing from windows that are no longer visible.
    const isTicker = TICKER_FLOORS.includes(f);
    const isCommunity = COMMUNITY_FLOORS.includes(f);
    const isLab = LAB_FLOORS.includes(f);

    for (let i = 0; i < plan.length - 1; i++) {
      const p0 = plan[i];
      const p1 = plan[i + 1];

      const nx = (p0.nx + p1.nx) / 2;
      const nz = (p0.nz + p1.nz) / 2;
      const facing = Math.max(0, nx * LX + nz * LZ);
      // Ambient floor: a facade turned away from the key light is still lit
      // from inside, so it must not fall to black or the tower loses a face.
      const bright = 0.58 + 0.42 * facing;

      if (isLab) {
        // Same room-grouping as the community hall: one bay is far too narrow
        // to stage a bench, equipment and someone working at it.
        const GROUP = 3;
        if (i % GROUP !== 0) continue;
        const pe = plan[Math.min(i + GROUP, plan.length - 1)];

        const lx0 = S(p0.x, p0.z);
        const lx1 = S(pe.x, pe.z);
        const ly0t = T(p0.x, p0.z, glassT);
        const ly1t = T(pe.x, pe.z, glassT);
        const ly0b = T(p0.x, p0.z, glassB);
        const ly1b = T(pe.x, pe.z, glassB);

        const at = (u: number, v: number): [number, number] => {
          const top = ly0t + (ly1t - ly0t) * u;
          const bot = ly0b + (ly1b - ly0b) * u;
          return [lx0 + (lx1 - lx0) * u, top + (bot - top) * v];
        };
        const strip = (v0: number, v1: number, fill: string) => {
          const [ax0, ay0] = at(0, v0);
          const [ax1, ay1] = at(1, v0);
          const [bx1, by1] = at(1, v1);
          const [bx0, by0] = at(0, v1);
          fillQuad(ctx, ax0, ay0, ax1, ay1, bx1, by1, bx0, by0, fill);
        };

        const hh = Math.abs(ly0b - ly0t);
        const roomW = Math.abs(lx1 - lx0);

        // Open, unglazed shell. Cool where the hall below is warm.
        strip(0, 1, rgbStr(...shade(hexToRgb('#12333f'), 0.85 + facing * 0.5)));
        strip(0.12, 0.6, rgbStr(...shade(hexToRgb('#1d5266'), 0.9 + facing * 0.5)));
        strip(0, 0.11, rgbStr(...shade(hexToRgb('#e8feff'), 1.2 * bright)));
        strip(0.88, 1, rgbStr(...shade(hexToRgb('#2f5468'), 0.9 + facing * 0.45)));

        // Structural column: with the cladding gone, the frame is what holds
        // the storey up and should be visible.
        {
          const cw = Math.max(1.6, roomW * 0.07);
          const [cx2, cy2] = at(0, 0);
          const [, cy3] = at(0, 1);
          ctx.fillStyle = rgbStr(...shade(hexToRgb('#5b7d95'), 0.8 + facing * 0.45));
          ctx.fillRect(cx2, cy2, cw, cy3 - cy2);
        }

        // Schematic patch on the back wall for a fraction of rooms — a diagram
        // pinned up rather than bare cladding.
        if (rand() < 0.2 && hh > 18) {
          const [wx, wy] = at(0.62, 0.2);
          const pw3 = roomW * 0.16;
          const ph3 = hh * 0.22;
          ctx.fillStyle = rgbStr(...shade(hexToRgb('#0a1e28'), 0.85));
          ctx.fillRect(wx, wy, pw3, ph3);
          ctx.strokeStyle = rgbStr(...shade(BRAND, 1.2), 0.6);
          ctx.lineWidth = Math.max(0.6, ph3 * 0.05);
          for (let L = 0; L < 3; L++) {
            ctx.beginPath();
            ctx.moveTo(wx + pw3 * 0.12, wy + ph3 * (0.28 + L * 0.24));
            ctx.lineTo(wx + pw3 * (0.5 + rand() * 0.35), wy + ph3 * (0.24 + L * 0.24));
            ctx.stroke();
          }
        }

        const stations = Math.max(1, Math.round(roomW / 13));
        for (let st = 0; st < stations; st++) {
          const u = (st + 0.5) / stations;
          const bw = (roomW / stations) * 0.62;

          // A rack behind some stations, for equipment mass.
          if (rand() < 0.4 && hh > 16) {
            const [rx, ry] = at(u, 0.2);
            const rw = bw * 0.5;
            ctx.fillStyle = rgbStr(...shade(hexToRgb('#0d2430'), 0.9));
            ctx.fillRect(rx - rw / 2, ry, rw, hh * 0.36);
            for (let L = 0; L < 3; L++) {
              ctx.fillStyle = rgbStr(...shade(L === 1 ? hexToRgb('#a78bfa') : BRAND, 1.4));
              ctx.fillRect(rx - rw / 2 + 1, ry + hh * 0.07 * (L + 1), rw - 2, Math.max(0.8, hh * 0.02));
            }
          }

          // Technician at the bench, then the bench over their lap.
          if (hh > 14) {
            const [sx2, sy2] = at(u, 0.86);
            drawPerson(ctx, sx2, sy2, hh * 0.42, rand, 0.55 + facing * 0.34, {
              seated: true,
              arms: true,
            });
          }

          const [bx2, by2] = at(u, 0.78);
          ctx.fillStyle = rgbStr(...shade(hexToRgb('#5c8299'), 0.85 + facing * 0.4));
          ctx.fillRect(bx2 - bw / 2, by2, bw, Math.max(1.5, hh * 0.07));

          // Monitor. A fraction go live instead of a flat fill, so a few
          // screens in the room read as actively in use rather than every
          // desk being identically, permanently lit.
          if (hh > 16) {
            const mw = bw * 0.4;
            const mh2 = hh * 0.15;
            const glowCol = shade(rand() < 0.25 ? hexToRgb('#a78bfa') : BRAND, 1.5);
            if (rand() < 0.25) {
              live.push({
                q: [
                  bx2 - mw / 2, by2 - mh2, bx2 + mw / 2, by2 - mh2,
                  bx2 + mw / 2, by2, bx2 - mw / 2, by2,
                ],
                r: glowCol[0], g: glowCol[1], b: glowCol[2],
                phase: rand() * Math.PI * 2,
              });
            } else {
              ctx.fillStyle = rgbStr(...glowCol);
              ctx.fillRect(bx2 - mw / 2, by2 - mh2, mw, mh2);
            }
          }

          // Coffee cup on the bench for a handful of stations — the small
          // domestic detail that sells "someone actually sits here."
          if (rand() < 0.15 && hh > 16) {
            const [cxp, cyp] = at(u + 0.16, 0.78);
            const cr = Math.max(0.7, bw * 0.06);
            ctx.fillStyle = rgbStr(...shade(hexToRgb('#e8e2d6'), 0.85 + facing * 0.3));
            ctx.beginPath();
            ctx.roundRect(cxp - cr, cyp - hh * 0.05, cr * 2, hh * 0.05, cr * 0.3);
            ctx.fill();
          }
        }

        // Register the room for the live crowd layer — one walking figure per
        // room, drawn per-frame in drawFrame rather than baked here, so it can
        // actually move.
        if (hh > 12) {
          crowd.push({ lx0, lx1, ly0t, ly1t, ly0b, ly1b, hh, seed: rand() });
        }

        continue;
      }

      if (isCommunity) {
        // Rooms, not bays. A single bay is ~8px wide against a 42px storey —
        // far too narrow to hold a desk and a person side by side, which is why
        // the crowd came out as a stacked double row. Grouping bays gives a
        // room roughly as wide as it is tall, matching the reference's
        // proportions, and the group still follows the facade's curvature
        // because its ends are real plan points.
        const GROUP = 3;
        if (i % GROUP !== 0) continue;
        const pe = plan[Math.min(i + GROUP, plan.length - 1)];

        const lx0 = S(p0.x, p0.z);
        const lx1 = S(pe.x, pe.z);
        const ly0t = T(p0.x, p0.z, glassT);
        const ly1t = T(pe.x, pe.z, glassT);
        const ly0b = T(p0.x, p0.z, glassB);
        const ly1b = T(pe.x, pe.z, glassB);

        const at = (u: number, v: number): [number, number] => {
          const top = ly0t + (ly1t - ly0t) * u;
          const bot = ly0b + (ly1b - ly0b) * u;
          return [lx0 + (lx1 - lx0) * u, top + (bot - top) * v];
        };
        const strip = (v0: number, v1: number, fill: string) => {
          const [ax0, ay0] = at(0, v0);
          const [ax1, ay1] = at(1, v0);
          const [bx1, by1] = at(1, v1);
          const [bx0, by0] = at(0, v1);
          fillQuad(ctx, ax0, ay0, ax1, ay1, bx1, by1, bx0, by0, fill);
        };

        const hh = Math.abs(ly0b - ly0t);
        const roomW = Math.abs(lx1 - lx0);

        // Shell: lit back wall, floor plane, ceiling strip.
        strip(0, 1, rgbStr(...shade(hexToRgb('#f6e3bd'), 0.5 + facing * 0.44)));
        strip(0.74, 1, rgbStr(...shade(hexToRgb('#cfae7c'), 0.55 + facing * 0.42)));
        strip(0, 0.09, rgbStr(...shade(hexToRgb('#fffdf6'), 1.2 * bright)));

        // Coloured partition between rooms — the flat colour stripes that give
        // the reference its rhythm.
        {
          const pw2 = Math.max(1.6, roomW * 0.09);
          const [wx, wy] = at(0, 0.09);
          const [, wy2] = at(0, 1);
          ctx.fillStyle = rgbStr(
            ...shade(pickInterior(rand() * 0.95, rand()), 0.6 + facing * 0.4),
          );
          ctx.fillRect(wx, wy, pw2, wy2 - wy);
        }

        // Whiteboard patch on a fraction of back walls — a room that people
        // actually use accretes pinned-up stuff, not bare paint.
        if (rand() < 0.2 && hh > 18) {
          const [wx3, wy3] = at(0.6, 0.16);
          const pw3 = roomW * 0.15;
          const ph3 = hh * 0.2;
          ctx.fillStyle = rgbStr(...shade(hexToRgb('#fffaf0'), 1.05 * bright));
          ctx.fillRect(wx3, wy3, pw3, ph3);
          ctx.strokeStyle = rgbStr(...shade(hexToRgb('#b8894f'), 0.9), 0.7);
          ctx.lineWidth = Math.max(0.6, ph3 * 0.05);
          for (let L = 0; L < 2; L++) {
            ctx.beginPath();
            ctx.moveTo(wx3 + pw3 * 0.14, wy3 + ph3 * (0.35 + L * 0.32));
            ctx.lineTo(wx3 + pw3 * (0.45 + rand() * 0.4), wy3 + ph3 * (0.3 + L * 0.32));
            ctx.stroke();
          }
        }

        const desks = Math.max(1, Math.round(roomW / 13));
        for (let dI = 0; dI < desks; dI++) {
          const u = (dI + 0.5) / desks;
          const dw = (roomW / desks) * 0.6;

          // Seated figure first: the desk drawn over it occludes the lap, which
          // is what makes the pose read as sitting AT the desk.
          if (hh > 14) {
            const [sx2, sy2] = at(u, 0.8);
            drawPerson(ctx, sx2, sy2, hh * 0.42, rand, 0.55 + facing * 0.36, {
              seated: true,
              arms: true,
            });
          }

          const [dx2, dy2] = at(u, 0.74);
          ctx.fillStyle = rgbStr(...shade(hexToRgb('#b8894f'), 0.75 + facing * 0.4));
          ctx.fillRect(dx2 - dw / 2, dy2, dw, Math.max(1.5, hh * 0.075));

          // Monitor. A fraction go live instead of a flat fill, matching the
          // lab's pattern — a handful of screens actively at work, not every
          // desk lit identically forever.
          if (hh > 18 && rand() < 0.7) {
            const mw = dw * 0.4;
            const mh2 = hh * 0.14;
            if (rand() < 0.25) {
              live.push({
                q: [
                  dx2 - mw / 2, dy2 - mh2, dx2 + mw / 2, dy2 - mh2,
                  dx2 + mw / 2, dy2, dx2 - mw / 2, dy2,
                ],
                r: BRAND[0], g: BRAND[1], b: BRAND[2],
                phase: rand() * Math.PI * 2,
              });
            } else {
              ctx.fillStyle = rgbStr(...shade(BRAND, 1.28));
              ctx.fillRect(dx2 - mw / 2, dy2 - mh2, mw, mh2);
            }
          }

          // Coffee cup for a handful of desks.
          if (rand() < 0.15 && hh > 16) {
            const [cxp, cyp] = at(u + 0.14, 0.74);
            const cr = Math.max(0.7, dw * 0.06);
            ctx.fillStyle = rgbStr(...shade(hexToRgb('#e8e2d6'), 0.85 + facing * 0.3));
            ctx.beginPath();
            ctx.roundRect(cxp - cr, cyp - hh * 0.05, cr * 2, hh * 0.05, cr * 0.3);
            ctx.fill();
          }
        }

        // Register the room for the live crowd layer — one walking figure per
        // room, drawn per-frame in drawFrame rather than baked here, so the
        // hall actually reads as busy instead of frozen.
        if (hh > 12) {
          crowd.push({ lx0, lx1, ly0t, ly1t, ly0b, ly1b, hh, seed: rand() });
        }

        continue;
      }

      if (isTicker) {
        fillQuad(
          ctx,
          S(p0.x, p0.z),
          T(p0.x, p0.z, glassT),
          S(p1.x, p1.z),
          T(p1.x, p1.z, glassT),
          S(p1.x, p1.z),
          T(p1.x, p1.z, glassB),
          S(p0.x, p0.z),
          T(p0.x, p0.z, glassB),
          rgbStr(...shade(hexToRgb('#020c14'), 0.6 + facing * 0.4)),
        );
        continue;
      }

      const ax = S(p0.x, p0.z);
      const bx = S(p1.x, p1.z);
      const abTop = T(p0.x, p0.z, glassT);
      const bbTop = T(p1.x, p1.z, glassT);
      const abBot = T(p0.x, p0.z, glassB);
      const bbBot = T(p1.x, p1.z, glassB);

      // Structural bay behind the glass
      fillQuad(
        ctx,
        ax,
        abTop,
        bx,
        bbTop,
        bx,
        bbBot,
        ax,
        abBot,
        rgbStr(...shade(MULLION, 0.6 + facing * 0.5)),
      );

      const inset = 0.1;
      const cx0 = ax + (bx - ax) * inset;
      const cy0t = abTop + (bbTop - abTop) * inset;
      const cy0b = abBot + (bbBot - abBot) * inset;
      const cx1 = ax + (bx - ax) * (1 - inset);
      const cy1t = abTop + (bbTop - abTop) * (1 - inset);
      const cy1b = abBot + (bbBot - abBot) * (1 - inset);

      const cellH = cy0b - cy0t;

      const roll = rand();

      // A partition wall: a flat saturated plane filling the bay.
      if (roll < 0.12) {
        const col = pickInterior(rand(), rand());
        fillQuad(
          ctx,
          cx0,
          cy0t,
          cx1,
          cy1t,
          cx1,
          cy1b,
          cx0,
          cy0b,
          rgbStr(...shade(col, bright * 1.34)),
        );
        continue;
      }

      // A dark bay — unlit floors keep the tower from reading as a solid slab.
      if (roll < 0.28) {
        fillQuad(
          ctx,
          cx0,
          cy0t,
          cx1,
          cy1t,
          cx1,
          cy1b,
          cx0,
          cy0b,
          rgbStr(...shade(SLAB, 0.7 + facing * 0.5)),
        );
        continue;
      }

      // Open-plan bay: ceiling glow, floor plane, desk, workstation.
      const col = pickInterior(rand(), rand());
      const room = shade(col, 0.62 + facing * 0.36);
      fillQuad(ctx, cx0, cy0t, cx1, cy1t, cx1, cy1b, cx0, cy0b, rgbStr(...room));

      // Ceiling light strip
      fillQuad(
        ctx,
        cx0,
        cy0t,
        cx1,
        cy1t,
        cx1,
        cy1t + cellH * 0.2,
        cx0,
        cy0t + cellH * 0.2,
        rgbStr(...shade(col, 1.95 * bright + 0.72)),
      );

      // Desk run
      const dTop = cellH * 0.58;
      const dBot = cellH * 0.74;
      fillQuad(
        ctx,
        cx0,
        cy0t + dTop,
        cx1,
        cy1t + dTop,
        cx1,
        cy1t + dBot,
        cx0,
        cy0t + dBot,
        rgbStr(...shade(room, 0.46)),
      );

      // Workstation glow on the desk — the smallest unit of "someone working".
      const stations = rand() < 0.55 ? 2 : 1;
      for (let s = 0; s < stations; s++) {
        const t0 = 0.16 + s * 0.42 + rand() * 0.08;
        const t1 = t0 + 0.2;
        const sx0 = cx0 + (cx1 - cx0) * t0;
        const sy0 = cy0t + (cy1t - cy0t) * t0;
        const sx1 = cx0 + (cx1 - cx0) * t1;
        const sy1 = cy0t + (cy1t - cy0t) * t1;
        const glow = shade(pickInterior(rand() * 0.75, rand()), 1.62);
        const q: Cell['q'] = [
          sx0,
          sy0 + cellH * 0.4,
          sx1,
          sy1 + cellH * 0.4,
          sx1,
          sy1 + cellH * 0.6,
          sx0,
          sy0 + cellH * 0.6,
        ];

        // A slice of workstations animate; the rest are baked into the base.
        if (rand() < (quality === 'high' ? 0.05 : 0.02) && live.length < 320) {
          live.push({ q, r: glow[0], g: glow[1], b: glow[2], phase: rand() * Math.PI * 2 });
        } else {
          fillQuad(ctx, ...q, rgbStr(...glow));
        }
      }
    }

    // Capture this floor's glass band as a closed outline: across the top of
    // the facade left-to-right, then back along the bottom.
    const band = new Float32Array(plan.length * 4);
    for (let i = 0; i < plan.length; i++) {
      const p = plan[i];
      band[i * 2] = S(p.x, p.z);
      band[i * 2 + 1] = T(p.x, p.z, glassT);
      const j = plan.length * 2 + (plan.length - 1 - i) * 2;
      band[j] = S(p.x, p.z);
      band[j + 1] = T(p.x, p.z, glassB);
    }
    floors.push(band);

    // Floor slab — the horizontal banding that makes the stack legible.
    for (let i = 0; i < plan.length - 1; i++) {
      const p0 = plan[i];
      const p1 = plan[i + 1];
      const nx = (p0.nx + p1.nx) / 2;
      const nz = (p0.nz + p1.nz) / 2;
      const facing = Math.max(0, nx * LX + nz * LZ);
      fillQuad(
        ctx,
        S(p0.x, p0.z),
        T(p0.x, p0.z, yb + floorH * 0.16),
        S(p1.x, p1.z),
        T(p1.x, p1.z, yb + floorH * 0.16),
        S(p1.x, p1.z),
        T(p1.x, p1.z, yb),
        S(p0.x, p0.z),
        T(p0.x, p0.z, yb),
        rgbStr(...shade(SLAB, 0.75 + facing * 0.75)),
      );
    }
  }

  /* ---- Roof ---- */
  const roofY = floorBase[FLOORS - 1] + storey * floorScale(FLOORS - 1);
  const outline = fullPlan(HALF_W, HALF_D, CORNER_R);
  ctx.beginPath();
  outline.forEach((p, i) => {
    const sx = S(p.x, p.z);
    const sy = T(p.x, p.z, roofY);
    i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
  });
  ctx.closePath();
  // Dark deck, lit only at its edge — the crown should read as a rim of light,
  // not as a lid.
  ctx.fillStyle = rgbStr(...shade(ROOF, 1.05));
  ctx.fill();
  ctx.strokeStyle = rgbStr(...BRAND, 0.5);
  ctx.lineWidth = Math.max(1, unit * 0.42);
  ctx.stroke();

  // Roof plant: a recessed service deck and a scatter of vents, so the top
  // plane carries detail at the density the facade does.
  ctx.beginPath();
  outline.forEach((p, i) => {
    const sx = S(p.x * 0.82, p.z * 0.82);
    const sy = T(p.x * 0.82, p.z * 0.82, roofY + 2.5);
    i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
  });
  ctx.closePath();
  ctx.fillStyle = rgbStr(...shade(ROOF, 1.12));
  ctx.fill();

  // Mechanical plant, laid out on a loose grid. Real roof kit is orderly, and
  // a random scatter here reads as damage rather than as equipment.
  for (let gx = -1; gx <= 1; gx++) {
    for (let gz = -1; gz <= 1; gz++) {
      if (rand() < 0.3) continue;
      const vx = gx * HALF_W * 0.42 + (rand() - 0.5) * 4;
      const vz = gz * HALF_D * 0.42 + (rand() - 0.5) * 4;
      const vw = 3 + rand() * 3.5;
      const vd = 3 + rand() * 3;
      const vh = 2.5 + rand() * 4;
      const yTop = roofY + 2.5 + vh;
      // Top plate
      fillQuad(
        ctx,
        S(vx - vw, vz - vd),
        T(vx - vw, vz - vd, yTop),
        S(vx + vw, vz - vd),
        T(vx + vw, vz - vd, yTop),
        S(vx + vw, vz + vd),
        T(vx + vw, vz + vd, yTop),
        S(vx - vw, vz + vd),
        T(vx - vw, vz + vd, yTop),
        rgbStr(...shade(ROOF, 1.14)),
      );
      // Two visible sides, so the plant has mass rather than reading as decals
      fillQuad(
        ctx,
        S(vx + vw, vz - vd),
        T(vx + vw, vz - vd, yTop),
        S(vx + vw, vz + vd),
        T(vx + vw, vz + vd, yTop),
        S(vx + vw, vz + vd),
        T(vx + vw, vz + vd, roofY + 2.5),
        S(vx + vw, vz - vd),
        T(vx + vw, vz - vd, roofY + 2.5),
        rgbStr(...shade(ROOF, 1.08)),
      );
      fillQuad(
        ctx,
        S(vx + vw, vz + vd),
        T(vx + vw, vz + vd, yTop),
        S(vx - vw, vz + vd),
        T(vx - vw, vz + vd, yTop),
        S(vx - vw, vz + vd),
        T(vx - vw, vz + vd, roofY + 2.5),
        S(vx + vw, vz + vd),
        T(vx + vw, vz + vd, roofY + 2.5),
        rgbStr(...shade(ROOF, 1.04)),
      );
    }
  }

  // Pedestal for the crown. The mark hovers just clear of it, so the roof
  // still reads as carrying something rather than as having something
  // dropped on top of it.
  const pw = 11;
  const pd = 9;
  const ph = roofY + 8;
  fillQuad(
    ctx,
    S(-pw, -pd),
    T(-pw, -pd, ph),
    S(pw, -pd),
    T(pw, -pd, ph),
    S(pw, pd),
    T(pw, pd, ph),
    S(-pw, pd),
    T(-pw, pd, ph),
    rgbStr(...shade(ROOF, 1.2)),
  );
  fillQuad(
    ctx,
    S(pw, -pd),
    T(pw, -pd, ph),
    S(pw, pd),
    T(pw, pd, ph),
    S(pw, pd),
    T(pw, pd, roofY + 2.5),
    S(pw, -pd),
    T(pw, -pd, roofY + 2.5),
    rgbStr(...shade(ROOF, 1.11)),
  );
  fillQuad(
    ctx,
    S(pw, pd),
    T(pw, pd, ph),
    S(-pw, pd),
    T(-pw, pd, ph),
    S(-pw, pd),
    T(-pw, pd, roofY + 2.5),
    S(pw, pd),
    T(pw, pd, roofY + 2.5),
    rgbStr(...shade(ROOF, 1.05)),
  );

  // Placement only. The crown is painted per-frame, above the atmospheric
  // passes — baked in here it would sit under the haze and the vignette,
  // which is precisely what stops a light source reading as one.
  // Screen-space silhouettes of everything on the tower that hides the city
  // behind it. Returned rather than drawn: the pointer-lit windows are a
  // per-frame layer over the baked image, so they need an explicit occlusion
  // test that the painter's-algorithm bake gives the dark windows for free.
  const facade: number[] = [];
  for (let i = 0; i < plan.length; i++) {
    facade.push(S(plan[i].x, plan[i].z), T(plan[i].x, plan[i].z, roofY));
  }
  for (let i = plan.length - 1; i >= 0; i--) {
    facade.push(S(plan[i].x, plan[i].z), T(plan[i].x, plan[i].z, baseY));
  }

  // The roof plane, taken a little above the parapet so the deck and its
  // plant are covered too.
  const roofRing: number[] = [];
  for (const pt of fullPlan(HALF_W, HALF_D, CORNER_R)) {
    roofRing.push(S(pt.x, pt.z), T(pt.x, pt.z, roofY + 10));
  }

  return {
    crownSpec: { cx: 0, cz: 0, baseY: roofY + 9, W: 36 },
    occluders: [facade, roofRing],
  };
}

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

function fillQuad(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  fill: string | CanvasGradient,
) {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.lineTo(dx, dy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/* ------------------------------------------------------------------ *
 * Per-frame layer
 * ------------------------------------------------------------------ */

/**
 * The live crowd layer: one walking figure per community/lab room, moving
 * back and forth along the room's own floor line.
 *
 * Everything else on these floors — desks, seated figures, walls — stays
 * baked into the scene's static base image, because none of it needs to
 * move. Redrawing a whole room's furniture every frame for the sake of one
 * moving figure would be real per-frame cost for no visual gain; this walks
 * only the figure that is actually meant to walk.
 *
 * Position is a plain `sin()`, not a sawtooth — continuous by construction,
 * with no modulo wraparound to reintroduce the class of bug the crown's
 * rotation snap turned out to be (see `drawCrown`). Each room's phase and
 * speed come from its own `seed`, so a floor full of rooms never reads as one
 * figure copy-pasted down the corridor.
 */
function drawCrowdWalkers(ctx: CanvasRenderingContext2D, scene: Scene, time: number, still: boolean) {
  for (const room of scene.crowd) {
    if (room.hh <= 12) continue;

    const rand = makeRng((room.seed * 4294967296) >>> 0);
    // Walk between 18% and 82% of the room's width — clear of the partition
    // wall at one edge and the room boundary at the other.
    const speed = 0.5 + rand() * 0.35;
    const phase = rand() * Math.PI * 2;
    const u = still ? 0.5 : 0.5 + 0.32 * Math.sin(time * speed + phase);

    const top0 = room.ly0t + (room.ly1t - room.ly0t) * u;
    const bot0 = room.ly0b + (room.ly1b - room.ly0b) * u;
    const x = room.lx0 + (room.lx1 - room.lx0) * u;
    const y = top0 + (bot0 - top0) * 0.99;

    // Facing direction flips with walk direction — walking backwards reads
    // as a bug even at this scale — but drawPerson has no left/right
    // silhouette to flip, so this drives the gesture instead: a figure mid
    // stride gestures more often than one standing idle.
    //
    // `gestureRoll` is pulled unconditionally, not inside the `&&` below: the
    // room reseeds `rand` fresh every frame, so drawPerson's own colour picks
    // (shirt, skin, hair) are stable only if the SAME number of rand() calls
    // always precedes them. Folding the roll into a short-circuited `&&`
    // would skip that call on frames where `dir` is small, shifting every
    // later pull by one and making the walker's clothing flicker between
    // colours as it crossed the threshold mid-stride.
    const dir = Math.cos(time * speed + phase);
    const gestureRoll = rand() < 0.4;
    drawPerson(ctx, x, y, room.hh * 0.4, rand, 0.55, {
      gesture: Math.abs(dir) > 0.15 && gestureRoll,
    });
  }
}

/**
 * The surrounding city answering the pointer: windows waking as it passes, the
 * bounce those windows throw onto nearby rooftops, and the halo they bleed
 * into the air.
 *
 * Brightness is no longer a function of pointer distance. Every window holds
 * its own level, attacked hard while the pointer is near and released slowly
 * afterwards, so the cursor drags a tail of rooms still going dark behind it
 * rather than carrying a hard disc around with it. Windows also blink on their
 * own, well below the pointer's brightness, so the skyline is never completely
 * dead while the cursor is over the copy.
 *
 * Because a fading window has to keep being drawn long after it leaves the
 * pointer's radius, the frame can no longer find its work by scanning for
 * proximity. It comes from two places instead: `grid`, which yields only the
 * windows near the pointer, and `pulse.active`, which holds everything with
 * light left in it. Both are small, so this does considerably more than the
 * old full-array sweep while touching fewer windows.
 */
function drawCityLights(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  time: number,
  still: boolean,
  pointer: { x: number; y: number; strength: number } | null,
) {
  const { w, h, dormant, pulse, grid, roofs, fx } = scene;
  const n = dormant.cx.length;
  if (!n) return;

  const { q, cx, cy, fade, r, g, b, seed } = dormant;
  const { level, stamp, target, inActive, active } = pulse;

  // Scaled off the frame so the pool covers the same share of the scene at any
  // viewport, rather than swamping a small one.
  const radius = Math.max(90, Math.min(w, h) * 0.2);
  const r2 = radius * radius;

  // Frame-rate independent easing: the latch is specified in seconds, so a
  // 120Hz display gets the same trail as a 60Hz one. `still` is the
  // reduced-motion path, which paints one settled frame and so has to snap.
  const dt = still ? Infinity : Math.min(0.1, Math.max(0, time - pulse.lastT));
  pulse.lastT = time;
  const kAttack = still ? 1 : 1 - Math.exp(-dt / PULSE_ATTACK_TAU);
  const kDecay = still ? 1 : 1 - Math.exp(-dt / PULSE_DECAY_TAU);

  const frame = ++pulse.frame;
  let count = pulse.activeCount;

  /**
   * Asks for window `i` to be at least `v` bright this frame. Targets are
   * stamped with the frame number rather than cleared, so neither this nor the
   * integration below ever has to walk the full array.
   */
  const want = (i: number, v: number) => {
    if (v <= PULSE_EPSILON) return;
    if (stamp[i] !== frame) {
      stamp[i] = frame;
      target[i] = v;
    } else if (v > target[i]) {
      target[i] = v;
    }
    if (!inActive[i]) {
      inActive[i] = 1;
      active[count++] = i;
    }
  };

  // Pointer pass. Only the grid cells the disc overlaps are visited.
  if (pointer && pointer.strength > 0.004) {
    const { cell, cols, rows, start, items } = grid;
    const gx0 = Math.max(0, Math.floor((pointer.x - radius) / cell));
    const gx1 = Math.min(cols - 1, Math.floor((pointer.x + radius) / cell));
    const gy0 = Math.max(0, Math.floor((pointer.y - radius) / cell));
    const gy1 = Math.min(rows - 1, Math.floor((pointer.y + radius) / cell));
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const c = gy * cols + gx;
        for (let k = start[c]; k < start[c + 1]; k++) {
          const i = items[k];
          const dx = cx[i] - pointer.x;
          const dy = cy[i] - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          // Falloff exponent under 2: a squared curve put almost all the light
          // in the innermost pixels and left the rest of the radius looking
          // unlit, so the pool read as a hard dot rather than a neighbourhood
          // waking up.
          const f = 1 - Math.sqrt(d2) / radius;
          want(i, Math.pow(f, 1.25) * pointer.strength);
        }
      }
    }
  }

  // Idle pass. Each participant takes one turn per IDLE_PERIOD, phase-offset by
  // its own seed so the turns spread evenly through the cycle instead of the
  // whole set flashing together.
  if (!still) {
    const { idle } = pulse;
    for (let k = 0; k < idle.length; k++) {
      const i = idle[k];
      const phase = (time / IDLE_PERIOD + seed[i] / IDLE_SHARE) % 1;
      if (phase * IDLE_PERIOD < IDLE_ON) want(i, IDLE_LEVEL);
    }
  }

  const bloom = fx ? fx.src.getContext('2d') : null;
  if (fx && bloom) {
    bloom.setTransform(1, 0, 0, 1, 0, 0);
    bloom.clearRect(0, 0, fx.w, fx.h);
    bloom.setTransform(fx.scale, 0, 0, fx.scale, 0, 0);
  }

  ctx.save();
  // Additive: these sit over an already-lit facade, and compositing them
  // normally would flatten the baked colour underneath into a patch of paint
  // instead of reading as light being added to the scene.
  ctx.globalCompositeOperation = 'lighter';

  // Bounce onto roof planes near the pointer. Deliberately not latched: a
  // filament takes a moment to come up and a moment to die, but light landing
  // on a roof arrives and leaves with its source.
  if (pointer && pointer.strength > 0.004 && roofs.cx.length) {
    for (let i = 0; i < roofs.cx.length; i++) {
      const dx = roofs.cx[i] - pointer.x;
      const dy = roofs.cy[i] - pointer.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      // Squared falloff, tighter than the windows': bounce is a fraction of
      // the light that made it, so it has to run out well before the source.
      const f = 1 - Math.sqrt(d2) / radius;
      const a = f * f * (1 - roofs.fade[i] * 0.6) * pointer.strength * ROOF_SHEEN_GAIN;
      if (a <= 0.003) continue;
      const o = i * 8;
      fillQuad(
        ctx,
        roofs.q[o], roofs.q[o + 1], roofs.q[o + 2], roofs.q[o + 3],
        roofs.q[o + 4], roofs.q[o + 5], roofs.q[o + 6], roofs.q[o + 7],
        rgbStr(...ROOF_SHEEN, a),
      );
    }
  }

  // Integrate and draw, compacting the active set as windows go dark. `write`
  // never runs ahead of `k`, so rewriting the array while reading it is safe.
  let write = 0;
  for (let k = 0; k < count; k++) {
    const i = active[k];
    const tgt = stamp[i] === frame ? target[i] : 0;
    const cur = level[i];
    // Rising windows take their own time about it — a shared attack rate made
    // a whole neighbourhood come up as one slab.
    const ease = tgt > cur ? Math.min(1, kAttack * (0.55 + seed[i] * 0.9)) : kDecay;
    const next = cur + (tgt - cur) * ease;

    if (next <= PULSE_EPSILON) {
      level[i] = 0;
      inActive[i] = 0;
      continue;
    }
    level[i] = next;
    active[write++] = i;

    // Distant windows light less, matching the atmospheric fade already baked
    // into them — a haze-dimmed building brightening to full would jump
    // forward out of its own depth plane.
    //
    // Overdriven well past the point where the cap bites, on purpose: the hero
    // lays a scrim gradient OVER this canvas in the DOM, which eats up to ~two
    // thirds of the light on the copy side. Pushing the multiplier widens the
    // plateau where windows reach full brightness so the effect survives that
    // veil instead of only reading on bare sky.
    const a = Math.min(1, next * (1 - fade[i] * 0.4) * 2.1);
    const o = i * 8;
    const col = rgbStr(r[i], g[i], b[i], a);
    fillQuad(
      ctx,
      q[o], q[o + 1], q[o + 2], q[o + 3],
      q[o + 4], q[o + 5], q[o + 6], q[o + 7],
      col,
    );
    if (bloom) {
      fillQuad(
        bloom,
        q[o], q[o + 1], q[o + 2], q[o + 3],
        q[o + 4], q[o + 5], q[o + 6], q[o + 7],
        col,
      );
    }
  }
  pulse.activeCount = write;
  ctx.restore();

  // Bloom. Half resolution, so the blur runs over a quarter of the pixels the
  // full frame would cost and the 2x upscale softens it further for free.
  if (fx && bloom && write > 0) {
    const blurred = fx.blur.getContext('2d');
    if (blurred) {
      blurred.setTransform(1, 0, 0, 1, 0, 0);
      blurred.globalCompositeOperation = 'source-over';
      blurred.clearRect(0, 0, fx.w, fx.h);
      // Degrades to an unblurred — still soft, from the upscale — halo where
      // ctx.filter is unsupported, rather than needing a capability check.
      blurred.filter = 'blur(5px)';
      blurred.drawImage(fx.src, 0, 0);
      blurred.filter = 'none';

      // Punch the tower out BEFORE compositing rather than clipping after.
      // Blurring on top of the cut would smear the halo back over the facade,
      // which is the same "city leaking through the tower" artefact the window
      // filter exists to prevent — and the reason an earlier pooled glow had
      // to be pulled.
      blurred.globalCompositeOperation = 'destination-out';
      blurred.drawImage(fx.mask, 0, 0);
      blurred.globalCompositeOperation = 'source-over';

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.8;
      ctx.drawImage(fx.blur, 0, 0, w, h);
      ctx.restore();
    }
  }
}

/**
 * Blits the baked scene, then draws only the animated elements: a slice of
 * workstations breathing out of phase, and the rooftop beacon with the
 * broadcast arcs lifted from the logo mark.
 *
 * `t` is elapsed seconds. When `t` is null the scene renders in its settled
 * state with no motion, which is the reduced-motion path.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  t: number | null,
  highlight?: { from: number; to: number; strength: number } | null,
  partners?: TickerEntry[] | null,
  /**
   * Pointer position in canvas CSS pixels, plus how strongly the effect is
   * faded in. `strength` is eased by the caller rather than derived here, so
   * the glow can fade out from the last known position after the pointer has
   * already left the canvas.
   */
  pointer?: { x: number; y: number; strength: number } | null,
) {
  const { w, h, base, dpr } = scene;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, base.width, base.height);
  ctx.drawImage(base, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const time = t ?? 0;
  const still = t === null;

  for (const c of scene.live) {
    const k = still ? 0.85 : 0.55 + 0.45 * Math.sin(time * 1.6 + c.phase);
    fillQuad(ctx, ...c.q, rgbStr(c.r, c.g, c.b, 0.25 + k * 0.75));
  }

  drawCrowdWalkers(ctx, scene, time, still);

  drawCityLights(ctx, scene, time, still, pointer ?? null);

  // Floor-band highlight. Tinting the chosen floors alone is nearly invisible
  // against a facade that is already full of light, so the rest of the stack is
  // dimmed instead — the selected layer stays at full brightness and the eye
  // goes straight to it.
  if (highlight && highlight.strength > 0.001) {
    const { from, to, strength } = highlight;
    const trace = (band: Float32Array) => {
      ctx.beginPath();
      ctx.moveTo(band[0], band[1]);
      for (let i = 2; i < band.length; i += 2) ctx.lineTo(band[i], band[i + 1]);
      ctx.closePath();
    };

    ctx.save();
    for (let f = 0; f < scene.floors.length; f++) {
      const band = scene.floors[f];
      if (!band) continue;
      const inRange = f >= from && f <= to;
      trace(band);
      if (inRange) {
        ctx.fillStyle = rgbStr(...BRAND, 0.14 * strength);
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(1,4,12,${0.62 * strength})`;
        ctx.fill();
      }
    }

    // Rim the selected band so its edges are crisp against the dimmed stack.
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = rgbStr(...shade(BRAND, 1.5), 0.75 * strength);
    for (let f = from; f <= to; f++) {
      const band = scene.floors[f];
      if (!band) continue;
      trace(band);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Partner ticker board, wrapped around the partner floors. Brightens when
  // those floors are the ones being highlighted.
  if (partners && partners.length) {
    const lit =
      highlight &&
      TICKER_FLOORS.some((f) => f >= highlight.from && f <= highlight.to)
        ? highlight.strength
        : 0;
    drawPartnerTicker(ctx, scene, partners, time, TICKER_FLOORS, 0.78 + lit * 0.22);
  }

  // Broadcast arcs — the logo's own signal gesture, at city scale. Partial
  // arcs opening upward from the crown so they read as emission rather than as
  // rings floating in the sky. Drawn BEFORE the crown, or they stripe across
  // the mark's face.
  if (!still) {
    const ax = scene.proj.ox + px(scene.crown.cx, scene.crown.cz) * scene.proj.unit;
    const ay =
      scene.proj.oy +
      py(scene.crown.cx, scene.crown.cz, scene.crown.baseY) * scene.proj.unit;
    const ar = Math.max(3, scene.proj.unit * 1.5);
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const rawProg = (time * 0.22 + i / 3) % 1;
      const prog = ((rawProg % 1) + 1) % 1;
      // Ease-out so each arc decelerates as it dissipates.
      const e = 1 - Math.pow(1 - prog, 2.2);
      const rad = Math.max(0.1, ar * 1.2 + e * Math.min(w, h) * 0.3);
      const alpha = (1 - e) * 0.3;
      if (alpha <= 0.004) continue;
      ctx.lineWidth = Math.max(0.8, ar * 0.18 * (1 - e * 0.5));
      ctx.strokeStyle = rgbStr(...BRAND, alpha);
      ctx.beginPath();
      ctx.ellipse(ax, ay, rad, Math.max(0.1, rad * 0.66), 0, Math.PI * 1.22, Math.PI * 1.78);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Pedestal ambient light pool and sky bloom.
  // The actual 3D optical glass CybrDeck crown is rendered via Three.js WebGL (TowerCrown3D).
  drawCrownGlow(ctx, scene, time, still);
}

/* ------------------------------------------------------------------ *
 * Partner ticker board
 * ------------------------------------------------------------------ */

export interface TickerEntry {
  name: string;
  /** Decoded logo, or null when the file failed to load. */
  img: HTMLImageElement | null;
  /**
   * Aspect ratio of the CONTENT region, not the source file's own canvas.
   * A partner's exported PNG is not guaranteed to be cropped tight — a logo
   * centred on a large padded (or worse, square) canvas would otherwise draw
   * as a big blank tile with a sliver of mark in the middle. Trimmed once at
   * decode time in RedesignHero.tsx; see `trimContentBounds` there.
   */
  aspect: number;
  /** Source-pixel bounding box of the content region, for the slice mapping
   * in `drawPartnerTicker` below. Defaults to the whole image when absent. */
  src?: { sx: number; sy: number; sw: number; sh: number };
  /** Logo artwork assumes a light ground and needs a chip behind it. */
  bgWhite?: boolean;
}

/**
 * Streams partner logos around three floors of the tower, as a ticker board.
 *
 * Each stored floor band is a closed outline — the first half walks the top
 * edge in plan order, the second half walks the bottom edge back — so every
 * sample index yields a matching top/bottom pair, which is all that is needed
 * to sit content on the facade.
 *
 * An entry is placed by arc length along the top edge and drawn through a
 * single affine transform whose x-axis follows the facade and whose y-axis
 * stays screen-vertical. One transform per entry, not per glyph: a rigid tile
 * on a curved facade should stay rigid and slide out of view at the corner,
 * which is what the clip to the band takes care of.
 *
 * Rows run at different speeds so the three lines never lock into a single
 * block moving in step.
 */
function drawPartnerTicker(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  entries: TickerEntry[],
  time: number,
  floors: readonly number[],
  alpha: number,
) {
  if (!entries.length || alpha <= 0.01) return;

  for (let row = 0; row < floors.length; row++) {
    const band = scene.floors[floors[row]];
    if (!band) continue;

    const n = band.length / 4;
    if (n < 2) continue;

    // `visiblePlan` samples right-to-left, so index from the far end or every
    // tile comes out mirrored.
    const top = (k: number): [number, number] => {
      const i = n - 1 - k;
      return [band[i * 2], band[i * 2 + 1]];
    };
    const bottom = (k: number): [number, number] => {
      const j = n * 2 + k * 2;
      return [band[j], band[j + 1]];
    };

    const cum: number[] = [0];
    for (let k = 1; k < n; k++) {
      const [x0, y0] = top(k - 1);
      const [x1, y1] = top(k);
      cum.push(cum[k - 1] + Math.hypot(x1 - x0, y1 - y0));
    }
    const total = cum[n - 1];
    if (total < 40) continue;

    const [tx0, ty0] = top(0);
    const [, by0] = bottom(0);
    const bandH = Math.abs(by0 - ty0);
    if (bandH < 7) continue;

    ctx.save();
    // Clip to the band: without it a tile starting near the end of the facade
    // runs straight off the silhouette and floats in the sky.
    ctx.beginPath();
    ctx.moveTo(band[0], band[1]);
    for (let i = 2; i < band.length; i += 2) ctx.lineTo(band[i], band[i + 1]);
    ctx.closePath();
    ctx.clip();

    // Marks only. A band this tall renders a name at ~9px, which is not
    // readable on a sheared facade, and carrying both doubled every tile's
    // width until the three rows read as one crowded mass. Partners that have
    // no usable logo fall back to their name, which is the only case where
    // type earns the space.
    const fontSize = Math.max(6, Math.min(11, bandH * 0.4));
    ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = 'middle';

    const logoH = bandH * 0.5;
    const padX = bandH * 1.15;

    // Measure one full pass so the scroll can wrap seamlessly.
    const widths = entries.map((e) =>
      (e.img ? logoH * e.aspect : ctx.measureText(e.name).width) + padX,
    );
    const span = widths.reduce((a, b) => a + b, 0);
    if (span <= 0) {
      ctx.restore();
      continue;
    }

    // Facade sample at arc-length `d`: an origin point, the tangent there
    // (x follows the facade, y stays screen-vertical so signage stands up),
    // and the band's local half-height. Re-derived per SLICE rather than once
    // per tile below — sampling once at a tile's centre and drawing its full
    // width flat was cutting the corner internally: a logo wide enough spans
    // enough arc length that the facade's own curvature, sharpest at the
    // tower's rounded corners, pulls the tile visibly off the surface. It
    // read as a rigid card poking through the bend rather than signage
    // wrapped around it — which is exactly the defect being fixed here.
    const sampleBand = (d: number) => {
      const dd = Math.min(total, Math.max(0, d));
      let k = 1;
      while (k < n - 1 && cum[k] < dd) k++;
      const segLen = cum[k] - cum[k - 1] || 1;
      const t = Math.min(1, Math.max(0, (dd - cum[k - 1]) / segLen));

      const [ax, ay] = top(k - 1);
      const [bx, by] = top(k);
      const ux = (bx - ax) / segLen;
      const uy = (by - ay) / segLen;
      const ox = ax + (bx - ax) * t;
      const oy = ay + (by - ay) * t;

      const [cbx, cby] = bottom(k - 1);
      const [ebx, eby] = bottom(k);
      const h = Math.hypot(cbx + (ebx - cbx) * t - ox, cby + (eby - cby) * t - oy);

      return { ox, oy, ux, uy, h };
    };

    // Alternating direction and differing speed, the way a real board runs
    // several independent lines.
    const speed = 20 + row * 7;
    const dir = row % 2 === 0 ? 1 : -1;
    const offset = (row * span) / floors.length;
    let cursor =
      -(((time * speed * dir + offset) % span) + span) % span;

    let idx = 0;
    const guard = entries.length * 4 + 12;
    for (let step = 0; step < guard && cursor < total; step++) {
      const e = entries[idx % entries.length];
      const wEntry = widths[idx % widths.length];

      if (cursor + wEntry > 0) {
        if (e.img) {
          const lw = logoH * e.aspect;
          // Cheap outward padding around the whole logo, applied only at its
          // two outer edges below — the "chip is a little larger than the
          // mark" cue the flat version had, kept without needing a rounded
          // rect (which a strip of thin slices cannot approximate cleanly).
          const edgePad = logoH * 0.16;

          // Slice count scales with on-screen width: enough that consecutive
          // slices' tangents never differ enough to show a facet, capped so a
          // huge logo cannot spend an unbounded number of draws per frame.
          const SLICES = Math.max(3, Math.min(14, Math.ceil(lw / 4.5)));

          for (let s = 0; s < SLICES; s++) {
            const x0 = (s / SLICES) * lw;
            const x1 = ((s + 1) / SLICES) * lw;
            const dPos = cursor + (x0 + x1) / 2;
            if (dPos < -4 || dPos > total + 4) continue;

            const { ox, oy, ux, uy, h } = sampleBand(dPos);
            const mid = h * 0.5;
            // A hairline overlap between neighbours: each slice sits in its
            // own slightly-rotated local frame, and floating-point edges that
            // land a fraction of a pixel apart leave a seam without it.
            const left = s === 0 ? -edgePad : -0.4;
            const right = s === SLICES - 1 ? x1 - x0 + edgePad : x1 - x0 + 0.4;
            const sw = x1 - x0;

            ctx.save();
            ctx.transform(ux, uy, 0, 1, ox, oy);

            if (e.bgWhite) {
              // Artwork drawn for a light ground gets a chip, exactly as the
              // marquee gives it one; without it the logo vanishes into the
              // board.
              ctx.fillStyle = `rgba(244,250,255,${0.94 * alpha})`;
              ctx.fillRect(left, mid - logoH * 0.62, right - left, logoH * 1.24);
            }

            // Map into the TRIMMED content box, not the raw file canvas — a
            // partner's export is not guaranteed to be cropped tight (one
            // shipped as a 2048x2048 square with the actual wordmark in a
            // thin band through the middle), and drawing the full canvas
            // stretched the mark down to a sliver while the padding around it
            // filled the rest of the tile.
            const src = e.src ?? { sx: 0, sy: 0, sw: e.img.naturalWidth, sh: e.img.naturalHeight };
            ctx.globalAlpha = alpha;
            ctx.drawImage(
              e.img,
              src.sx + (x0 / lw) * src.sw,
              src.sy,
              (sw / lw) * src.sw,
              src.sh,
              0,
              mid - logoH / 2,
              sw,
              logoH,
            );
            ctx.globalAlpha = 1;
            ctx.restore();
          }
        } else {
          // Fallback name, bent the same way: one sample per character rather
          // than one for the whole string.
          let penD = cursor;
          for (const ch of e.name) {
            const cw = ctx.measureText(ch).width || 1;
            const dPos = penD + cw / 2;
            if (dPos >= -4 && dPos <= total + 4) {
              const { ox, oy, ux, uy, h } = sampleBand(dPos);
              ctx.save();
              ctx.transform(ux, uy, 0, 1, ox, oy);
              ctx.fillStyle = `rgba(214,250,255,${Math.min(1, alpha)})`;
              ctx.fillText(ch, -cw / 2, h * 0.5);
              ctx.restore();
            }
            penD += cw;
          }
        }
      }

      cursor += wEntry;
      idx++;
    }

    ctx.restore();
  }
}
