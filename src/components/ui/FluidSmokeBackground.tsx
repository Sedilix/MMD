'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * FluidSmokeBackground
 * 
 * High-Impact WebGL Navier-Stokes Fluid Smoke Simulation:
 * - Strictly bounded below Hero section (absolute positioning, ignores cursor in Hero)
 * - Continuous sub-splat interpolation along cursor motion vectors
 * - High-vorticity curl confinement for dramatic, rolling, turbulent smoke swirls
 * - Volumetric multi-octave FBM wisp shading with rich contrast & pearl-slate highlights
 * - Zero emission when stationary; billows and interacts dynamically when moved
 * - Performance optimized at 256x256 simulation grid with 60fps WebGL execution
 */

const BASE_VERT = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = (a_position + 1.0) * 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// 1. Advection Shader (Velocity & Density Transport)
const ADVECTION_FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_velocity;
uniform sampler2D u_source;
uniform vec2 u_texelSize;
uniform float u_dt;
uniform float u_dissipation;

void main() {
  vec2 vel = texture2D(u_velocity, v_uv).xy;
  vec2 coord = v_uv - vel * u_dt * u_texelSize;
  gl_FragColor = u_dissipation * texture2D(u_source, coord);
}
`;

// 2. Vorticity Confinement Shader (Injects rich turbulent vortices & curling wisps)
const VORTICITY_FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_velocity;
uniform vec2 u_texelSize;
uniform float u_curlStrength;
uniform float u_dt;

void main() {
  float L = texture2D(u_velocity, v_uv - vec2(u_texelSize.x, 0.0)).y;
  float R = texture2D(u_velocity, v_uv + vec2(u_texelSize.x, 0.0)).y;
  float B = texture2D(u_velocity, v_uv - vec2(0.0, u_texelSize.y)).x;
  float T = texture2D(u_velocity, v_uv + vec2(0.0, u_texelSize.y)).x;

  float curl = (R - L) - (T - B);

  // Gradient of curl magnitude
  float cL = abs(texture2D(u_velocity, v_uv - vec2(u_texelSize.x * 2.0, 0.0)).y - L);
  float cR = abs(R - texture2D(u_velocity, v_uv + vec2(u_texelSize.x * 2.0, 0.0)).y);
  float cB = abs(texture2D(u_velocity, v_uv - vec2(0.0, u_texelSize.y * 2.0)).x - B);
  float cT = abs(T - texture2D(u_velocity, v_uv + vec2(0.0, u_texelSize.y * 2.0)).x);

  vec2 force = 0.5 * vec2(cR - cL, cT - cB);
  float len = max(length(force), 0.0001);
  force = (force / len) * curl * u_curlStrength;

  vec2 vel = texture2D(u_velocity, v_uv).xy;
  gl_FragColor = vec4(vel + force * u_dt, 0.0, 1.0);
}
`;

// 3. Splat Shader (Injects impulse from continuous mouse motion)
const SPLAT_FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_target;
uniform float u_aspectRatio;
uniform vec2 u_point;
uniform vec3 u_color;
uniform float u_radius;

void main() {
  vec2 p = v_uv - u_point;
  p.x *= u_aspectRatio;
  vec3 splat = exp(-dot(p, p) / u_radius) * u_color;
  vec3 base = texture2D(u_target, v_uv).xyz;
  gl_FragColor = vec4(base + splat, 1.0);
}
`;

// 4. Display Shader (Volumetric Smoke Lighting, Dynamic FBM Billows & High Contrast)
const DISPLAY_FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_density;
uniform sampler2D u_velocity;
uniform float u_time;

// Procedural Simplex Noise for dynamic smoke wisps
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// 2-Octave FBM for billowy volumetric smoke clouds
float fbm(vec2 p) {
  float f = 0.5 * snoise(p);
  f += 0.25 * snoise(p * 2.1);
  return f;
}

void main() {
  vec3 d = texture2D(u_density, v_uv).rgb;
  float densityVal = max(max(d.r, d.g), d.b);

  if (densityVal < 0.0005) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec2 vel = texture2D(u_velocity, v_uv).xy;
  
  // Turbulent smoke billowing modulation
  float wispNoise = fbm(v_uv * 7.0 + vel * 2.5 + u_time * 0.15);
  float billow = fbm(v_uv * 14.0 - vel * 4.0 + u_time * 0.25);
  
  float modulated = densityVal + (wispNoise * 0.35 + billow * 0.18) * smoothstep(0.01, 0.5, densityVal);
  modulated = max(0.0, modulated);

  // Rich, high-contrast monochrome pearl-smoke grading with subtle iridescent edge
  vec3 deepSmoke = vec3(0.55, 0.62, 0.75); // Slate body
  vec3 midSmoke  = vec3(0.82, 0.88, 0.96); // Luminous pearl core
  vec3 rimHigh   = vec3(0.98, 0.99, 1.0);  // Incandescent white wisp crest

  vec3 col = mix(deepSmoke, midSmoke, smoothstep(0.1, 0.6, modulated));
  col = mix(col, rimHigh, smoothstep(0.6, 1.2, modulated));

  // Volumetric opacity curve with rich presence
  float alpha = smoothstep(0.005, 0.65, modulated) * 0.42;

  gl_FragColor = vec4(col * alpha, alpha);
}
`;

interface FluidSmokeBackgroundProps {
  className?: string;
}

export function FluidSmokeBackground({ className }: FluidSmokeBackgroundProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isVisibleRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return;

    gl.getExtension('OES_texture_float');
    gl.getExtension('OES_texture_half_float');

    const createProgram = (vsSource: string, fsSource: string) => {
      const vs = gl.createShader(gl.VERTEX_SHADER)!;
      gl.shaderSource(vs, vsSource);
      gl.compileShader(vs);

      const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
      gl.shaderSource(fs, fsSource);
      gl.compileShader(fs);

      const program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      return program;
    };

    const advectionProg = createProgram(BASE_VERT, ADVECTION_FRAG);
    const vorticityProg = createProgram(BASE_VERT, VORTICITY_FRAG);
    const splatProg = createProgram(BASE_VERT, SPLAT_FRAG);
    const displayProg = createProgram(BASE_VERT, DISPLAY_FRAG);

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const setupAttributes = (prog: WebGLProgram) => {
      const loc = gl.getAttribLocation(prog, 'a_position');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    };

    const SIM_RES = 256;
    const createDoubleFBO = (w: number, h: number) => {
      const createFBO = () => {
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        const fbo = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return { tex, fbo };
      };

      let read = createFBO();
      let write = createFBO();
      return {
        get read() { return read; },
        get write() { return write; },
        swap() {
          const tmp = read;
          read = write;
          write = tmp;
        }
      };
    };

    let velocityFBO = createDoubleFBO(SIM_RES, SIM_RES);
    let densityFBO = createDoubleFBO(SIM_RES, SIM_RES);

    // Continuous motion queue
    interface MotionSplats {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      dx: number;
      dy: number;
      speed: number;
    }
    const motionQueue: MotionSplats[] = [];
    let prevPointer: { x: number; y: number } | null = null;

    const handlePointerMove = (e: MouseEvent | PointerEvent) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();

      // STRICT BOUNDS CHECK: Ignore cursor if above or outside the container (e.g. in Hero)
      if (e.clientY < rect.top || e.clientY > rect.bottom || e.clientX < rect.left || e.clientX > rect.right) {
        prevPointer = null;
        return;
      }

      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      const normX = clientX / rect.width;
      const normY = 1.0 - (clientY / rect.height); // WebGL Y is inverted

      if (prevPointer) {
        const dx = normX - prevPointer.x;
        const dy = normY - prevPointer.y;
        const speed = Math.hypot(dx, dy);

        if (speed > 0.0004) {
          motionQueue.push({
            x0: prevPointer.x,
            y0: prevPointer.y,
            x1: normX,
            y1: normY,
            dx,
            dy,
            speed,
          });
        }
      }

      prevPointer = { x: normX, y: normY };
    };

    const handlePointerLeave = () => {
      prevPointer = null;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerout', handlePointerLeave, { passive: true });

    const handleResize = () => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.floor(canvas.clientWidth * dpr);
      const height = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    const observer = new IntersectionObserver(([entry]) => {
      isVisibleRef.current = entry.isIntersecting;
    });
    observer.observe(canvas);

    const splat = (
      target: { read: { tex: WebGLTexture }; write: { fbo: WebGLFramebuffer }; swap: () => void },
      point: [number, number],
      color: [number, number, number],
      radius: number
    ) => {
      gl.useProgram(splatProg);
      setupAttributes(splatProg);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.write.fbo);
      gl.viewport(0, 0, SIM_RES, SIM_RES);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, target.read.tex);
      gl.uniform1i(gl.getUniformLocation(splatProg, 'u_target'), 0);

      const aspect = canvas.width / canvas.height;
      gl.uniform1f(gl.getUniformLocation(splatProg, 'u_aspectRatio'), aspect);
      gl.uniform2f(gl.getUniformLocation(splatProg, 'u_point'), point[0], point[1]);
      gl.uniform3f(gl.getUniformLocation(splatProg, 'u_color'), color[0], color[1], color[2]);
      gl.uniform1f(gl.getUniformLocation(splatProg, 'u_radius'), radius);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      target.swap();
    };

    let lastTime = performance.now();
    let animId: number;

    const render = (now: number) => {
      if (isVisibleRef.current && canvas.width > 0 && canvas.height > 0) {
        const dt = Math.min((now - lastTime) / 1000, 0.033);
        lastTime = now;

        // 1. Process Multi-Segment Continuous Motion Splats
        while (motionQueue.length > 0) {
          const item = motionQueue.shift()!;
          const steps = Math.min(Math.max(Math.ceil(item.speed * 80.0), 2), 8);
          const force = Math.min(item.speed * 24.0, 4.2);
          const density = Math.min(item.speed * 38.0, 2.2);

          for (let s = 0; s <= steps; s++) {
            const frac = s / steps;
            const px = item.x0 + (item.x1 - item.x0) * frac;
            const py = item.y0 + (item.y1 - item.y0) * frac;

            // Velocity impulse
            splat(
              velocityFBO,
              [px, py],
              [item.dx * force * 45.0, item.dy * force * 45.0, 0.0],
              0.0028
            );

            // Volumetric density impulse
            splat(
              densityFBO,
              [px, py],
              [density * 0.95, density * 0.98, density * 1.05],
              0.0034
            );
          }
        }

        // 2. High-Turbulence Vorticity Confinement (Rolls smoke into swirling billows)
        gl.useProgram(vorticityProg);
        setupAttributes(vorticityProg);
        gl.bindFramebuffer(gl.FRAMEBUFFER, velocityFBO.write.fbo);
        gl.viewport(0, 0, SIM_RES, SIM_RES);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocityFBO.read.tex);
        gl.uniform1i(gl.getUniformLocation(vorticityProg, 'u_velocity'), 0);
        gl.uniform2f(gl.getUniformLocation(vorticityProg, 'u_texelSize'), 1.0 / SIM_RES, 1.0 / SIM_RES);
        gl.uniform1f(gl.getUniformLocation(vorticityProg, 'u_curlStrength'), 22.0);
        gl.uniform1f(gl.getUniformLocation(vorticityProg, 'u_dt'), dt);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        velocityFBO.swap();

        // 3. Velocity Advection Pass
        gl.useProgram(advectionProg);
        setupAttributes(advectionProg);
        gl.bindFramebuffer(gl.FRAMEBUFFER, velocityFBO.write.fbo);
        gl.viewport(0, 0, SIM_RES, SIM_RES);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocityFBO.read.tex);
        gl.uniform1i(gl.getUniformLocation(advectionProg, 'u_velocity'), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, velocityFBO.read.tex);
        gl.uniform1i(gl.getUniformLocation(advectionProg, 'u_source'), 1);

        gl.uniform2f(gl.getUniformLocation(advectionProg, 'u_texelSize'), 1.0 / SIM_RES, 1.0 / SIM_RES);
        gl.uniform1f(gl.getUniformLocation(advectionProg, 'u_dt'), dt);
        gl.uniform1f(gl.getUniformLocation(advectionProg, 'u_dissipation'), 0.985);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        velocityFBO.swap();

        // 4. Density Smoke Advection Pass
        gl.useProgram(advectionProg);
        setupAttributes(advectionProg);
        gl.bindFramebuffer(gl.FRAMEBUFFER, densityFBO.write.fbo);
        gl.viewport(0, 0, SIM_RES, SIM_RES);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocityFBO.read.tex);
        gl.uniform1i(gl.getUniformLocation(advectionProg, 'u_velocity'), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, densityFBO.read.tex);
        gl.uniform1i(gl.getUniformLocation(advectionProg, 'u_source'), 1);

        gl.uniform2f(gl.getUniformLocation(advectionProg, 'u_texelSize'), 1.0 / SIM_RES, 1.0 / SIM_RES);
        gl.uniform1f(gl.getUniformLocation(advectionProg, 'u_dt'), dt);
        gl.uniform1f(gl.getUniformLocation(advectionProg, 'u_dissipation'), 0.978);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        densityFBO.swap();

        // 5. Final Full-Screen Display Pass
        gl.useProgram(displayProg);
        setupAttributes(displayProg);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, densityFBO.read.tex);
        gl.uniform1i(gl.getUniformLocation(displayProg, 'u_density'), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, velocityFBO.read.tex);
        gl.uniform1i(gl.getUniformLocation(displayProg, 'u_velocity'), 1);

        gl.uniform1f(gl.getUniformLocation(displayProg, 'u_time'), now * 0.001);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      observer.disconnect();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerout', handlePointerLeave);
      window.removeEventListener('resize', handleResize);
      if (animId) cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div ref={containerRef} className={cn('pointer-events-none absolute inset-0 w-full h-full z-0 overflow-hidden', className)}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block opacity-95 transition-opacity duration-700"
      />
    </div>
  );
}
