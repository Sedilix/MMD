import * as THREE from 'three';

/**
 * GPU wave field for the jelly wall.
 *
 * The previous ripple was an analytic decaying sine evaluated per vertex: a
 * shape that looks like a wave without being one. Nothing propagated, nothing
 * reflected off the tile edges, and two disturbances could not interfere,
 * because each vertex simply evaluated a formula against a timestamp.
 *
 * This integrates the actual 2D wave equation instead,
 *
 *     d2h/dt2 = c^2 * laplacian(h)
 *
 * discretised explicitly and stepped on the GPU by ping-ponging two render
 * targets holding h(t) and h(t-1). Ripples therefore travel outward at a finite
 * speed, bounce off the rim, cross each other and add up, and ring down through
 * damping rather than on a scripted timer.
 *
 * All tiles share one texture, split into a grid of cells with one cell per
 * tile. Neighbour samples are clamped inside the owning cell, which is both the
 * thing that keeps one tile's ripple out of the next tile and, physically, a
 * reflecting (Neumann) boundary — so the rim bounces waves back for free.
 */

const SIM_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SIM_FRAGMENT = `
precision highp float;

uniform sampler2D uPrev;      // h(t - dt)
uniform sampler2D uCurr;      // h(t)
uniform vec2 uResolution;     // atlas size, px
uniform vec2 uCells;          // cells across, down (one per tile)
uniform float uSpeed;         // (c*dt/dx)^2 — must stay <= 0.5 to remain stable
uniform float uDamping;
uniform vec4 uPress;          // xy = atlas uv, z = held depth, w = radius (cell-local)
uniform float uPressActive;

varying vec2 vUv;

/**
 * Clamp a neighbour sample into the cell that owns this fragment. Sampling past
 * the cell edge would read the adjacent tile's field; clamping instead mirrors
 * the boundary value, which is exactly a reflecting wall, so a ripple that
 * reaches the rim comes back rather than leaking away.
 */
vec2 cellClamp(vec2 uv, vec2 target) {
  vec2 texel = 1.0 / uResolution;
  vec2 idx = floor(uv * uCells);
  vec2 lo = idx / uCells + 0.5 * texel;
  vec2 hi = (idx + 1.0) / uCells - 0.5 * texel;
  return clamp(target, lo, hi);
}

void main() {
  vec2 texel = 1.0 / uResolution;

  float hC = texture2D(uCurr, vUv).r;
  float hP = texture2D(uPrev, vUv).r;

  float hL = texture2D(uCurr, cellClamp(vUv, vUv - vec2(texel.x, 0.0))).r;
  float hR = texture2D(uCurr, cellClamp(vUv, vUv + vec2(texel.x, 0.0))).r;
  float hD = texture2D(uCurr, cellClamp(vUv, vUv - vec2(0.0, texel.y))).r;
  float hU = texture2D(uCurr, cellClamp(vUv, vUv + vec2(0.0, texel.y))).r;

  // Explicit second-order step: the new height depends on the two previous
  // states, which is what carries momentum and lets a crest overshoot and
  // rebound instead of just relaxing back.
  float lap = hL + hR + hD + hU - 4.0 * hC;
  float h = (2.0 * hC - hP + uSpeed * lap) * uDamping;

  // The cursor rests on the surface and holds it down. This is a soft
  // constraint pulling h toward a target depth, not another impulse: repeated
  // impulses radiate away as fast as they are added and leave the surface
  // nearly flat, which is a touch rather than a weight. Easing toward a held
  // depth keeps the dent for as long as the cursor is there, and releasing it
  // lets the surface spring back and shed a ripple on its own.
  if (uPressActive > 0.5) {
    vec2 fragCell = floor(vUv * uCells);
    vec2 pressCell = floor(uPress.xy * uCells);
    if (all(equal(fragCell, pressCell))) {
      vec2 cellUv = vUv * uCells - fragCell;
      vec2 pressUv = uPress.xy * uCells - pressCell;
      float d = distance(cellUv, pressUv);
      float w = exp(-(d * d) / max(uPress.w * uPress.w, 1e-6));
      h = mix(h, uPress.z, clamp(w * 0.30, 0.0, 1.0));
    }
  }

  gl_FragColor = vec4(h, 0.0, 0.0, 1.0);
}
`;


/**
 * Injection pass. Copies one state and adds the strike to it.
 *
 * This is deliberately applied to BOTH h(t) and h(t-1). Adding a bump to the
 * current state alone leaves h(t) - h(t-1) equal to the bump, and the wave
 * equation reads that difference as velocity: the surface then accelerates
 * every step instead of being released from rest, and a 0.85 tap measured a
 * peak of 8.4 within ten steps. Displacing both states gives zero initial
 * velocity, which is what striking a surface actually does.
 */
const INJECT_FRAGMENT = `
precision highp float;

uniform sampler2D uSrc;
uniform vec2 uCells;
uniform vec4 uImpulses[4];    // xy = atlas uv, z = amplitude, w = radius
uniform int uImpulseCount;

varying vec2 vUv;

void main() {
  float h = texture2D(uSrc, vUv).r;

  vec2 fragCell = floor(vUv * uCells);
  // Cell-local coordinates. The atlas is far wider than it is tall, so a
  // radius measured in atlas uv would draw an ellipse; within a square cell it
  // is a circle again.
  vec2 cellUv = vUv * uCells - fragCell;

  for (int i = 0; i < 4; i++) {
    if (i >= uImpulseCount) break;
    vec4 imp = uImpulses[i];
    vec2 impCell = floor(imp.xy * uCells);
    // A strike belongs to one tile; without this the gaussian tail would splash
    // into the neighbouring card.
    if (all(equal(fragCell, impCell))) {
      vec2 impCellUv = imp.xy * uCells - impCell;
      float d = distance(cellUv, impCellUv);
      h += imp.z * exp(-(d * d) / max(imp.w * imp.w, 1e-6));
    }
  }

  gl_FragColor = vec4(h, 0.0, 0.0, 1.0);
}
`;

export interface JellyWaveImpulse {
  /** Column of the tile being struck. */
  col: number;
  /** Row of the tile being struck. */
  row: number;
  /** Hit position in the tile's own 0..1 space. */
  u: number;
  v: number;
  /** Signed height added at the centre of the strike. */
  amplitude: number;
  /** Gaussian radius, in cell-local units (1.0 = the whole tile). */
  radius: number;
}

export class JellyWaveField {
  readonly texture: THREE.Texture;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly cells: THREE.Vector2;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;
  private pool: THREE.WebGLRenderTarget[];
  private prevRT: THREE.WebGLRenderTarget;
  private currRT: THREE.WebGLRenderTarget;
  private readonly injectMaterial: THREE.ShaderMaterial;
  private pending: JellyWaveImpulse[] = [];
  private disposed = false;

  constructor(
    renderer: THREE.WebGLRenderer,
    cols: number,
    rows: number,
    cellResolution = 64,
  ) {
    this.renderer = renderer;
    this.cells = new THREE.Vector2(cols, rows);

    const width = cols * cellResolution;
    const height = rows * cellResolution;

    // Half float is the broadly supported renderable float format. Full float
    // needs EXT_color_buffer_float, which is not universal, and the heights
    // here sit in roughly -1..1 where half float precision is ample.
    const type = renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.HalfFloatType;
    const options: THREE.RenderTargetOptions = {
      type,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    };

    // A pool rather than a fixed ping-pong pair. Every pass reads one or two
    // states and must write somewhere neither of them occupies, since reading
    // and writing one texture in a single draw is undefined in WebGL. Four
    // buffers means a free target always exists: the step reads h(t-1) and
    // h(t), and injection reads each of those in turn.
    this.pool = [
      new THREE.WebGLRenderTarget(width, height, options),
      new THREE.WebGLRenderTarget(width, height, options),
      new THREE.WebGLRenderTarget(width, height, options),
      new THREE.WebGLRenderTarget(width, height, options),
    ];
    this.prevRT = this.pool[0];
    this.currRT = this.pool[1];

    this.material = new THREE.ShaderMaterial({
      vertexShader: SIM_VERTEX,
      fragmentShader: SIM_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPrev: { value: this.prevRT.texture },
        uCurr: { value: this.currRT.texture },
        uResolution: { value: new THREE.Vector2(width, height) },
        uCells: { value: this.cells.clone() },
        // 0.25 keeps the explicit scheme comfortably inside its stability limit
        // of 0.5; above that the field diverges into noise within a few frames.
        uSpeed: { value: 0.25 },
        // Jelly settles fast; water does not. At 0.992 the surface was still
        // ringing at roughly 40% two seconds after the cursor lifted, which
        // reads as liquid. This decays to about a quarter within a second, so
        // the tile springs back and is done.
        uDamping: { value: 0.978 },
        uPress: { value: new THREE.Vector4(0, 0, 0, 0.2) },
        uPressActive: { value: 0 },
        uImpulses: {
          value: [
            new THREE.Vector4(),
            new THREE.Vector4(),
            new THREE.Vector4(),
            new THREE.Vector4(),
          ],
        },
        uImpulseCount: { value: 0 },
      },
    });

    this.injectMaterial = new THREE.ShaderMaterial({
      vertexShader: SIM_VERTEX,
      fragmentShader: INJECT_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uSrc: { value: null },
        uCells: { value: this.cells.clone() },
        uImpulses: {
          value: [
            new THREE.Vector4(),
            new THREE.Vector4(),
            new THREE.Vector4(),
            new THREE.Vector4(),
          ],
        },
        uImpulseCount: { value: 0 },
      },
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene.add(this.quad);

    this.clear();
    this.texture = this.currRT.texture;
  }

  /** Zero both states so the field starts flat rather than with GPU garbage. */
  private clear() {
    const prevTarget = this.renderer.getRenderTarget();
    const prevClear = new THREE.Color();
    this.renderer.getClearColor(prevClear);
    const prevAlpha = this.renderer.getClearAlpha();

    this.renderer.setClearColor(0x000000, 1);
    for (const t of this.pool) {
      this.renderer.setRenderTarget(t);
      this.renderer.clear(true, false, false);
    }
    this.renderer.setRenderTarget(prevTarget);
    this.renderer.setClearColor(prevClear, prevAlpha);
  }

  /**
   * Hold the surface down at a point, as a resting cursor would. Call every
   * frame the contact persists; call clearPress() when it lifts.
   */
  setPress(col: number, row: number, u: number, v: number, depth: number, radius: number) {
    const p = this.material.uniforms.uPress.value as THREE.Vector4;
    p.set(
      (col + THREE.MathUtils.clamp(u, 0, 1)) / this.cells.x,
      (row + THREE.MathUtils.clamp(v, 0, 1)) / this.cells.y,
      depth,
      radius,
    );
    this.material.uniforms.uPressActive.value = 1;
  }

  /** Lift the cursor; the dent springs back on its own. */
  clearPress() {
    this.material.uniforms.uPressActive.value = 0;
  }

  /** Queue a strike. Applied on the next step, up to four per step. */
  addImpulse(imp: JellyWaveImpulse) {
    if (this.pending.length >= 4) return;
    this.pending.push(imp);
  }

  /** A pool buffer that is neither of the states currently being read. */
  private freeTarget(...inUse: THREE.WebGLRenderTarget[]): THREE.WebGLRenderTarget {
    const t = this.pool.find(p => !inUse.includes(p));
    if (!t) throw new Error('JellyWaveField: no free render target');
    return t;
  }

  private draw(material: THREE.ShaderMaterial, dest: THREE.WebGLRenderTarget) {
    this.quad.material = material;
    const restore = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(dest);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(restore);
  }

  /** Advance the simulation one step and publish the new state. */
  step() {
    if (this.disposed) return;

    if (this.pending.length > 0) {
      const u = this.injectMaterial.uniforms;
      const arr = u.uImpulses.value as THREE.Vector4[];
      for (let i = 0; i < 4; i++) {
        const imp = this.pending[i];
        if (imp) {
          arr[i].set(
            (imp.col + THREE.MathUtils.clamp(imp.u, 0, 1)) / this.cells.x,
            (imp.row + THREE.MathUtils.clamp(imp.v, 0, 1)) / this.cells.y,
            imp.amplitude,
            imp.radius,
          );
        } else {
          arr[i].set(0, 0, 0, 1);
        }
      }
      u.uImpulseCount.value = Math.min(this.pending.length, 4);

      // Displace both states by the same bump so the surface starts from rest.
      const newPrev = this.freeTarget(this.prevRT, this.currRT);
      u.uSrc.value = this.prevRT.texture;
      this.draw(this.injectMaterial, newPrev);

      const newCurr = this.freeTarget(this.prevRT, this.currRT, newPrev);
      u.uSrc.value = this.currRT.texture;
      this.draw(this.injectMaterial, newCurr);

      this.prevRT = newPrev;
      this.currRT = newCurr;
    }
    this.pending.length = 0;

    const su = this.material.uniforms;
    su.uPrev.value = this.prevRT.texture;
    su.uCurr.value = this.currRT.texture;

    const next = this.freeTarget(this.prevRT, this.currRT);
    this.draw(this.material, next);

    // h(t) ages into h(t-1); the freshly written buffer becomes h(t).
    this.prevRT = this.currRT;
    this.currRT = next;
    (this as { texture: THREE.Texture }).texture = next.texture;
  }

  /** The live height texture for this step. */
  get current(): THREE.Texture {
    return this.currRT.texture;
  }

  /** One texel of the atlas, in uv. Vertex shaders need it to take gradients. */
  get texelSize(): THREE.Vector2 {
    const res = this.material.uniforms.uResolution.value as THREE.Vector2;
    return new THREE.Vector2(1 / res.x, 1 / res.y);
  }

  dispose() {
    this.disposed = true;
    this.pool.forEach(t => t.dispose());
    this.quad.geometry.dispose();
    this.material.dispose();
    this.injectMaterial.dispose();
  }
}
