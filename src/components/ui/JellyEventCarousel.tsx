'use client';

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { X } from 'lucide-react';
import { EventImageItem } from '@/app/api/event-images/route';
import { JellyWaveField } from './jellyWaveField';

interface JellyEventCarouselProps {
  images: EventImageItem[];
  selectedEvent?: string;
  className?: string;
}

// Texture canvas size. The card mesh aspect is derived from this ratio so the
// baked headline type and the photo can never end up horizontally stretched.
const TEXTURE_WIDTH = 640;
const TEXTURE_HEIGHT = 440;

const CAM_FOV = 40;
// Framed so the two rows sit snug in view with a little breathing room:
// visibleHeight = 2 * CAM_Z * tan(CAM_FOV/2) ~= 3.53 world units.
const CAM_Z = 4.85;

// GPGPU-inspired Cloth & Jelly Physics Vertex Shader
// GPGPU-inspired Cloth & Jelly Physics Vertex Shader (idle is calm; contorts and bends elastically on drag)
const vertexShader = `
uniform float uTime;
uniform vec2 uEdgeLag;       // 2nd-order harmonic inertial edge lag (in opposite direction of movement)
uniform vec2 uVelocity;      // Carousel velocity
uniform vec2 uPointer;       // Pointer UV
uniform float uPointerActive;
uniform vec2 uTilePos;

// Surface waves are read from the shared GPU wave field rather than evaluated
// analytically. uCellOrigin/uCellSize map this tile's 0..1 space onto its own
// cell of the atlas; uWaveTexel is one texel of that atlas.
uniform sampler2D uWaveTex;
uniform vec2 uCellOrigin;
uniform vec2 uCellSize;
uniform vec2 uWaveTexel;
uniform float uWaveAmp;

// Sample the field, clamped inside this tile's cell so the gradient taken at
// the rim never reaches into the neighbouring tile's water.
float waveAt(vec2 target) {
  vec2 lo = uCellOrigin + 0.5 * uWaveTexel;
  vec2 hi = uCellOrigin + uCellSize - 0.5 * uWaveTexel;
  return texture2D(uWaveTex, clamp(target, lo, hi)).r;
}

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying float vDisplacement;

void main() {
  vUv = uv;
  vec3 pos = position;
  vec2 p = uv - 0.5; // [-0.5, 0.5]

  // Distance from center of card
  float distFromCenter = length(p);
  float normDist = clamp(distFromCenter / 0.7071, 0.0, 1.0); // 0 at center, 1 at corner

  // In-plane edge and corner lag weights
  float cornerWeight = pow(normDist, 1.5);
  float edgeX = pow(abs(p.x) * 2.0, 1.4);
  float edgeY = pow(abs(p.y) * 2.0, 1.4);

  // 1. Elastic In-Plane Shear Contortion:
  // When carousel moves right, uEdgeLag.x is negative (edges lag behind to the left).
  // The corners, trailing edge, and top/bottom edges lag behind the center:
  float shearX = uEdgeLag.x * (0.26 * edgeY + 0.18 * cornerWeight + 0.08 * edgeX);
  float shearY = uEdgeLag.y * (0.26 * edgeX + 0.18 * cornerWeight + 0.08 * edgeY);

  // Parallelogram skew along movement axis.
  // Kept deliberately small: the reference wall never lets a tile lean into a
  // parallelogram, so this reads as elastic give rather than a shape change.
  shearX += uEdgeLag.x * p.y * 0.14;
  shearY += uEdgeLag.y * p.x * 0.14;

  pos.x += shearX;
  pos.y += shearY;

  // 2. 3D Bowing & Parachute Dome in Z:
  // Center bows out forward towards camera, outer edges cup backwards
  float lagMag = length(uEdgeLag);
  float dome = lagMag * 0.34 * (1.0 - 4.0 * dot(p, p));

  // Dynamic directional tilt in Z: trailing edge pushes back, leading edge angles forward
  float tiltZ = (uEdgeLag.x * p.x + uEdgeLag.y * p.y) * 0.46;

  // 3. Surface waves, read from the simulated field.
  // Previously this was an analytic decaying sine keyed off a timestamp, which
  // produced a wave-shaped thing that never travelled, never reflected and could
  // not interfere with a second strike. The height now comes from an integrated
  // wave equation, so all three fall out of the physics.
  vec2 wuv = uCellOrigin + uv * uCellSize;
  float waveH = waveAt(wuv) * uWaveAmp;

  pos.z += dome + tiltZ + waveH;
  vDisplacement = pos.z;

  // 4. Dynamic Normal Calculation from Surface Gradient:
  // When at rest (uEdgeLag = 0 and the field is flat) this is exactly (0, 0, 1).
  // When deformed, the normal tilts to match, producing reactive glass highlights.
  float dDome_dx = lagMag * 0.34 * (-8.0 * p.x);
  float dTilt_dx = uEdgeLag.x * 0.46;
  float dzdx = dDome_dx + dTilt_dx + uEdgeLag.x * 0.18;

  float dDome_dy = lagMag * 0.34 * (-8.0 * p.y);
  float dTilt_dy = uEdgeLag.y * 0.46;
  float dzdy = dDome_dy + dTilt_dy + uEdgeLag.y * 0.18;

  // Central difference on the wave field. Converting the atlas-space step back
  // into this tile's local uv is what keeps the slope correct regardless of how
  // many cells the atlas is divided into.
  float wL = waveAt(wuv - vec2(uWaveTexel.x, 0.0));
  float wR = waveAt(wuv + vec2(uWaveTexel.x, 0.0));
  float wD = waveAt(wuv - vec2(0.0, uWaveTexel.y));
  float wU = waveAt(wuv + vec2(0.0, uWaveTexel.y));
  dzdx += (wR - wL) * uCellSize.x / (2.0 * uWaveTexel.x) * uWaveAmp;
  dzdy += (wU - wD) * uCellSize.y / (2.0 * uWaveTexel.y) * uWaveAmp;

  vec3 surfaceNormal = normalize(vec3(-dzdx, -dzdy, 1.0));
  vNormal = normalMatrix * surfaceNormal;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

// Jelly-Glass Fragment Shader.
//
// The tile is treated as a convex lens sitting on top of the photo, not as a flat
// pane with highlights painted over it. That distinction is the whole difference
// between this and a glossy sticker: a real cast tile bows between its corners,
// compresses the image toward its rim, and reflects the room rather than glowing.
const fragmentShader = `
uniform sampler2D uTexture;
uniform float uActive;
uniform float uFade;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying float vDisplacement;

// Superellipse exponent. A straight-edged rounded rectangle reads as a sticker;
// the reference silhouettes bow outward between their corners like a pressed
// cushion, which is what this exponent buys.
// Higher exponent = squarer corners with the edges still bowed. At 4.2 the
// corners were round enough to eat the baked meta bar, and the tighter crop
// clipped the first letter of the headline outright.
const float SQ_N = 6.0;
// Crop as little of the texture as the silhouette allows, so the type runs all
// the way into the lens lip and gets bent by it rather than sliced off by it.
const vec2 HALF_SIZE = vec2(0.492, 0.492);

// How far in from the rim the dome falls away to the flat plateau. Kept narrow:
// the reference tiles are mostly flat with a thin lens lip, not fisheye bubbles,
// and a wide skirt swallows the plateau and distorts the whole photo.
const float DOME_W = 0.085;

// Superellipse field and its outward gradient. The value is 0 on the silhouette
// and -1 at the centre. It is a smooth field rather than a true distance, so the
// thresholds below are tuned against that range, not against pixels.
float squircle(vec2 p, out vec2 grad) {
  vec2 q = max(abs(p) / HALF_SIZE, vec2(1e-4));
  float xn = pow(q.x, SQ_N);
  float yn = pow(q.y, SQ_N);
  float s = xn + yn;
  float k = pow(s, 1.0 / SQ_N - 1.0);
  vec2 g = vec2(
    k * pow(q.x, SQ_N - 1.0) / HALF_SIZE.x,
    k * pow(q.y, SQ_N - 1.0) / HALF_SIZE.y
  ) * sign(p + vec2(1e-6));
  grad = normalize(g + vec2(1e-6));
  return pow(s, 1.0 / SQ_N) - 1.0;
}

// Procedural studio environment sampled by the reflection vector. A real glass
// tile mirrors the room it sits in; fixed specular lights cannot, and they stay
// pinned in place while the tile bends. Analytic rather than an HDR texture, so
// it costs no fetch and ships no asset.
vec3 sampleEnv(vec3 R) {
  float h = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);

  // The floor is deliberately lifted rather than near-black. A dark ground makes
  // the outward-facing part of the lip mirror shadow, which turns every tile into
  // a dark porthole instead of a bright-edged piece of glass.
  vec3 ground  = vec3(0.120, 0.140, 0.180);
  vec3 horizon = vec3(0.260, 0.290, 0.350);
  vec3 sky     = vec3(0.520, 0.575, 0.680);

  vec3 col = mix(ground, horizon, smoothstep(0.0, 0.5, h));
  col = mix(col, sky, smoothstep(0.5, 1.0, h));

  // Overhead softbox: the long window streak that reads instantly as glass.
  // Tight, so it stays a streak rather than spreading into haze.
  float box = smoothstep(0.84, 0.995, h) * smoothstep(0.42, 0.03, abs(R.x));
  col += vec3(1.0) * box * 0.42;

  return col;
}

void main() {
  vec2 p = vUv - 0.5;
  vec2 eg;
  float f = squircle(p, eg);

  float alpha = 1.0 - smoothstep(-0.010, 0.010, f);
  if (alpha <= 0.01) discard;

  // --- DOME -----------------------------------------------------------------
  // t is 0 at the rim and 1 on the flat plateau; slope is the dome's steepness,
  // steep at the skirt and zero across the middle.
  float t = clamp(-f / DOME_W, 0.0, 1.0);
  float slope = pow(1.0 - t, 1.7);

  vec3 Nv = normalize(vNormal);
  vec3 V = normalize(vViewPosition);

  // Tilting the normal outward along the skirt is what turns a flat pane into a
  // lens. It also means the glass still catches light at rest: the previous pass
  // needed a faked UV-space gloss precisely because a flat resting normal made
  // every specular term collapse to nothing.
  vec3 N = normalize(Nv + vec3(eg * slope * 0.85, 0.0));

  // --- REFRACTION -----------------------------------------------------------
  // The view bends through the dome, compressing the photo toward the rim the way
  // the reference does. The plateau stays undistorted, so the image reads sharp.
  float bend = slope * 0.013;
  vec2 refractUV = vUv - eg * bend;

  // Dispersion rides that same bend, so colour separation exists only where the
  // glass is actually thick and never smears across the face. Deliberately faint:
  // anything stronger fringes the baked headline type into rainbows.
  vec2 disp = eg * bend * 0.030;
  vec3 texColor = vec3(
    texture2D(uTexture, refractUV + disp).r,
    texture2D(uTexture, refractUV).g,
    texture2D(uTexture, refractUV - disp).b
  );

  // Fade up from the placeholder tint once the photo texture has landed
  texColor = mix(vec3(0.055, 0.075, 0.11), texColor, uFade);

  // --- REFLECTION -----------------------------------------------------------
  // Energy conserving: reflection REPLACES transmitted light rather than adding
  // to it. Stacking additive gloss on top of the photo is what made the earlier
  // version look like milky plastic instead of glass.
  float NdotV = max(dot(N, V), 0.0);
  float fres = pow(1.0 - NdotV, 3.2);
  vec3 envCol = sampleEnv(reflect(-V, N));
  float reflectance = clamp(0.026 + fres * 0.38 + slope * 0.20, 0.0, 0.52);
  vec3 col = mix(texColor, envCol, reflectance);

  // --- SPECULAR -------------------------------------------------------------
  // Tight and bright. A small hard highlight reads as polished glass; a broad
  // soft one reads as plastic.
  vec3 L = normalize(vec3(-0.42, 0.86, 0.72));
  float NdotH = max(dot(N, normalize(L + V)), 0.0);
  float spec = pow(NdotH, 90.0) * 0.90;
  float lip  = pow(NdotH, 26.0) * slope * 0.095;

  // Thin bright lip hugging the very edge, all the way around. The reference
  // tiles are outlined in light regardless of which way that edge faces, which a
  // purely reflective rim cannot guarantee.
  float rimLip = smoothstep(0.82, 1.0, slope) * 0.085;

  col += vec3(spec + lip + rimLip);

  // --- CONTACT SHADE --------------------------------------------------------
  // The side of the dome facing away from the key darkens slightly. Enough to
  // seat the tile, not enough to reintroduce the dark-porthole look.
  float facing = dot(eg, normalize(vec2(-0.62, 0.78)));
  col *= 1.0 - slope * max(-facing, 0.0) * 0.16;

  gl_FragColor = vec4(col, alpha);
}
`;

interface GridTileItem {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  imageItem: EventImageItem;
  col: number;
  row: number;
  hasTexture: boolean;
  fade: number;
}

export function JellyEventCarousel({
  images,
  selectedEvent = 'ALL',
  className = ''
}: JellyEventCarouselProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [lightboxImage, setLightboxImage] = useState<EventImageItem | null>(null);

  // Carousel physics & grid state
  const stateRef = useRef({
    progressX: 0,
    progressY: 0,
    targetProgressX: 0,
    targetProgressY: 0,
    velocityX: 0,
    velocityY: 0,
    edgeLag: new THREE.Vector2(0, 0),
    edgeLagVelocity: new THREE.Vector2(0, 0),
    wobblePhase: 0,
    wobbleAmp: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    dragAnchorX: 0,
    dragAnchorY: 0,
    dragStartProgressX: 0,
    dragStartProgressY: 0,
    dragDistance: 0,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    pointer: new THREE.Vector2(0.5, 0.5),
    pointerActive: 0,
    tiles: [] as GridTileItem[],
    cardWidth: 2.35,
    cardHeight: 1.55,
    gapX: 0.28,
    gapY: 0.32,
    cols: 7,
    rows: 5,
    spanX: 0,
    spanY: 0,
    animationFrameId: 0,
    isVisible: true,
    isTabActive: true,
  });

  // Filter and deduplicate images strictly by unique URL
  const filteredImages = useMemo(() => {
    if (!images || images.length === 0) return [];
    const list = selectedEvent === 'ALL'
      ? images
      : images.filter(img => img.eventName.toLowerCase() === selectedEvent.toLowerCase());

    const seenUrls = new Set<string>();
    return list.filter(img => {
      if (seenUrls.has(img.url)) return false;
      seenUrls.add(img.url);
      return true;
    });
  }, [images, selectedEvent]);

  // Helper to create texture with event label and photo
  const createTexture = useCallback((imgElement: HTMLImageElement, eventName: string, subfolder?: string) => {
    const width = TEXTURE_WIDTH;
    const height = TEXTURE_HEIGHT;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    // Aspect ratio cover
    const imgAspect = imgElement.width / imgElement.height;
    const canvasAspect = width / height;
    let sWidth = imgElement.width;
    let sHeight = imgElement.height;
    let sx = 0;
    let sy = 0;

    if (imgAspect > canvasAspect) {
      sWidth = imgElement.height * canvasAspect;
      sx = (imgElement.width - sWidth) / 2;
    } else {
      sHeight = imgElement.width / canvasAspect;
      sy = (imgElement.height - sHeight) / 2;
    }

    ctx.drawImage(imgElement, sx, sy, sWidth, sHeight, 0, 0, width, height);

    // Top vignette for metadata legibility
    const topGrad = ctx.createLinearGradient(0, 0, 0, height * 0.32);
    topGrad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    topGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, width, height);

    // Dark bottom gradient overlay for typography readability
    const grad = ctx.createLinearGradient(0, height * 0.38, 0, height);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(0.48, 'rgba(0, 0, 0, 0.45)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.84)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Type is inset far enough to clear the lens lip and the squircle corners, but
    // no further. Sitting just inside the rim is what sells the tile as a thick
    // rounded blob: the glass bends the ends of these lines instead of cutting them.
    const TYPE_INSET = 54;

    // 1. Top Metadata Bar (Reference video style)
    ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText('CYBRDECK ARCHIVE', TYPE_INSET, 42);

    ctx.textAlign = 'right';
    ctx.fillText('SINGAPORE • 2026', width - TYPE_INSET, 42);
    ctx.textAlign = 'left';

    // 2. Faint Hairline Mid-Divider (Reference video style)
    ctx.beginPath();
    ctx.moveTo(TYPE_INSET, height * 0.45);
    ctx.lineTo(width - TYPE_INSET, height * 0.45);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 3. Bold Event Title (e.g. "Monthly Shuffle")
    ctx.font = 'bold 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillText(eventName, TYPE_INSET, height - 58);

    // 4. Subtitle (e.g. "Edition #1 • 02 Sept 2026")
    ctx.font = '500 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.shadowBlur = 5;
    let sub = 'Singapore Gathering';
    if (subfolder) {
      if (subfolder.includes('02Sept')) {
        sub = 'Edition #1 • 02 Sept 2026';
      } else {
        sub = subfolder.replace(/^#/, 'Edition ');
      }
    } else if (eventName.toLowerCase().includes('bartha')) {
      sub = 'Interactive AI Seminar • Singapore';
    } else if (eventName.toLowerCase().includes('hackathon')) {
      sub = 'Builder Competition • Singapore';
    }
    ctx.fillText(sub, TYPE_INSET, height - 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);

  // Main Three.js Setup & Simulation Loop
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || filteredImages.length === 0) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
      });
    } catch (e) {
      console.error('WebGL context initialization failed:', e);
      return;
    }

    // Focal interactive canvas (pointer-tracking, and the thing the visitor is
    // actually looking at), so it takes the 2.0 cap rather than the 1.75 one that
    // belongs to ambient section scenery.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.1, 100);
    camera.position.z = CAM_Z;

    // Strict 2-row layout. Column count is driven by how much wall the camera can
    // actually see, NOT by the photo count, and the photo set then cycles across the
    // slots. Deriving columns from the photo count is what used to leave a permanent
    // hole in row 1 on odd counts, and left the single-event filters (3 photos each)
    // showing two tiles against mostly empty background. The reference wall repeats
    // its own cards across the grid in exactly this way.
    const rows = 2;
    const totalImages = filteredImages.length;

    const cardWidth = 2.30;
    const cardHeight = cardWidth * (TEXTURE_HEIGHT / TEXTURE_WIDTH);

    // A real gutter on both axes, so every tile reads as a discrete raised piece of
    // glass rather than one continuous cloth sheet.
    const gapX = 0.13;
    const gapY = 0.13;

    const stepX = cardWidth + gapX;
    const stepY = cardHeight + gapY;

    const visibleHeight = 2 * CAM_Z * Math.tan((CAM_FOV * Math.PI) / 360);
    // Column count is fixed at setup, so it is sized for an ultrawide viewport rather
    // than the current one. Otherwise widening the window later could pull the wrap
    // seam inside the visible width and expose the join.
    const viewAspect = container.clientWidth / Math.max(container.clientHeight, 1);
    const visibleWidth = visibleHeight * Math.max(viewAspect, 3.4);

    // Enough columns to cover the viewport with margin, and enough that every unique
    // photo still gets a slot. The wrap seam sits beyond the visible width either
    // side, so a repeated image never lands next to itself on screen.
    const colsToFill = Math.ceil((visibleWidth + 3 * stepX) / stepX);
    const cols = Math.max(colsToFill, Math.ceil(totalImages / rows), 6);

    const spanX = cols * stepX;

    stateRef.current.cardWidth = cardWidth;
    stateRef.current.cardHeight = cardHeight;
    stateRef.current.gapX = gapX;
    stateRef.current.gapY = gapY;
    stateRef.current.cols = cols;
    stateRef.current.rows = rows;
    stateRef.current.spanX = spanX;
    stateRef.current.spanY = stepY * 2;

    // One simulation cell per tile. The atlas is laid out on the same grid as
    // the wall, so a tile's (col, row) is directly its cell.
    const waveField = new JellyWaveField(renderer, cols, rows, 64);

    // Subdivided enough that the elastic bend stays smooth rather than faceted,
    // and dense enough that the sampled wave field is not visibly faceted either.
    const planeGeo = new THREE.PlaneGeometry(cardWidth, cardHeight, 48, 34);

    // Preload image elements to create canvas textures
    const imageElementsCache = new Map<string, HTMLImageElement>();
    const loadedTextures = new Map<string, THREE.CanvasTexture>();

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    filteredImages.forEach(item => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        imageElementsCache.set(item.url, img);
        const tex = createTexture(img, item.eventName, item.subfolder);
        // Keeps the baked type sharp on tiles raked away by the wall curvature
        tex.anisotropy = maxAnisotropy;
        loadedTextures.set(item.url, tex);

        // Every slot showing this photo picks it up and starts fading in
        tiles.forEach(tile => {
          if (tile.imageItem.url === item.url) {
            tile.material.uniforms.uTexture.value = tex;
            tile.hasTexture = true;
          }
        });
      };
      img.src = item.url;
    });

    // One tile per grid slot, with the photo set cycling across the slots so the
    // wall is always full no matter how few photos the active filter has.
    const tiles: GridTileItem[] = [];

    // Shared placeholder: one 1x1 texture for every tile until its photo lands.
    const placeholderTex = new THREE.DataTexture(
      new Uint8Array([14, 19, 28, 255]),
      1,
      1,
      THREE.RGBAFormat
    );
    placeholderTex.needsUpdate = true;

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        // Slot index walks down each column, so vertical neighbours are always
        // different photos and horizontal neighbours differ by two.
        const imgItem = filteredImages[(c * rows + r) % totalImages];

        const mat = new THREE.ShaderMaterial({
          vertexShader,
          fragmentShader,
          transparent: true,
          depthWrite: true,
          side: THREE.DoubleSide,
          uniforms: {
            uTime: { value: 0 },
            uEdgeLag: { value: new THREE.Vector2(0, 0) },
            uVelocity: { value: new THREE.Vector2(0, 0) },

            uPointer: { value: new THREE.Vector2(0.5, 0.5) },
            uPointerActive: { value: 0 },
            uWaveTex: { value: waveField.current },
            uCellOrigin: { value: new THREE.Vector2(c / cols, r / rows) },
            uCellSize: { value: new THREE.Vector2(1 / cols, 1 / rows) },
            uWaveTexel: { value: waveField.texelSize.clone() },
            uWaveAmp: { value: 0.17 },
            uTilePos: { value: new THREE.Vector2(c, r) },
            uTexture: { value: placeholderTex },
            uActive: { value: 0.0 },
            uFade: { value: 0.0 }
          }
        });

        const mesh = new THREE.Mesh(planeGeo, mat);
        scene.add(mesh);

        tiles.push({
          mesh,
          material: mat,
          imageItem: imgItem,
          col: c,
          row: r,
          hasTexture: false,
          fade: 0
        });
      }
    }

    stateRef.current.tiles = tiles;

    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2(-999, -999);

    // The loop is genuinely cancelled when the wall is off-screen or the tab is
    // hidden, rather than left scheduled with an early return inside it. A live
    // rAF that returns early still burns a frame callback every tick for as long
    // as the page is open. Declared here because updateSize below reads it on the
    // synchronous first call, before the loop helpers are defined.
    let looping = false;

    // Resize handling: snug window framing over the 2-row wall
    const updateSize = () => {
      if (!container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;

      renderer.setSize(width, height, false);
      camera.aspect = width / height;

      // Vertical framing is fixed: visible height depends only on fov and z, so the
      // two rows sit identically snug at every viewport width. Aspect only widens
      // how much of the wall is on screen.
      camera.position.z = CAM_Z;

      camera.updateProjectionMatrix();

      // While the loop is stopped (off-screen, hidden tab, or a settled reduced
      // motion frame) nothing would repaint the resized backing store, leaving a
      // stretched or blank canvas. Draw the one settled frame here.
      if (tiles.length > 0 && !looping) {
        renderer.render(scene, camera);
      }
    };

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);
    updateSize();

    // IntersectionObserver owns visibility, visibilitychange owns the tab; both
    // start and stop the loop outright. These fire asynchronously, so syncLoop
    // being declared further down is settled by the time either runs.
    const intersectionObserver = new IntersectionObserver((entries) => {
      stateRef.current.isVisible = entries[0].isIntersecting;
      syncLoop();
    }, { threshold: 0.05 });
    intersectionObserver.observe(container);

    const handleVisibility = () => {
      stateRef.current.isTabActive = !document.hidden;
      syncLoop();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Per-row simulation. The wall previously shared a single progress value, so
    // every tile moved in lockstep and a drag read as one rigid sheet sliding.
    // Each row now chases the drag on its own spring, and the further a row sits
    // from the cursor the softer that spring is, so it trails and catches up late.
    let pointerWorldY = 0;

    // Which tile the cursor is resting on, and where on it. The cursor presses
    // a dent into the surface while it hovers, so the field needs to know the
    // contact point every frame, not just on the frames the pointer moves.
    let hoverCol = -1;
    let hoverRow = -1;
    const hoverUv = new THREE.Vector2(0.5, 0.5);
    const rowSim = Array.from({ length: rows }, () => ({
      progressX: 0,
      velocityX: 0,
      edgeLag: new THREE.Vector2(0, 0),
      edgeLagVel: new THREE.Vector2(0, 0),
      recoilDebt: 0,
    }));

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduceMotion = mediaQuery.matches;
    const handleMotionPref = (e: MediaQueryListEvent) => {
      reduceMotion = e.matches;
      if (reduceMotion) {
        // Settle immediately rather than letting the current wobble ring out
        const s = stateRef.current;
        s.velocityX = 0;
        s.velocityY = 0;
        rowSim.forEach(sim => {
          sim.velocityX = 0;
          sim.edgeLag.set(0, 0);
          sim.edgeLagVel.set(0, 0);
          sim.recoilDebt = 0;
        });
      }
    };
    mediaQuery.addEventListener('change', handleMotionPref);

    const clock = new THREE.Clock();

    // Animation & Physics Loop
    const renderFrame = () => {
      const delta = Math.min(clock.getDelta(), 0.05); // Cap delta to 50ms for numerical stability
      const elapsedTime = reduceMotion ? 0 : clock.getElapsedTime();
      const s = stateRef.current;

      // 1. CAROUSEL PAN PHYSICS: viscoelastic spring tracking when dragged, smooth coasting on release
      if (reduceMotion) {
        // Reduced motion: the wall still pans so the photos stay reachable, but it
        // tracks the pointer directly with no inertial glide and no elastic recoil.
        // Zeroing only the shader clock (as before) left the wobble and coast running,
        // which is the motion this preference is actually asking us to drop.
        s.progressX = s.targetProgressX;
        s.progressY = s.targetProgressY;
        s.velocityX = 0;
        s.velocityY = 0;
        if (!s.isDragging) s.targetProgressY = 0;
      } else if (s.isDragging) {
        const panK = 44.0;
        const panC = 12.0;
        const forceX = (s.targetProgressX - s.progressX) * panK - s.velocityX * panC;
        const forceY = (s.targetProgressY - s.progressY) * panK - s.velocityY * panC;

        s.velocityX += forceX * delta;
        s.velocityY += forceY * delta;
        s.progressX += s.velocityX * delta;
        s.progressY += s.velocityY * delta;
      } else {
        const glideDecay = Math.pow(0.92, delta * 60);
        s.velocityX *= glideDecay;
        s.velocityY *= Math.pow(0.85, delta * 60);
        s.progressX += s.velocityX * delta;
        s.progressY += s.velocityY * delta;

        s.targetProgressX = s.progressX;
        // Snappy spring return to vertical center (y = 0)
        s.targetProgressY += (0 - s.targetProgressY) * (1.0 - Math.pow(0.80, delta * 60));
        s.progressY += (s.targetProgressY - s.progressY) * 0.15;
      }

      // 2. PER-ROW PROPAGATION + INERTIAL JELLY ELASTICITY
      // s.progressX is the commanded position. Rows chase it individually instead
      // of it being copied onto every tile, which is what removes the rigid-sheet
      // feel: the row under the cursor leads, the far row arrives late.
      const strainY = s.targetProgressY - s.progressY;
      const targetLagY = reduceMotion
        ? 0
        : THREE.MathUtils.clamp(-strainY * 0.66 - s.velocityY * 0.115, -0.27, 0.27);

      for (let r = 0; r < rows; r++) {
        const sim = rowSim[r];

        if (reduceMotion) {
          sim.progressX = s.progressX;
          sim.velocityX = 0;
          sim.edgeLag.set(0, 0);
          sim.edgeLagVel.set(0, 0);
          sim.recoilDebt = 0;
          continue;
        }

        const rowY = r === 0 ? stepY * 0.5 : -stepY * 0.5;

        // How far this row sits from the cursor decides how eagerly it follows.
        const prox = THREE.MathUtils.clamp(
          Math.abs(rowY - pointerWorldY) / (stepY * 1.35),
          0,
          1
        );
        // The small per-row term keeps two equidistant rows from moving in perfect
        // lockstep, which is the thing that reads as mechanical.
        const followK = THREE.MathUtils.lerp(210.0, 62.0, prox) * (1.0 - r * 0.10);
        const followC = 2.0 * Math.sqrt(followK) * 0.85;

        const follow = (s.progressX - sim.progressX) * followK - sim.velocityX * followC;
        sim.velocityX += follow * delta;
        sim.progressX += sim.velocityX * delta;

        // Each row deforms from its own lag, so whichever row trails furthest is
        // also the one that stretches most. Previously one shared strain drove
        // every tile identically.
        const rowStrain = s.progressX - sim.progressX;
        const targetLagX = THREE.MathUtils.clamp(
          -rowStrain * 1.30 - sim.velocityX * 0.055,
          -0.40,
          0.40
        );

        const lagK = 145.0;
        const lagC = 11.8;
        sim.edgeLagVel.x += ((targetLagX - sim.edgeLag.x) * lagK - sim.edgeLagVel.x * lagC) * delta;
        sim.edgeLagVel.y += ((targetLagY - sim.edgeLag.y) * lagK - sim.edgeLagVel.y * lagC) * delta;
        sim.edgeLag.x += sim.edgeLagVel.x * delta;
        sim.edgeLag.y += sim.edgeLagVel.y * delta;

        // Recoil now feeds the wave field instead of a scripted oscillator:
        // the snap back after a drag drops real energy into the surface, which
        // then travels and rings down on its own.
        const recoil = sim.edgeLagVel.length();
        if (recoil > 0.55) {
          sim.recoilDebt += recoil * delta;
          if (sim.recoilDebt > 0.10) {
            sim.recoilDebt = 0;
            for (const tile of tiles) {
              if (tile.row !== r) continue;
              waveField.addImpulse({
                col: tile.col, row: tile.row,
                u: 0.5 + THREE.MathUtils.clamp(-sim.edgeLag.x, -0.35, 0.35),
                v: 0.5,
                amplitude: THREE.MathUtils.clamp(recoil * 0.020, 0, 0.06),
                radius: 0.15,
              });
              break; // one seed per row per burst; the field spreads it
            }
          }
        }
      }

      const currentVel = new THREE.Vector2(s.velocityX, s.velocityY);

      // Position each unique tile along the 2-row curved wall
      tiles.forEach((tile) => {
        // Stagger row 1 (bottom row) by 50% card width for brick layout
        const rowStagger = tile.row === 1 ? stepX * 0.5 : 0;

        // Infinite wrapping in X
        const sim = rowSim[tile.row];
        let x = ((tile.col * stepX + rowStagger + sim.progressX) % spanX + spanX) % spanX - spanX / 2;

        // Vertically centered: Row 0 at +stepY*0.5, Row 1 at -stepY*0.5 (zero gap)
        const baseY = tile.row === 0 ? stepY * 0.5 : -stepY * 0.5;
        let y = baseY + s.progressY * 0.25;

        // Convex spherical curvature (center bulges out toward camera, edges curve away)
        const radiusX = 18.0;
        const radiusY = 8.5;
        const z = -(Math.pow(x, 2) / radiusX + Math.pow(y, 2) / radiusY) * 0.38;

        tile.mesh.position.set(x, y, z);

        // Dynamic 3D tilt facing the viewer along the sphere tangent
        tile.mesh.rotation.y = -x * 0.052;
        tile.mesh.rotation.x = y * 0.065;
        // Whisper of roll only. The reference wall keeps its tiles square to the
        // grid, so rolling the whole wall by drag velocity reads as a wobble bug.
        tile.mesh.rotation.z = -sim.velocityX * 0.005;

        // Ease the photo up out of the placeholder tint instead of popping
        if (tile.hasTexture && tile.fade < 1) {
          tile.fade = Math.min(1, tile.fade + delta * 2.2);
          tile.material.uniforms.uFade.value = tile.fade;
        }

        // Update tile shader uniforms with active spring edge lag & recoil
        tile.material.uniforms.uTime.value = elapsedTime;
        tile.material.uniforms.uEdgeLag.value.copy(sim.edgeLag);
        tile.material.uniforms.uVelocity.value.copy(currentVel);
        tile.material.uniforms.uWaveTex.value = waveField.current;
        tile.material.uniforms.uPointer.value.copy(s.pointer);
        tile.material.uniforms.uPointerActive.value = s.pointerActive;
      });

      s.pointerActive = Math.max(0, s.pointerActive - delta * 2.5);

      // The cursor has weight. While it rests on a tile it presses a small
      // negative displacement in every frame, so the surface dents under it and
      // trails a wake as it moves, rather than only reacting to clicks.
      //
      // Forcing rather than setting a depth: the dent deepens until the energy
      // radiating away and the field's damping balance the press, which settles
      // at a shallow steady state instead of sinking without limit.
      if (!reduceMotion && hoverCol >= 0) {
        waveField.setPress(hoverCol, hoverRow, hoverUv.x, hoverUv.y, -0.85, 0.19);
      } else {
        waveField.clearPress();
      }

      // Advance the surface simulation before drawing, so the tiles sample the
      // state for this frame rather than the previous one. Skipped entirely
      // under reduced motion: a wave field that never moves costs nothing and
      // leaves the tiles flat.
      if (!reduceMotion) waveField.step();

      renderer.render(scene, camera);
    };

    const loop = () => {
      stateRef.current.animationFrameId = requestAnimationFrame(loop);
      renderFrame();
    };

    const startLoop = () => {
      if (looping) return;
      looping = true;
      clock.getDelta(); // discard the idle gap so the first frame is not a jump
      stateRef.current.animationFrameId = requestAnimationFrame(loop);
    };

    const stopLoop = () => {
      if (!looping) return;
      looping = false;
      cancelAnimationFrame(stateRef.current.animationFrameId);
    };

    const syncLoop = () => {
      const s = stateRef.current;
      if (s.isVisible && s.isTabActive) startLoop();
      else stopLoop();
    };

    syncLoop();

    // 2D Drag & Gesture Listeners
    const onPointerDown = (e: PointerEvent) => {
      const s = stateRef.current;
      s.isDragging = true;
      s.startX = e.clientX;
      s.startY = e.clientY;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      s.lastTime = performance.now();
      s.dragDistance = 0;

      s.dragAnchorX = e.clientX;
      s.dragAnchorY = e.clientY;
      s.dragStartProgressX = s.progressX;
      s.dragStartProgressY = s.progressY;

      canvas.setPointerCapture(e.pointerId);

      // Ripple impulse on tile under pointer
      const rect = canvas.getBoundingClientRect();
      pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointerNDC, camera);
      const intersects = raycaster.intersectObjects(tiles.map(t => t.mesh));
      if (intersects.length > 0) {
        const hit = intersects[0];
        const uv = hit.uv || new THREE.Vector2(0.5, 0.5);
        const hitMesh = hit.object as THREE.Mesh;
        const tile = tiles.find(t => t.mesh === hitMesh);
        if (tile) {
          waveField.addImpulse({
            col: tile.col,
            row: tile.row,
            u: uv.x,
            v: uv.y,
            amplitude: 0.55,
            radius: 0.11,
          });
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const s = stateRef.current;
      const rect = canvas.getBoundingClientRect();
      pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (s.isDragging) {
        const deltaX = e.clientX - s.lastX;
        const deltaY = e.clientY - s.lastY;
        s.dragDistance += Math.hypot(deltaX, deltaY);

        const sensitivity = 0.0072;
        const totalDragX = (e.clientX - s.dragAnchorX) * sensitivity;
        const totalDragY = (e.clientY - s.dragAnchorY) * sensitivity * 0.65;

        s.targetProgressX = s.dragStartProgressX + totalDragX;
        s.targetProgressY = s.dragStartProgressY - totalDragY;

        s.lastX = e.clientX;
        s.lastY = e.clientY;
        s.lastTime = performance.now();
      }

      // Pointer raycasting for ripple undulation & cursor style
      raycaster.setFromCamera(pointerNDC, camera);
      const intersects = raycaster.intersectObjects(tiles.map(t => t.mesh));
      if (intersects.length > 0) {
        const hit = intersects[0];
        const uv = hit.uv || new THREE.Vector2(0.5, 0.5);
        s.pointer.copy(uv);
        s.pointerActive = 1.0;
        // Drives which row leads and which trails
        pointerWorldY = pointerNDC.y * (visibleHeight * 0.5);

        const hitTile = tiles.find(t => t.mesh === hit.object);
        if (hitTile) {
          hoverCol = hitTile.col;
          hoverRow = hitTile.row;
          hoverUv.copy(uv);
        }

        canvas.style.cursor = s.isDragging ? 'grabbing' : 'grab';
      } else {
        hoverCol = -1;
        hoverRow = -1;
        canvas.style.cursor = s.isDragging ? 'grabbing' : 'default';
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const s = stateRef.current;
      if (s.isDragging) {
        s.isDragging = false;
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {}

        // Letting go drops the stored tension into the surface as real energy.
        // Each row is struck on its trailing side, opposite the direction it was
        // dragged, so the wave starts where the jelly was stretched and then
        // travels across the tile on its own.
        if (!reduceMotion) {
          const releaseStrain = Math.hypot(
            s.targetProgressX - s.progressX,
            s.targetProgressY - s.progressY,
          );
          rowSim.forEach((sim, r) => {
            const energy = releaseStrain * 0.55 + sim.edgeLag.length() * 0.40;
            if (energy < 0.012) return;
            for (const tile of tiles) {
              if (tile.row !== r) continue;
              waveField.addImpulse({
                col: tile.col,
                row: tile.row,
                u: 0.5 + THREE.MathUtils.clamp(-sim.edgeLag.x * 0.8, -0.34, 0.34),
                v: 0.5,
                amplitude: THREE.MathUtils.clamp(energy, 0, 0.20),
                radius: 0.20,
              });
            }
          });
        }

        // Quick click without drag opens lightbox
        if (s.dragDistance < 7) {
          const rect = canvas.getBoundingClientRect();
          pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointerNDC, camera);
          const intersects = raycaster.intersectObjects(tiles.map(t => t.mesh));
          if (intersects.length > 0) {
            const hitMesh = intersects[0].object as THREE.Mesh;
            const tile = tiles.find(t => t.mesh === hitMesh);
            if (tile) {
              setLightboxImage(tile.imageItem);
            }
          }
        }
      }
    };

    // Keyboard path. Without this the wall is reachable only by pointer, so the
    // archive is simply unavailable to keyboard users. Arrows pan, Enter opens the
    // tile nearest the centre of view.
    const onKeyDown = (e: KeyboardEvent) => {
      const s = stateRef.current;
      const step = s.cardWidth + s.gapX;

      const pan = (dx: number, dy: number) => {
        if (reduceMotion) {
          // No glide to carry the movement, so move the wall outright
          s.targetProgressX += dx * step;
          s.targetProgressY += dy * step;
          s.progressX = s.targetProgressX;
          s.progressY = s.targetProgressY;
        } else {
          // Impulse rather than a target: the idle branch re-syncs targetProgressX
          // to progressX every frame, so a target set here would be discarded.
          s.velocityX += dx * step * 2.4;
          s.velocityY += dy * step * 2.4;
        }
      };

      switch (e.key) {
        case 'ArrowLeft': pan(1, 0); break;
        case 'ArrowRight': pan(-1, 0); break;
        case 'ArrowUp': pan(0, -0.5); break;
        case 'ArrowDown': pan(0, 0.5); break;
        case 'Enter':
        case ' ': {
          // Open whichever tile currently sits closest to the centre of the view
          let best: GridTileItem | null = null;
          let bestDist = Infinity;
          tiles.forEach(t => {
            const d = Math.hypot(t.mesh.position.x, t.mesh.position.y);
            if (d < bestDist) { bestDist = d; best = t; }
          });
          if (best) setLightboxImage((best as GridTileItem).imageItem);
          break;
        }
        default:
          return; // let every other key through
      }
      e.preventDefault();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      cancelAnimationFrame(stateRef.current.animationFrameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
      mediaQuery.removeEventListener('change', handleMotionPref);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      // Geometry is shared across every tile, so it is disposed once below rather
      // than once per tile.
      tiles.forEach(t => t.material.dispose());
      loadedTextures.forEach(tex => tex.dispose());
      placeholderTex.dispose();
      waveField.dispose();
      planeGeo.dispose();
      renderer.dispose();
    };
  }, [filteredImages, createTexture]);

  // Escape closes the lightbox. A modal that can be opened from the keyboard but
  // only dismissed with the mouse is a dead end.
  useEffect(() => {
    if (!lightboxImage) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxImage(null);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [lightboxImage]);

  return (
    <div className={`relative w-full h-full flex flex-col justify-between select-none ${className}`}>
      {/* 3D WebGL Wall Viewport: tight window framing */}
      <div 
        ref={containerRef} 
        className="relative w-full h-full min-h-[360px] sm:min-h-[420px] lg:min-h-[500px] rounded-2xl overflow-hidden touch-none"
      >
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="group"
          aria-label="Community photo wall. Use the arrow keys to pan across the photos, and Enter to open the photo in the centre."
          className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing z-10 outline-none focus-visible:ring-2 focus-visible:ring-brand-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#01040c] rounded-2xl"
        />

        {/* Subtle Edge Gradients */}
        <div 
          aria-hidden="true" 
          className="pointer-events-none absolute top-0 inset-x-0 h-8 bg-gradient-to-b from-[#01040c]/40 to-transparent z-0" 
        />
        <div 
          aria-hidden="true" 
          className="pointer-events-none absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-[#01040c]/40 to-transparent z-0" 
        />

        {/* Empty state: a filter with no photos would otherwise render a blank box */}
        {filteredImages.length === 0 && (
          <div className="absolute inset-0 z-20 flex items-center justify-center px-6 text-center">
            <p className="text-sm text-zinc-400">
              No photos from this gathering yet. Check back after the next one.
            </p>
          </div>
        )}

      </div>

      {/* Lightbox Modal for High-Res Inspection */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
          onClick={() => setLightboxImage(null)}
        >
          <div 
            className="relative max-w-4xl w-full bg-zinc-950/95 border border-white/15 rounded-3xl p-4 sm:p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-brand-400" />
                <span className="text-base font-semibold text-white">{lightboxImage.eventName}</span>
                {lightboxImage.subfolder && (
                  <span className="text-xs text-brand-300/80 px-2 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/20">
                    {lightboxImage.subfolder.replace(/^#/, 'Edition ')}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative w-full max-h-[70vh] flex items-center justify-center overflow-hidden rounded-2xl bg-black/60">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.title}
                className="max-h-[70vh] w-auto object-contain rounded-xl"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
              <span>{lightboxImage.title}</span>
              <span className="text-brand-400 font-medium">Cybrdeck Community Gathering Archive</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
