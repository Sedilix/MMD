'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CLEAN_MARK_CONTOURS, MARK_RATIO } from './mark';

interface TowerCrown3DProps {
  className?: string;
  style?: React.CSSProperties;
  /** Reduced motion flag */
  still?: boolean;
  /**
   * The cityscape canvas sitting behind this one in the DOM, and the region of
   * it this crown covers, in that canvas's CSS pixels.
   *
   * three can only refract what is inside its own scene, so without these the
   * crystal has nothing to bend and reads as a flat pane no matter how the
   * material is tuned. Handing it the pixels it is standing in front of is
   * what buys real refraction — see the backdrop below.
   */
  sourceCanvas?: HTMLCanvasElement | null;
  sourceRect?: { x: number; y: number; w: number; h: number } | null;
}

/** Resolution of the refracted backdrop. */
const BACKDROP_PX = 512;

/**
 * Real 3D optical glass crown for the Cybrdeck tower spire.
 *
 * The mark is extruded from the analytical CAD contours (CLEAN_MARK_CONTOURS)
 * and rendered as a machined block of clear optical crystal, matching the
 * Offgrid / Fons Mans reference: colourless and fully transmissive, with
 * mirror-bright planar ribbons running the chamfers.
 *
 * Three things carry that look, and each has a failure mode worth naming:
 *
 * - Darkness BEHIND the glass, not inside it. Clear glass has no appearance of
 *   its own; it shows what is behind it. The reference gets its dark body for
 *   free by sitting on black, so the cityscape's sky palette is black too
 *   (SKY_TOP..HORIZON_WARM in scene.ts) rather than the violet it used to be.
 *   Tinting the crystal dark instead is the shortcut that looks close and is
 *   wrong: it reads as smoked resin, holds the same darkness at every angle,
 *   and loses the thing that says "glass" — the background shifting and
 *   bending behind it as it turns.
 * - A LOW total light budget. Over black, the body you see is whatever the
 *   surface reflects, so an over-lit studio does not read as brighter glass —
 *   it lays a flat grey veil across the whole mark and the thing turns into
 *   matte plastic. A few narrow strips in an otherwise black room, and
 *   envMapIntensity near 1, is what keeps the faces clear and the light
 *   confined to the chamfers.
 * - Single-segment bevels. The reference's edges are flat facets that mirror
 *   a strip as one unbroken ribbon; rounding them smears it into a gradient.
 *
 * Light and material intensities are physical units (three r155+), so the old
 * 8.0 specular / 8.0 envMapIntensity values were not "brighter" — they are out
 * of range, and they clipped every highlight to flat white.
 */
export function TowerCrown3D({
  className,
  style,
  still = false,
  sourceCanvas = null,
  sourceRect = null,
}: TowerCrown3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Read through refs inside the frame loop: these change as the cityscape
  // rebakes on resize, and rebuilding the whole WebGL scene for that would
  // throw away the env map and geometry for nothing.
  const sourceCanvasRef = useRef(sourceCanvas);
  const sourceRectRef = useRef(sourceRect);
  sourceCanvasRef.current = sourceCanvas;
  sourceRectRef.current = sourceRect;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // 1. Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    // Supersample. The crown ships at ~136 CSS px, so the chamfer ribbons are
    // only a few pixels wide and are the first thing to alias away; the canvas
    // is small enough that the extra samples cost almost nothing here, even
    // though a 3x cap would be reckless on a full-viewport canvas.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const width = container.clientWidth || 280;
    const height = container.clientHeight || 280;
    renderer.setSize(width, height, false);

    // 2. Scene & camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 50);
    camera.position.set(0, 0, 4.85);
    camera.lookAt(0, 0, 0);

    // 3. Studio environment (PMREM). Emissive cards only — a transmissive
    //    body reads almost entirely through what it reflects and refracts.
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x05060d);

    const disposables: Array<{ dispose: () => void }> = [];
    const addCard = (
      w: number,
      h: number,
      color: THREE.Color,
      pos: [number, number, number],
    ) => {
      const geom = new THREE.PlaneGeometry(w, h);
      const mat = new THREE.MeshBasicMaterial({ color });
      const card = new THREE.Mesh(geom, mat);
      card.position.set(pos[0], pos[1], pos[2]);
      card.lookAt(0, 0, 0);
      envScene.add(card);
      disposables.push(geom, mat);
    };

    // A hard studio: a few blazing neutral strips in an otherwise black room.
    // The reference look is all contrast — a dark smoky body with mirror-bright
    // ribbons on the chamfers — so everything that is not a strip stays near
    // black. Any broad fill card here reads as a flat sheen across the front
    // face and the crystal immediately goes frosted.
    //
    // Neutral on purpose: the reference has no colour cast, so no brand tint
    // is mixed into the environment.

    // Overhead key strip — the highlight that runs across the top bevel.
    addCard(12, 0.8, new THREE.Color(9.0, 9.0, 9.2), [0, 5, 2.0]);
    // Right vertical strip — the signature ribbon sliding down the chamfer.
    addCard(0.5, 16, new THREE.Color(8.0, 8.0, 8.2), [4.5, 0, 1.8]);
    // Left rim strip, dimmer, so the two edges are not twins.
    addCard(0.4, 16, new THREE.Color(2.0, 2.0, 2.2), [-4.5, 0, -1.6]);
    // Back rim, for the internal total-reflection sparkle through the body.
    addCard(0.5, 14, new THREE.Color(3.0, 3.0, 3.2), [0, 3, -4.5]);
    // Two narrow grazing cards flanking the camera. These draw the silhouette:
    // at glancing angles Fresnel is near total, so they light the outer chamfer
    // all the way round and the mark keeps a hard edge against the sky.
    addCard(0.3, 11, new THREE.Color(7.0, 7.0, 7.2), [3.0, 0.5, 5.2]);
    addCard(0.3, 11, new THREE.Color(3.5, 3.5, 3.6), [-3.0, -0.5, 5.2]);
    // Black room. Everything not a strip must stay dark or the body lifts.
    addCard(18, 16, new THREE.Color(0.012, 0.012, 0.016), [0, 1, 7]);
    addCard(18, 14, new THREE.Color(0.006, 0.006, 0.009), [0, -7, 0]);

    const envMap = pmremGenerator.fromScene(envScene).texture;
    scene.environment = envMap;

    // 4. Direct lights. Against a transmissive body these read almost purely
    //    as specular glints on the chamfers, so they stay modest.
    const dirKey = new THREE.DirectionalLight(0xffffff, 1.2);
    dirKey.position.set(-4, 6, 2);
    scene.add(dirKey);

    const dirRimRight = new THREE.DirectionalLight(0xeaf2ff, 1.0);
    dirRimRight.position.set(5, 2, 1);
    scene.add(dirRimRight);

    const dirRimLeft = new THREE.DirectionalLight(0xffffff, 0.5);
    dirRimLeft.position.set(-5, 0, -1);
    scene.add(dirRimLeft);

    // Soft upward bounce off the rooftop pedestal.
    const pedestalLight = new THREE.PointLight(0xffffff, 0.6, 8, 1.0);
    pedestalLight.position.set(0, -1.1, 0.3);
    scene.add(pedestalLight);

    // 5. Extruded mark. The outer contour must wind CCW and the counters CW,
    //    or ExtrudeGeometry triangulates the holes as solid.
    function toPts(arr: readonly number[]) {
      const p: THREE.Vector2[] = [];
      for (let i = 0; i < arr.length; i += 2) {
        p.push(new THREE.Vector2(arr[i] - 0.5, -(arr[i + 1] - MARK_RATIO / 2)));
      }
      return p;
    }

    const pts0 = toPts(CLEAN_MARK_CONTOURS[0]);
    const pts1 = toPts(CLEAN_MARK_CONTOURS[1]);
    const pts2 = toPts(CLEAN_MARK_CONTOURS[2]);

    if (THREE.ShapeUtils.area(pts0) < 0) pts0.reverse();
    if (THREE.ShapeUtils.area(pts1) > 0) pts1.reverse();
    if (THREE.ShapeUtils.area(pts2) > 0) pts2.reverse();

    const shape = new THREE.Shape(pts0);
    shape.holes.push(new THREE.Path(pts1));
    shape.holes.push(new THREE.Path(pts2));

    // A chunky block with ONE flat chamfer per edge. bevelSegments: 1 is the
    // whole point — the reference's edges are single planar facets that mirror
    // a strip as an unbroken ribbon. Rounding them over several segments
    // smears that ribbon into a soft gradient and the machined-crystal read
    // goes with it.
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 0.46,
      bevelEnabled: true,
      bevelSegments: 1,
      steps: 1,
      bevelSize: 0.075,
      bevelThickness: 0.075,
      curveSegments: 32,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.center();
    geometry.computeVertexNormals();

    // 6. Clear optical crystal.
    //
    // Fully transmissive and colourless — the body is NOT tinted dark. It goes
    // dark because of what is behind it: `drawCrownGlow` in scene.ts paints a
    // night pocket into the sky right where the crown hangs, so the glass
    // transmits near-black and picks up the reference's contrast the same way
    // the reference does, by sitting on darkness.
    //
    // Tinting the body instead is the tempting shortcut and it is wrong: a
    // dark `color` reads as smoked resin, holds its darkness at every angle,
    // and kills the giveaway that this is glass at all — that what is behind
    // it shifts and bends as it turns.
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 1.0,
      thickness: 1.10,
      ior: 1.60,
      // A hint only. The reference is neutral — strong dispersion throws
      // rainbow fringes it simply does not have.
      dispersion: 0.18,
      roughness: 0.0,
      metalness: 0.0,
      reflectivity: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.0,
      specularIntensity: 1.0,
      specularColor: new THREE.Color(0xffffff),
      // Long attenuation over a neutral colour: effectively water-clear, with
      // only the thickest passes picking up the faintest grey.
      attenuationColor: new THREE.Color(0xe6edf5),
      attenuationDistance: 3.20,
      envMapIntensity: 1.4,
      transparent: true,
      // How much of the city shows through the crown.
      //
      // The backdrop below fills the transmission target with solid alpha, so
      // the shader's own transmissionAlpha comes out at 1 and the mark
      // composites over the page as a solid block. `opacity` multiplies the
      // final alpha AFTER that, which is the one knob that reopens the glass
      // without giving up the refraction the backdrop provides: the body still
      // reads dark and structured, but the skyline is visible through it.
      opacity: 1.0,
      side: THREE.FrontSide,
    });

    // Backdrop — the thing the glass actually refracts.
    //
    // three's transmission samples the scene's own framebuffer, so it can only
    // bend what is INSIDE this WebGL scene. The cityscape is a separate DOM
    // canvas underneath, which the crown composites over but can never
    // distort — so with an empty scene behind it the crystal had nothing to
    // refract and no internal structure at all, which is most of why it read
    // as a flat pane rather than a solid block.
    //
    // So the region of cityscape this crown covers is copied into a texture
    // each frame and hung behind the mark, sized to exactly fill the camera's
    // frustum at its depth. A straight-through ray then lands on the same
    // pixels the DOM would have shown, and everything the glass bends is a
    // real, displaced image of the skyline — which is the whole difference
    // between a pane and a solid piece of optical glass.
    //
    // Left in the final image the card is a hard rectangle over the skyline,
    // so its colour writes are masked off for the main pass and left on for
    // the transmission pass. three renders transmission into its own target,
    // so `getRenderTarget() !== null` distinguishes the two, and material
    // state is applied after onBeforeRender runs, which is what makes the
    // toggle land on the right draw call.
    const backdropCanvas = document.createElement('canvas');
    backdropCanvas.width = BACKDROP_PX;
    backdropCanvas.height = BACKDROP_PX;
    const backdropCtx = backdropCanvas.getContext('2d');
    const backdropTex = new THREE.CanvasTexture(backdropCanvas);
    backdropTex.colorSpace = THREE.SRGBColorSpace;
    backdropTex.minFilter = THREE.LinearFilter;
    backdropTex.generateMipmaps = false;

    const backdropGeom = new THREE.PlaneGeometry(1, 1);
    const backdropMat = new THREE.MeshBasicMaterial({ map: backdropTex });
    const backdrop = new THREE.Mesh(backdropGeom, backdropMat);
    const BACKDROP_Z = -3.2;
    backdrop.position.set(0, 0, BACKDROP_Z);
    backdrop.onBeforeRender = (r) => {
      backdropMat.colorWrite = r.getRenderTarget() !== null;
    };
    scene.add(backdrop);

    // Fill the frustum at the card's depth, so screen position maps 1:1.
    const fitBackdrop = () => {
      const dist = camera.position.z - BACKDROP_Z;
      const fh = 2 * dist * Math.tan(((camera.fov * Math.PI) / 180) / 2);
      backdrop.scale.set(fh * camera.aspect, fh, 1);
    };
    fitBackdrop();

    // Pull the covered region out of the cityscape canvas. Its backing store is
    // DPR-scaled while the rect arrives in CSS pixels, hence the conversion.
    const updateBackdrop = () => {
      const src = sourceCanvasRef.current;
      const rect = sourceRectRef.current;
      if (!backdropCtx) return;
      if (!src || !rect || rect.w <= 0 || rect.h <= 0 || src.width === 0) {
        backdropCtx.fillStyle = '#000';
        backdropCtx.fillRect(0, 0, BACKDROP_PX, BACKDROP_PX);
        backdropTex.needsUpdate = true;
        return;
      }
      const scale = src.width / (src.clientWidth || src.width);
      backdropCtx.fillStyle = '#000';
      backdropCtx.fillRect(0, 0, BACKDROP_PX, BACKDROP_PX);
      backdropCtx.drawImage(
        src,
        rect.x * scale,
        rect.y * scale,
        rect.w * scale,
        rect.h * scale,
        0,
        0,
        BACKDROP_PX,
        BACKDROP_PX,
      );
      backdropTex.needsUpdate = true;
    };
    updateBackdrop();

    const mesh = new THREE.Mesh(geometry, glassMaterial);
    mesh.scale.set(1.15, 1.15, 1.15);
    scene.add(mesh);

    // 7. Pointer parallax & render loop
    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    const onPointerMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / 400;
      const dy = (e.clientY - cy) / 400;
      targetMouseX = Math.max(-1, Math.min(1, dx));
      targetMouseY = Math.max(-1, Math.min(1, dy));
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    let rafId: number | null = null;
    let isVisible = true;

    const renderFrame = (timestamp: number) => {
      if (!isVisible) return;
      const t = timestamp * 0.001;

      updateBackdrop();

      mouseX += (targetMouseX - mouseX) * 0.06;
      mouseY += (targetMouseY - mouseY) * 0.06;

      if (!still) {
        const phase = t * 0.38;
        // Paced rotation matching the cityscape: lingers face-on, glides
        // smoothly through edge-on.
        const theta = -Math.PI / 4 + phase - 0.2 * Math.sin(2 * phase);
        mesh.rotation.y = theta + mouseX * 0.35;
        mesh.rotation.x = 0.10 + mouseY * 0.12;
        mesh.rotation.z = -0.04 - mouseX * 0.08;
      } else {
        mesh.rotation.set(0.10 + mouseY * 0.08, -Math.PI / 4 + mouseX * 0.15, -0.04);
      }

      renderer.render(scene, camera);
      if (!still) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    // Pause rendering when scrolled off-screen.
    const io = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
      if (isVisible && !still) {
        rafId = requestAnimationFrame(renderFrame);
      } else if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    });
    io.observe(container);

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth || 280;
      const h = container.clientHeight || 280;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      fitBackdrop();
      if (still) {
        updateBackdrop();
        renderer.render(scene, camera);
      }
    });
    ro.observe(container);

    if (still) {
      renderFrame(0);
    } else {
      rafId = requestAnimationFrame(renderFrame);
    }

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      if (rafId) cancelAnimationFrame(rafId);
      io.disconnect();
      ro.disconnect();
      pmremGenerator.dispose();
      geometry.dispose();
      glassMaterial.dispose();
      backdropGeom.dispose();
      backdropMat.dispose();
      backdropTex.dispose();
      for (const d of disposables) d.dispose();
      envMap.dispose();
      renderer.dispose();
    };
  }, [still]);

  return (
    <div ref={containerRef} className={`relative w-full h-full overflow-visible ${className || ''}`} style={style}>
      <canvas ref={canvasRef} className="w-full h-full block pointer-events-none" />
    </div>
  );
}
