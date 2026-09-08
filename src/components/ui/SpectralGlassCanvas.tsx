'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Optical glass for the events panel, drawn in one WebGL surface.
 *
 * Two effects share this canvas, and they share it on purpose. Browsers cap
 * live WebGL contexts per page (Chrome drops the oldest somewhere past a
 * dozen), so every glass surface wanting a context has to earn it. These two
 * sit in the same panel under the same key light, so they belong in one pass:
 *
 *  - The encased poster: a rounded glass slab with the poster suspended inside
 *    it, refracting for real. The bevel normal sweeps most of a hemisphere over
 *    a few pixels, so the poster's own content compresses and smears at the rim
 *    while the flat middle stays undistorted. That is what "under glass"
 *    actually looks like, and it is the part a CSS gradient can only imitate.
 *  - The panel rim, replacing the `.cd-spectral-rim` conic gradient. That CSS
 *    carried a flaw documented in its own comment: a conic gradient's angle is
 *    not perimeter distance, so on a wide panel the long edges eat most of the
 *    angular range and the short caps almost none, and the band had to be
 *    smeared across ~290deg to stay legible anywhere. Here it is placed by true
 *    arc length, so it travels at a constant rate and holds its width on every
 *    edge. The compensating smear is gone.
 *
 * Cost is one fullscreen quad and one texture — a couple of draw calls a frame,
 * well under the jelly wall in the same section. The loop is gated on
 * visibility and tab focus, and reduced motion holds a single frame.
 */

/** Glass wall between the slab's outer face and the poster inside it, css px. */
const WALL = 11;
/** Distance over which the flat face rolls off into the rim. */
const BEVEL = 9;
/** Slab half-thickness: how far a refracted ray walks before it lands. */
const DEPTH = 15;
const SLAB_RADIUS = 18;
/** Panel corner radius, matching `rounded-3xl` on the container. */
const PANEL_RADIUS = 24;

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform vec2  uRes;          // canvas size in css px, y-up
uniform float uAA;           // one device pixel, in css px
uniform float uTime;
uniform float uMotion;       // 0 under prefers-reduced-motion

uniform vec2  uPanelHalf;
uniform vec2  uPanelCenter;

uniform vec2  uSlabCenter;
uniform vec2  uSlabHalf;
uniform sampler2D uPoster;
uniform float uPosterReady;
uniform vec3  uTint;         // mean poster colour, for the spill and bounce

uniform vec2  uPointer;
uniform float uPointerActive;

const float PI = 3.14159265;
const float WALL = ${WALL.toFixed(1)};
const float BEVEL = ${BEVEL.toFixed(1)};
const float DEPTH = ${DEPTH.toFixed(1)};
const float SLAB_RADIUS = ${SLAB_RADIUS.toFixed(1)};
const float PANEL_RADIUS = ${PANEL_RADIUS.toFixed(1)};

float sdRoundRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

/**
 * Position along a rounded rect's perimeter, normalised to [0,1) clockwise from
 * top centre. This is the reason the rim moved off CSS: it is arc length rather
 * than angle, so the spectral band travels at a constant rate and keeps its
 * width along the long edges and through the corners alike.
 */
float perimCoord(vec2 p, vec2 b, float r) {
  vec2 c = max(b - r, vec2(0.0));
  float arc = 0.5 * PI * r;
  float lenX = 2.0 * c.x;
  float lenY = 2.0 * c.y;
  float total = 2.0 * lenX + 2.0 * lenY + 4.0 * arc;

  // segment start offsets, clockwise from top centre
  float sTR = c.x;
  float sR  = sTR + arc;
  float sBR = sR + lenY;
  float sB  = sBR + arc;
  float sBL = sB + lenX;
  float sL  = sBL + arc;
  float sTL = sL + lenY;

  float s;
  bool inX = abs(p.x) <= c.x;
  bool inY = abs(p.y) <= c.y;

  if (inX && p.y > 0.0) {
    // top edge: the right half runs up from 0, the left half wraps back to total
    s = p.x >= 0.0 ? p.x : total + p.x;
  } else if (inX) {
    s = sB + (c.x - p.x);
  } else if (inY && p.x > 0.0) {
    s = sR + (c.y - p.y);
  } else if (inY) {
    s = sL + (p.y + c.y);
  } else {
    vec2 dc = p - vec2(sign(p.x) * c.x, sign(p.y) * c.y);
    float a = atan(dc.y, dc.x);
    if (p.x > 0.0 && p.y > 0.0)  s = sTR + (0.5 * PI - a) * r;
    else if (p.x > 0.0)          s = sBR + (-a) * r;
    else if (p.y < 0.0)          s = sBL + (-a - 0.5 * PI) * r;
    else                         s = sTL + (PI - a) * r;
  }
  return s / total;
}

/**
 * The dispersion signature the rest of the site already speaks: a white-hot
 * core, a cool fringe leading it, a warm one trailing, falling away to a
 * genuinely dark opposite arc. Built from lobes rather than gradient stops so
 * it stays smooth wherever it is sampled.
 */
vec4 rimSpectrum(float t) {
  float core  = exp(-pow((t - 0.394) / 0.030, 2.0));
  float cool  = exp(-pow((t - 0.300) / 0.075, 2.0));
  float warm  = exp(-pow((t - 0.470) / 0.080, 2.0));
  float deepC = exp(-pow((t - 0.200) / 0.090, 2.0));
  float deepW = exp(-pow((t - 0.590) / 0.110, 2.0));

  vec3 col = vec3(1.0)             * core  * 0.95
           + vec3(0.22, 0.87, 1.0) * cool  * 0.42
           + vec3(1.0, 0.72, 0.35) * warm  * 0.42
           + vec3(0.27, 0.47, 1.0) * deepC * 0.20
           + vec3(1.0, 0.30, 0.34) * deepW * 0.18;

  float a = core * 0.95 + cool * 0.34 + warm * 0.34 + deepC * 0.16 + deepW * 0.14;
  return vec4(col, clamp(a, 0.0, 1.0));
}

vec2 rot(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

void main() {
  vec2 p = vUv * uRes;

  // ── Levitation ─────────────────────────────────────────────────────────
  // Two incommensurate periods, so the cycle never resolves into a loop the
  // eye can catch, plus a hair of rotation so it reads as an object hanging in
  // air rather than a layer sliding on a rail. The key light below is fixed in
  // screen space, so the specular slides across the bevel as the slab rises;
  // that coupling is what actually sells the float.
  float bob  = (sin(uTime * 6.2831853 / 7.0) * 5.0
              + sin(uTime * 6.2831853 / 11.3) * 1.5) * uMotion;
  float tilt = sin(uTime * 6.2831853 / 9.1) * 0.0061 * uMotion;
  float lift = bob / 6.5;

  // ── Encased poster slab ────────────────────────────────────────────────
  vec2 q = rot(p - uSlabCenter - vec2(0.0, bob), tilt);
  float d = sdRoundRect(q, uSlabHalf, SLAB_RADIUS);
  float slabA = 1.0 - smoothstep(-uAA, uAA, d);

  vec3 glass = vec3(0.0);
  if (slabA > 0.0 && uPosterReady > 0.5) {
    // Quarter-circle roll-off from the flat face down to the rim: h is 1 across
    // the face and 0 at the very edge, so the wall stands vertical where it
    // meets the boundary, the way a moulded block does.
    float t = clamp(-d / BEVEL, 0.0, 1.0);
    float h = max(sqrt(max(1.0 - (1.0 - t) * (1.0 - t), 0.0)), 0.02);

    // Outward SDF gradient by central difference. It goes degenerate across the
    // flat interior, where the surface is level and the normal is straight up.
    float e = 0.75;
    vec2 gr = vec2(
      sdRoundRect(q + vec2(e, 0.0), uSlabHalf, SLAB_RADIUS)
        - sdRoundRect(q - vec2(e, 0.0), uSlabHalf, SLAB_RADIUS),
      sdRoundRect(q + vec2(0.0, e), uSlabHalf, SLAB_RADIUS)
        - sdRoundRect(q - vec2(0.0, e), uSlabHalf, SLAB_RADIUS)
    );
    float grl = length(gr);
    vec2 g = grl > 1e-5 ? gr / grl : vec2(0.0);

    float slope = (DEPTH / BEVEL) * ((1.0 - t) / h);
    vec3 N = normalize(vec3(g * slope, 1.0));

    // A little perspective. Orthographic reads flat, and makes both bevels
    // mirror each other exactly, which no real slab does.
    vec3 V = normalize(vec3(q * 0.0012, -1.0));

    vec2 posterHalf = uSlabHalf - vec2(WALL);

    // One index of refraction per channel. The coloured fringe at the bevel is
    // then dispersion of the poster's own palette rather than a rainbow pasted
    // over the edge, which is why it lands muted instead of neon, and why it
    // differs from poster to poster.
    // Spread wider than real crown glass. At true dispersion the channels
    // separate by a fraction of a pixel across a nine-pixel bevel and the
    // fringe is invisible; this is the spread that makes it legible at the
    // size the card actually renders.
    vec3 ior = vec3(1.40, 1.46, 1.53);
    float missAmt = 0.0;
    vec3 lit = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      vec3 R = refract(V, N, 1.0 / ior[i]);
      vec2 off = R.xy * ((DEPTH * h) / max(-R.z, 0.25));
      vec2 puv = ((q + off) / posterHalf) * 0.5 + 0.5;
      vec2 cl = clamp(puv, 0.0, 1.0);
      missAmt = max(missAmt, length((puv - cl) * posterHalf));
      vec4 texel = texture2D(uPoster, cl);
      lit[i] = texel[i];
    }
    glass = lit;

    // A ray that walked off the poster is looking at the inside of the wall.
    glass *= mix(1.0, 0.42, smoothstep(0.0, 7.0, missAmt));
    // The wall carries less light than the face it surrounds — but only a
    // little. Taking it much darker turns the bevel into a border, which is
    // the exact thing the slab exists not to be.
    glass *= mix(0.72, 1.0, t);

    // Separation channel where the wall meets the encased poster. Small, dark,
    // and the strongest single cue that the poster is *inside* the block rather
    // than sitting behind a border.
    glass *= 1.0 - 0.42 * exp(-pow((-d - WALL) / 2.2, 2.0));

    // Key light at 10-11 o'clock, the convention the CSS crystal surfaces
    // already use, leaning toward the pointer when there is one.
    vec2 lean = uPointerActive
      * clamp((uPointer - uSlabCenter) / max(uSlabHalf.x, 1.0), -1.0, 1.0) * 0.22;
    vec3 L = normalize(vec3(-0.52 + lean.x, 0.70 + lean.y, 0.49));
    vec3 Hv = normalize(L - V);

    // Two lobes, and the exponents are set by the bevel's pixel budget rather
    // than by physics. The normal sweeps most of a hemisphere across nine
    // pixels, so a mirror-tight exponent puts the whole highlight inside a
    // sub-pixel band that point sampling steps straight over — it computes
    // correctly and renders as nothing. 64 lands the hairline at two or three
    // pixels, which is the narrowest that survives sampling and still reads.
    // The broad lobe underneath keeps the rest of the bevel lit, so the wall
    // looks like glass rather than an unlit gap around the poster.
    float spec = pow(max(dot(N, Hv), 0.0), 64.0);
    float sheen = pow(max(dot(N, Hv), 0.0), 7.0);
    float bounceSpec = pow(max(dot(N, normalize(vec3(0.42, -0.62, 0.66))), 0.0), 40.0);
    float fres = pow(1.0 - clamp(N.z, 0.0, 1.0), 3.0);

    // Key stays white, and the Fresnel rim stays cool because glass edge light
    // genuinely is. The upward bounce is warmed to brass (--color-brand-400,
    // #d8a657): it is light returning off the environment, and this product's
    // environment is warm now.
    glass += vec3(1.0) * spec * 1.15
           + vec3(0.92, 0.96, 1.0) * sheen * 0.16
           + vec3(0.847, 0.651, 0.341) * bounceSpec * 0.34
           + vec3(0.72, 0.86, 1.0) * fres * 0.42;

    // Broad face sheen, deliberately faint and weighted off the middle. This
    // poster carries a QR code and a URL; washing them out to sell a reflection
    // would break the thing the card exists to do.
    float sweep = dot(normalize(vec2(-0.6, 0.8)), q) / max(uSlabHalf.y, 1.0);
    glass += vec3(0.85, 0.92, 1.0) * exp(-pow((sweep - 0.35) / 0.55, 2.0)) * 0.045;
  }

  // ── Spill and bounce ───────────────────────────────────────────────────
  // Over a near-black card a cast shadow is invisible, so the levitation cue is
  // carried by light instead: the poster's own colour pooling beneath the slab,
  // spreading and thinning as it rises, tightening as it settles.
  float spread = 1.0 + lift * 0.42;
  vec2 bq = (p - vec2(uSlabCenter.x, uSlabCenter.y - uSlabHalf.y - 10.0))
          / vec2(uSlabHalf.x * 0.95 * spread, 20.0 * spread);
  float bounce = exp(-dot(bq, bq)) * 0.30 / spread;
  float spill = exp(-max(d, 0.0) / 17.0) * 0.26;
  float outer = clamp(bounce + spill, 0.0, 1.0);

  vec3 acc = uTint * outer;
  float accA = outer;

  acc = glass * slabA + acc * (1.0 - slabA);
  accA = slabA + accA * (1.0 - slabA);

  // ── Panel rim ──────────────────────────────────────────────────────────
  vec2 rp = p - uPanelCenter;
  float dr = sdRoundRect(rp, uPanelHalf, PANEL_RADIUS);
  vec4 sp = rimSpectrum(
    fract(perimCoord(rp, uPanelHalf, PANEL_RADIUS) - uTime / 16.0 * uMotion)
  );

  // The ring sits just inside the edge; the panel clips anything past it anyway.
  float ring = 1.0 - smoothstep(0.0, 1.25 + uAA, abs(dr + 1.0));
  float bloom = exp(-abs(dr + 1.0) / 7.0) * 0.5;
  float rimA = clamp(sp.a * (ring * 0.85 + bloom), 0.0, 1.0);

  acc = sp.rgb * rimA + acc * (1.0 - rimA);
  accA = rimA + accA * (1.0 - rimA);

  gl_FragColor = vec4(acc, clamp(accA, 0.0, 1.0));
}
`;

export interface SpectralGlassCanvasProps {
  /** The `.cd-crystal` panel this surface covers. Supplies the rim geometry. */
  panelRef: React.RefObject<HTMLElement | null>;
  /** The poster. Supplies the slab geometry and the encased texture. */
  slabRef: React.RefObject<HTMLImageElement | null>;
  /**
   * Current poster URL. Not used to fetch anything — the `<img>` owns that —
   * but the panel outlives the event data, so this is what tells the surface
   * that a poster has arrived, or been swapped for a different event's.
   */
  posterSrc?: string | null;
  /** Fires once the slab is really drawing, so the DOM fallbacks can stand down. */
  onReady?: (ready: boolean) => void;
}

export function SpectralGlassCanvas({
  panelRef,
  slabRef,
  posterSrc,
  onReady,
}: SpectralGlassCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const readyCb = useRef(onReady);
  readyCb.current = onReady;
  // Set up by the main effect, called by the poster effect below. The GL
  // context is expensive and the poster is not, so a new event swaps the
  // texture rather than tearing the whole surface down and rebuilding it.
  const syncPosterRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const panel = panelRef.current;
    if (!canvas || !panel) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    } catch (e) {
      // No context. The CSS rim and the plain <img> stay exactly as they are.
      console.error('SpectralGlassCanvas: WebGL unavailable', e);
      return;
    }

    // Ambient scenery rather than the focal interactive canvas in this section,
    // so it takes the lower of the two pixel-ratio caps already in use here.
    // The effect is soft gradients plus one hairline, and the hairline is
    // antialiased analytically, so it does not need the headroom.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    const uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uAA: { value: 1 / dpr },
      uTime: { value: 0 },
      uMotion: { value: 1 },
      uPanelHalf: { value: new THREE.Vector2(1, 1) },
      uPanelCenter: { value: new THREE.Vector2(0, 0) },
      // Parked off-canvas until the poster is measured, so no slab flashes at
      // the origin on the first frame.
      uSlabCenter: { value: new THREE.Vector2(-9999, -9999) },
      uSlabHalf: { value: new THREE.Vector2(1, 1) },
      uPoster: { value: null as THREE.Texture | null },
      uPosterReady: { value: 0 },
      uTint: { value: new THREE.Color(0.5, 0.55, 0.7) },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uPointerActive: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(geometry, material));

    // ── Geometry, measured from the DOM ──────────────────────────────────
    // The slab is built around the poster's own box, so it inherits whatever
    // proportions that poster has. Imposing a ratio here would reintroduce the
    // crop the old aspect-video frame forced onto square posters.
    let width = 0;
    let height = 0;

    const measure = () => {
      const panelRect = panel.getBoundingClientRect();
      width = panelRect.width;
      height = panelRect.height;
      if (width < 2 || height < 2) return;

      renderer.setSize(width, height, false);
      uniforms.uRes.value.set(width, height);
      uniforms.uPanelHalf.value.set(width / 2, height / 2);
      uniforms.uPanelCenter.value.set(width / 2, height / 2);

      const img = slabRef.current;
      if (!img) return;
      const r = img.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;

      // Shader space is y-up from the bottom-left; DOM rects are y-down.
      uniforms.uSlabCenter.value.set(
        r.left - panelRect.left + r.width / 2,
        height - (r.top - panelRect.top + r.height / 2)
      );
      // The outer face stands a wall's thickness proud of the poster, so the
      // poster keeps exactly the size it already renders at in the DOM.
      uniforms.uSlabHalf.value.set(r.width / 2 + WALL, r.height / 2 + WALL);
    };

    // ── Poster texture ───────────────────────────────────────────────────
    let texture: THREE.Texture | null = null;

    /** Mean poster colour, for the spill and the bounce pooled beneath it. */
    const sampleTint = (img: HTMLImageElement) => {
      try {
        const c = document.createElement('canvas');
        c.width = 1;
        c.height = 1;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        // Lifted toward the light so the spill reads as glow rather than as a
        // grey wash sitting on the card.
        uniforms.uTint.value.setRGB(
          Math.min(1, (r / 255) * 1.25),
          Math.min(1, (g / 255) * 1.25),
          Math.min(1, (b / 255) * 1.25)
        );
      } catch {
        // Tainted canvas. The default tint is a reasonable stand-in.
      }
    };

    /** URL currently uploaded to the GPU, so an unchanged poster is not re-read. */
    let adoptedSrc: string | null = null;
    let listeningImg: HTMLImageElement | null = null;
    let observedImg: HTMLImageElement | null = null;

    const onPosterLoad = () => syncPoster();

    /**
     * Bring the surface in line with whatever poster the DOM is currently
     * showing. Safe to call at any time: the poster is lazy and arrives after
     * a network round trip, the event data can be replaced by a later fetch,
     * and the panel is mounted before either has happened.
     */
    function syncPoster() {
      const img = slabRef.current;

      if (listeningImg && listeningImg !== img) {
        listeningImg.removeEventListener('load', onPosterLoad);
        listeningImg = null;
      }

      if (!img) {
        if (texture) {
          texture.dispose();
          texture = null;
        }
        adoptedSrc = null;
        uniforms.uPoster.value = null;
        uniforms.uPosterReady.value = 0;
        readyCb.current?.(false);
        return;
      }

      if (observedImg !== img) {
        if (observedImg) resizeObserver.unobserve(observedImg);
        // The poster is lazy and below the fold, so its box is zero-height
        // until it lands. Observing the image is what re-measures the slab.
        resizeObserver.observe(img);
        observedImg = img;
      }

      if (!img.complete || img.naturalWidth === 0) {
        if (listeningImg !== img) {
          img.addEventListener('load', onPosterLoad);
          listeningImg = img;
        }
        return;
      }

      if (texture && adoptedSrc === img.currentSrc) {
        measure();
        renderFrame();
        return;
      }

      try {
        texture?.dispose();
        texture = new THREE.Texture(img);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.needsUpdate = true;
        adoptedSrc = img.currentSrc;
        uniforms.uPoster.value = texture;
        uniforms.uPosterReady.value = 1;
        sampleTint(img);
        measure();
        renderFrame();
        readyCb.current?.(true);
      } catch (e) {
        // Leaves the plain <img> and the CSS rim in place.
        console.error('SpectralGlassCanvas: poster texture upload failed', e);
      }
    }

    // ── Loop, gated ──────────────────────────────────────────────────────
    const clock = new THREE.Clock();
    let raf = 0;
    let looping = false;
    let isVisible = false;
    let isTabActive = !document.hidden;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduceMotion = media.matches;
    uniforms.uMotion.value = reduceMotion ? 0 : 1;

    function renderFrame() {
      if (width < 2 || height < 2) return;
      if (!reduceMotion) uniforms.uTime.value = clock.getElapsedTime();
      renderer.render(scene, camera);
    }

    const loop = () => {
      raf = requestAnimationFrame(loop);
      renderFrame();
    };

    const startLoop = () => {
      // Under reduced motion nothing moves, so the held frame is the whole
      // effect and a running loop would burn a GPU for no visible change.
      if (looping || reduceMotion) return;
      looping = true;
      clock.getDelta(); // discard the idle gap so the first frame is not a jump
      raf = requestAnimationFrame(loop);
    };

    const stopLoop = () => {
      if (!looping) return;
      looping = false;
      cancelAnimationFrame(raf);
    };

    const syncLoop = () => {
      if (isVisible && isTabActive) startLoop();
      else stopLoop();
    };

    const handleMotionPref = (e: MediaQueryListEvent) => {
      reduceMotion = e.matches;
      uniforms.uMotion.value = reduceMotion ? 0 : 1;
      if (reduceMotion) {
        stopLoop();
        uniforms.uTime.value = 0;
        renderFrame();
      } else {
        syncLoop();
      }
    };
    media.addEventListener('change', handleMotionPref);

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        isVisible = entries[0].isIntersecting;
        // A held frame still has to be drawn once, when it first scrolls in.
        if (isVisible && reduceMotion) renderFrame();
        syncLoop();
      },
      { threshold: 0.02 }
    );
    intersectionObserver.observe(panel);

    const handleVisibility = () => {
      isTabActive = !document.hidden;
      syncLoop();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const handlePointer = (e: PointerEvent) => {
      const rect = panel.getBoundingClientRect();
      uniforms.uPointer.value.set(
        e.clientX - rect.left,
        rect.height - (e.clientY - rect.top)
      );
      uniforms.uPointerActive.value = 1;
    };
    const handlePointerLeave = () => {
      uniforms.uPointerActive.value = 0;
    };
    panel.addEventListener('pointermove', handlePointer, { passive: true });
    panel.addEventListener('pointerleave', handlePointerLeave);

    const resizeObserver = new ResizeObserver(() => {
      measure();
      // A resize while the loop is parked would otherwise leave the previous
      // frame stretched across the new canvas size.
      if (!looping) renderFrame();
    });
    resizeObserver.observe(panel);

    // syncPoster reaches for resizeObserver, so it cannot run before this point.
    syncPosterRef.current = syncPoster;
    syncPoster();

    measure();
    renderFrame();

    return () => {
      stopLoop();
      syncPosterRef.current = null;
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
      media.removeEventListener('change', handleMotionPref);
      panel.removeEventListener('pointermove', handlePointer);
      panel.removeEventListener('pointerleave', handlePointerLeave);
      listeningImg?.removeEventListener('load', onPosterLoad);
      readyCb.current?.(false);
      texture?.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [panelRef, slabRef]);

  // The poster arrives on its own schedule, well after the panel mounts, and
  // can change when a later Luma fetch lands a different event.
  useEffect(() => {
    syncPosterRef.current?.();
  }, [posterSrc]);

  // z-0 puts the canvas at the depth the `.cd-spectral-rim` divs occupied,
  // below the panel content. The slab still reads from there because the poster
  // it replaces is faded to transparent rather than merely covered over.
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
    />
  );
}
