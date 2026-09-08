'use client';

import { useEffect, useRef } from 'react';

export interface ForceWaveCanvasProps {
  hostRef: React.RefObject<HTMLElement | null>;
  /** Overall wave visibility, 0..1 */
  opacity?: number;
}

/* Fullscreen triangle via gl_VertexID — no vertex buffers needed. */
const QUAD_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/* Wave-equation step, ThreeUI elemental-marks formulation (MIT):
   ping-pong with r = h, g = h_prev, damping 0.984. The cursor injects a
   gaussian force in screen pixels so rings stay circular at any aspect —
   disturbances diffuse like a still plane being pressed, not splashed. */
const SIM_FS = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform vec2 uPointerPx;
uniform float uRadiusPx;
uniform float uForce;
out vec2 outState;

void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec2 s = texture(uState, uv).rg;
  float l = texture(uState, uv - vec2(uTexel.x, 0.0)).r;
  float r = texture(uState, uv + vec2(uTexel.x, 0.0)).r;
  float u = texture(uState, uv + vec2(0.0, uTexel.y)).r;
  float d = texture(uState, uv - vec2(0.0, uTexel.y)).r;
  float next = (l + r + u + d) * 0.5 - s.g;
  next *= 0.984;
  if (uForce != 0.0) {
    vec2 dp = (gl_FragCoord.xy - uPointerPx) / uRadiusPx;
    next += uForce * exp(-dot(dp, dp));
  }
  outState = vec2(next, s.r);
}`;

/* Liquid-glass shading adapted from ThreeUI elemental-marks (MIT):
   crests bright, troughs barely darker, tight specular glint, plus
   chromatic dispersion on the crest and de-banding dither scaled by
   activity. The resting plane is fully transparent. */
const RENDER_FS = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform vec2 uFragSize;
uniform float uStrength;
uniform float uOpacity;
out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

vec3 normalAt(vec2 uv) {
  float hx = texture(uState, uv + vec2(uTexel.x, 0.0)).r
           - texture(uState, uv - vec2(uTexel.x, 0.0)).r;
  float hy = texture(uState, uv + vec2(0.0, uTexel.y)).r
           - texture(uState, uv - vec2(0.0, uTexel.y)).r;
  return normalize(vec3(-hx * uStrength, -hy * uStrength, 1.0));
}

void main() {
  // Map device-pixel gl_FragCoord to 0..1 UV so the render pass correctly
  // samples the CSS-pixel-density sim texture at any devicePixelRatio.
  vec2 uv = gl_FragCoord.xy / uFragSize;
  vec3 nG = normalAt(uv);
  vec2 disp = uTexel * 2.5;
  vec3 nR = normalAt(uv - disp);
  vec3 nB = normalAt(uv + disp);
  float h = texture(uState, uv).r;

  vec3 L = normalize(vec3(-0.35, 0.55, 0.75));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float specG = pow(max(dot(nG, H), 0.0), 180.0);
  float specR = pow(max(dot(nR, H), 0.0), 180.0);
  float specB = pow(max(dot(nB, H), 0.0), 180.0);

  // ripple shading: crests bright, troughs barely darker
  float crest = clamp(h * 2.2, -0.08, 1.0);
  float crest2 = pow(clamp(h * 2.6, 0.0, 1.0), 2.0) * 0.5;
  vec3 col = vec3(0.09, 0.30, 0.40) * max(crest, 0.0) * 0.9
    + vec3(0.25, 0.55, 0.65) * crest2
    + vec3(specR, specG, specB) * vec3(0.65, 0.90, 1.0) * 0.9;

  float activity = clamp(abs(h) * 3.0 + length(nG.xy) * 1.4, 0.0, 1.0);
  col += (hash21(uv * 617.0) - 0.5) / 128.0 * activity;

  float alpha = clamp(
    max(crest, 0.0) * 0.5
    + crest2 * 0.8
    + max(specR, max(specG, specB)) * 1.1,
    0.0, 1.0
  ) * uOpacity;
  outColor = vec4(col * alpha, alpha);
}`;

/**
 * ForceWaveCanvas — a crystal-clear liquid-glass force-field plane.
 *
 * A GPU wave-equation (ping-pong RG16F textures, WebGL2) disturbed by the
 * cursor: movement presses smooth gaussian forces into a still plane and
 * the diffusion reads as visible force waves — bright crests with a faint
 * cyan body, tight specular glints and prismatic fringing — rendered at
 * full device resolution with linear filtering, never pixelated. At rest
 * the plane is perfectly still and transparent; the loop sleeps once the
 * waves decay.
 *
 * Simulation + shading model adapted from ThreeUI (Meng To) community
 * `elemental-marks` water study (MIT) — see the shader docblocks.
 */
export function ForceWaveCanvas({ hostRef, opacity = 0.9 }: ForceWaveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let teardown: (() => void) | null = null;

    const setup = (): (() => void) | null => {
      const gl = canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
      });
      if (!gl || !gl.getExtension('EXT_color_buffer_float')) return null;

      const compile = (type: number, src: string) => {
        const sh = gl.createShader(type);
        if (!sh) return null;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          gl.deleteShader(sh);
          return null;
        }
        return sh;
      };
      const link = (vsSrc: string, fsSrc: string) => {
        const vs = compile(gl.VERTEX_SHADER, vsSrc);
        const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
        if (!vs || !fs) return null;
        const prog = gl.createProgram();
        if (!prog) return null;
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
        return prog;
      };

      const simProg = link(QUAD_VS, SIM_FS);
      const renderProg = link(QUAD_VS, RENDER_FS);
      if (!simProg || !renderProg) return null;

      const sim = {
        state: gl.getUniformLocation(simProg, 'uState'),
        texel: gl.getUniformLocation(simProg, 'uTexel'),
        pointerPx: gl.getUniformLocation(simProg, 'uPointerPx'),
        radiusPx: gl.getUniformLocation(simProg, 'uRadiusPx'),
        force: gl.getUniformLocation(simProg, 'uForce'),
      };
      const ren = {
        state: gl.getUniformLocation(renderProg, 'uState'),
        texel: gl.getUniformLocation(renderProg, 'uTexel'),
        fragSize: gl.getUniformLocation(renderProg, 'uFragSize'),
        strength: gl.getUniformLocation(renderProg, 'uStrength'),
        opacity: gl.getUniformLocation(renderProg, 'uOpacity'),
      };

      let simW = 2;
      let simH = 2;
      let texRead: WebGLTexture | null = null;
      let texWrite: WebGLTexture | null = null;
      let fboRead: WebGLFramebuffer | null = null;
      let fboWrite: WebGLFramebuffer | null = null;

      const makeTarget = () => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, simW, simH, 0, gl.RG, gl.HALF_FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return { tex, fbo };
      };

      const allocate = () => {
        const rect = host.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(2, Math.round(rect.width * dpr));
        canvas.height = Math.max(2, Math.round(rect.height * dpr));
        // Simulation at CSS-pixel density is already smoother than the eye
        // needs once linear-filtered; cap it for GPU headroom.
        simW = Math.min(1600, Math.max(2, Math.round(rect.width)));
        simH = Math.min(1600, Math.max(2, Math.round(rect.height)));
        for (const t of [texRead, texWrite]) if (t) gl.deleteTexture(t);
        for (const f of [fboRead, fboWrite]) if (f) gl.deleteFramebuffer(f);
        const a = makeTarget();
        const b = makeTarget();
        texRead = a.tex;
        fboRead = a.fbo;
        texWrite = b.tex;
        fboWrite = b.fbo;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      };
      allocate();

      const pointer = { x: 0, y: 0, force: 0, radiusPx: 26 };
      // CPU-side amplitude envelope (upper bound on |h|). The loop sleeps
      // only once this decays below the visibility floor, so the plane
      // always dissipates fully instead of freezing mid-wave.
      let peak = 0;
      let lastInput = 0;
      let running = false;
      let raf = 0;

      const step = () => {
        gl.useProgram(simProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texRead);
        gl.uniform1i(sim.state, 0);
        gl.uniform2f(sim.texel, 1 / simW, 1 / simH);
        gl.uniform2f(sim.pointerPx, pointer.x, pointer.y);
        gl.uniform1f(sim.radiusPx, pointer.radiusPx);
        gl.uniform1f(sim.force, pointer.force);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fboWrite);
        gl.viewport(0, 0, simW, simH);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const t = texRead;
        texRead = texWrite;
        texWrite = t;
        const f = fboRead;
        fboRead = fboWrite;
        fboWrite = f;
      };

      const render = () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(renderProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texRead);
        gl.uniform1i(ren.state, 0);
        gl.uniform2f(ren.texel, 1 / simW, 1 / simH);
        gl.uniform2f(ren.fragSize, canvas.width, canvas.height);
        gl.uniform1f(ren.strength, 40.0);
        gl.uniform1f(ren.opacity, opacity);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disable(gl.BLEND);
      };

      const frame = () => {
        raf = 0;
        step();
        step();
        render();
        pointer.force *= 0.5;
        if (pointer.force < 0.004) pointer.force = 0;
        // Decay peak at the same per-step rate as the wave field (0.984)
        // so the CPU envelope stays a faithful upper bound on |h| and the
        // loop never stops while waves are still visibly propagating.
        peak *= 0.984;
        // Keep stepping until the field has visibly dissipated (or a hard
        // 20s safety cap) — never stop on a wall clock with live waves.
        const idle = performance.now() - lastInput;
        if (peak > 0.001 && idle < 20000) {
          raf = requestAnimationFrame(frame);
        } else {
          running = false;
          render();
        }
      };

      const ensureRunning = () => {
        lastInput = performance.now();
        if (!running) {
          running = true;
          raf = requestAnimationFrame(frame);
        }
      };

      const toLocal = (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (x < -48 || y < -48 || x > rect.width + 48 || y > rect.height + 48) return null;
        return { x, y: rect.height - y };
      };

      let lastX = 0;
      let lastY = 0;
      let hasLast = false;
      const onMove = (e: PointerEvent) => {
        const p = toLocal(e);
        if (!p) {
          hasLast = false;
          return;
        }
        let speed = 0;
        if (hasLast) speed = Math.hypot(e.clientX - lastX, e.clientY - lastY);
        lastX = e.clientX;
        lastY = e.clientY;
        hasLast = true;
        pointer.x = p.x;
        pointer.y = p.y;
        pointer.radiusPx = 26;
        pointer.force = Math.min(0.3, Math.max(pointer.force, 0.035 + speed * 0.0045));
        peak = Math.max(peak, pointer.force * 1.5);
        ensureRunning();
      };
      const onDown = (e: PointerEvent) => {
        const p = toLocal(e);
        if (!p) return;
        pointer.x = p.x;
        pointer.y = p.y;
        pointer.radiusPx = 44;
        pointer.force = 0.6;
        peak = Math.max(peak, 0.9);
        ensureRunning();
      };

      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerdown', onDown, { passive: true });
      const ro = new ResizeObserver(() => {
        allocate();
        if (!running) render();
      });
      ro.observe(host);

      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerdown', onDown);
        ro.disconnect();
        for (const t of [texRead, texWrite]) if (t) gl.deleteTexture(t);
        for (const f of [fboRead, fboWrite]) if (f) gl.deleteFramebuffer(f);
        gl.deleteProgram(simProg);
        gl.deleteProgram(renderProg);
      };
    };

    teardown = setup();

    const onLost = (e: Event) => e.preventDefault();
    const onRestored = () => {
      if (teardown) teardown();
      teardown = setup();
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      if (teardown) teardown();
    };
  }, [hostRef, opacity]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
    />
  );
}
