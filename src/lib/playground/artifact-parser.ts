/**
 * artifact-parser.ts
 *
 * Scans a raw markdown/text string for fenced code blocks that are
 * renderable as live previews (html, jsx, tsx, react).
 *
 * Returns an array of detected artifacts in order of appearance,
 * each with the language tag and the raw code string.
 */

export type ArtifactType = 'html' | 'react' | 'python';

export interface DetectedArtifact {
    /** Normalized type for the renderer */
    type: ArtifactType;
    /** The raw source code inside the fence */
    code: string;
    /** Original language tag from the fence e.g. "jsx", "html", "python" */
    lang: string;
}

const FENCE_RE = /```(html|jsx|tsx|react|python|py)[ \t]*\r?\n([\s\S]*?)```/gi;

export function detectArtifacts(text: string): DetectedArtifact[] {
    const results: DetectedArtifact[] = [];
    let match: RegExpExecArray | null;
    while ((match = FENCE_RE.exec(text)) !== null) {
        const lang = match[1].toLowerCase();
        const code = match[2].trimEnd();
        if (!code) continue;
        results.push({ type: artifactTypeForLang(lang), code, lang });
    }
    // Reset stateful regex
    FENCE_RE.lastIndex = 0;
    return results;
}

/**
 * Map a fence language tag to the normalized artifact type the sandbox
 * renderer understands.
 */
export function artifactTypeForLang(lang: string): ArtifactType {
    const l = lang.toLowerCase();
    if (l === 'python' || l === 'py') return 'python';
    if (l === 'html') return 'html';
    return 'react';
}

/**
 * Models sometimes split a multi-file project across several adjacent fences
 * despite the Build-mode single-fence contract. When consecutive renderable
 * fences are separated only by whitespace or a short markdown heading, merge
 * them into ONE artifact so the preview sees the whole project. Returns null
 * when fences are genuinely distinct (prose between them, mixed families) —
 * callers then fall back to per-block preview buttons.
 */
export function mergeArtifactBlocks(text: string): DetectedArtifact | null {
    const re = /```(html|jsx|tsx|react|python|py)[ \t]*\r?\n([\s\S]*?)```/gi;
    interface Block { lang: string; code: string; end: number; }
    const blocks: Block[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const code = m[2].trimEnd();
        if (code) {
            blocks.push({ lang: m[1].toLowerCase(), code, end: m.index + m[0].length });
        }
    }
    if (blocks.length === 0) return null;
    if (blocks.length === 1) {
        return { type: artifactTypeForLang(blocks[0].lang), code: blocks[0].code, lang: blocks[0].lang };
    }
    let code = blocks[0].code;
    let prevEnd = blocks[0].end;
    let type = artifactTypeForLang(blocks[0].lang);
    for (let i = 1; i < blocks.length; i++) {
        const gap = text.slice(prevEnd, text.indexOf('```', prevEnd)).trim();
        const sameFamily = artifactTypeForLang(blocks[i].lang) === type;
        const onlyHeading = /^#{1,6}[^\n]{0,80}$/.test(gap);
        if (!sameFamily || (gap !== '' && !onlyHeading)) return null;
        code = `${code}\n\n${blocks[i].code}`;
        prevEnd = blocks[i].end;
    }
    return { type, code, lang: blocks[0].lang };
}

export interface VfsFile {
    path: string;
    content: string;
}

/**
 * A VFS file plus its character offsets inside `artifact.code`, so an editor
 * can jump the caret to a file's section without re-scanning.
 */
export interface VfsSpan extends VfsFile {
    /** Inclusive char offset of this file's content in artifact.code. */
    start: number;
    /** Exclusive char offset. */
    end: number;
}

export function buildFileSpans(artifact: DetectedArtifact): VfsSpan[] {
    const raw = artifact.code;
    const fileDelimiter = /(?:\/\/\s*(?:file:?|---)\s*([a-zA-Z0-9_\-\.\/]+)|(?:\/\*+|\#)\s*file:\s*([a-zA-Z0-9_\-\.\/]+))/gi;
    const files: VfsSpan[] = [];
    let lastIndex = 0;
    let currentPath = artifact.type === 'python' ? 'main.py' : artifact.type === 'html' ? 'index.html' : 'App.tsx';
    let match: RegExpExecArray | null;

    while ((match = fileDelimiter.exec(raw)) !== null) {
        const content = raw.slice(lastIndex, match.index).trim();
        if (content) {
            files.push({ path: currentPath, content, start: lastIndex, end: match.index });
        }
        currentPath = match[1] || match[2] || 'component.tsx';
        lastIndex = match.index + match[0].length;
    }

    const remaining = raw.slice(lastIndex).trim();
    if (remaining) {
        files.push({ path: currentPath, content: remaining, start: lastIndex, end: raw.length });
    }

    if (files.length === 0) {
        files.push({ path: currentPath, content: raw, start: 0, end: raw.length });
    }

    return files;
}

export function buildFileTree(artifact: DetectedArtifact): VfsFile[] {
    return buildFileSpans(artifact).map(({ path, content }) => ({ path, content }));
}

/**
 * Full project view of an artifact for the ZIP export: the parsed VFS plus
 * generated scaffolding the model didn't emit (package.json for React apps,
 * .env.example derived from `process.env.*` references).
 */
export interface ProjectExport {
    files: VfsFile[];
    entryPath: string;
}

function scaffoldPackageJson(): string {
    return JSON.stringify({
        name: 'cybrdeck-prototype',
        private: true,
        version: '0.1.0',
        type: 'module',
        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
        devDependencies: { vite: '^5.4.0', '@vitejs/plugin-react': '^4.3.0', tailwindcss: '^3.4.0' },
    }, null, 2) + '\n';
}

export function buildProjectExport(artifact: DetectedArtifact): ProjectExport {
    const files = [...buildFileTree(artifact)];
    const has = (p: string) => files.some((f) => f.path.toLowerCase() === p.toLowerCase());

    if (artifact.type === 'react' && !has('package.json')) {
        files.push({ path: 'package.json', content: scaffoldPackageJson() });
    }
    if (!has('.env.example')) {
        const vars = [...new Set(
            [...artifact.code.matchAll(/\bprocess\.env\.([A-Z_][A-Z0-9_]*)/g)].map((m) => m[1]),
        )];
        if (vars.length > 0) {
            files.push({ path: '.env.example', content: vars.map((v) => `${v}=`).join('\n') + '\n' });
        }
    }

    const defaultEntry = artifact.type === 'python' ? 'main.py' : artifact.type === 'html' ? 'index.html' : 'App.tsx';
    const entry = files.find((f) => f.path.toLowerCase() === defaultEntry.toLowerCase()) ?? files[0];
    return { files, entryPath: entry?.path ?? defaultEntry };
}

/**
 * Build the iframe srcdoc HTML for a sandboxed preview.
 *
 * HTML mode: direct pass-through with Tailwind CDN injected.
 * React mode: wraps user JSX in a Babel + React runtime page.
 */
export function buildSandboxDoc(artifact: DetectedArtifact): string {
    const tailwindScript = `<script src="https://cdn.tailwindcss.com"><\/script>`;

    const files = buildFileTree(artifact);
    // Only executable source enters the sandbox: package.json, .env.example,
    // READMEs and other project furniture exist for the ZIP export, never for
    // eval — concatenating them into the JS payload would be a syntax error.
    const runnableExt = artifact.type === 'html' ? /\.html?$/i
        : artifact.type === 'python' ? /\.py$/i
        : /\.(tsx|jsx|ts|js)$/i;
    let runnable = files.filter((f) => runnableExt.test(f.path));
    if (runnable.length === 0) runnable = files.slice(0, 1);
    if (artifact.type === 'html') runnable = runnable.slice(0, 1);
    const combinedRawCode = runnable.map((f) => f.content).join('\n\n');

    const sanitizedCode = combinedRawCode
        .replace(/import\s+\{([\s\S]*?)\}\s+from\s+['"]lucide-react['"];?/g, (_m, icons) => {
            const list = icons.split(',').map((i: string) => i.trim().split(' as ')[0]).filter(Boolean).join(', ');
            return `const { ${list} } = LucideIcons;`;
        })
        .replace(/import\s+\{([\s\S]*?)\}\s+from\s+['"]framer-motion['"];?/g, (_m, items) => {
            const list = items.split(',').map((i: string) => i.trim().split(' as ')[0]).filter(Boolean).join(', ');
            return `const { ${list} } = window.FramerMotion || { motion: window.MotionProxy, AnimatePresence: React.Fragment };`;
        })
        .replace(/import\s+\{([\s\S]*?)\}\s+from\s+['"]recharts['"];?/g, (_m, items) => {
            const list = items.split(',').map((i: string) => i.trim().split(' as ')[0]).filter(Boolean).join(', ');
            return `const { ${list} } = window.Recharts || {};`;
        })
        .replace(/import\s+[\s\S]*?\s+from\s+['"]react['"];?/g, 'const { useState, useEffect, useRef, useCallback, useMemo } = React;')
        .replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '')
        .replace(/export\s+default\s+function\s+([A-Za-z0-9_]+)/g, 'function $1')
        .replace(/export\s+default\s+class\s+([A-Za-z0-9_]+)/g, 'class $1')
        .replace(/export\s+default\s+const\s+([A-Za-z0-9_]+)/g, 'const $1')
        .replace(/export\s+default\s+/g, 'const App = ');

    if (artifact.type === 'python') {
        // Multi-file python projects still run as one script: `# file:` markers
        // are comments, so concatenation is safe — but we must use the filtered
        // `combinedRawCode` (never the raw artifact, which would include
        // non-python project furniture if the model emits any).
        const pythonSource = combinedRawCode || artifact.code;
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js"><\/script>
  <style>
    body { background: #090d16; color: #f3f4f6; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; padding: 1.25rem; margin: 0; min-height: 100dvh; font-size: 12px; box-sizing: border-box; }
    #status { display: flex; items-center; gap: 0.5rem; color: #38bdf8; font-weight: 600; padding: 0.5rem 0.75rem; background: #031d24; border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 0.5rem; margin-bottom: 1rem; font-size: 11px; }
    #output { white-space: pre-wrap; word-break: break-word; line-height: 1.6; }
    .log-line { padding: 0.25rem 0; border-bottom: 1px solid rgba(255,255,255,0.05); color: #e2e8f0; }
    .err-line { padding: 0.25rem 0; color: #f87171; background: rgba(239, 68, 68, 0.1); border-left: 2px solid #ef4444; padding-left: 0.5rem; }
  </style>
</head>
<body>
  <div id="status">
    <span style="width:8px;height:8px;border-radius:50%;background:#38bdf8;animation:ping 1s infinite;" />
    <span>Initializing WebAssembly Python 3.11 Engine...</span>
  </div>
  <div id="output"></div>
  <script>
    async function runPythonScript() {
      const status = document.getElementById('status');
      const output = document.getElementById('output');
      try {
        const pyodide = await loadPyodide({
          stdout: function(text) {
            const line = document.createElement('div');
            line.className = 'log-line';
            line.innerText = text;
            output.appendChild(line);
            window.parent.postMessage({ type: 'PREVIEW_CONSOLE', level: 'info', text: text }, '*');
          },
          stderr: function(text) {
            const line = document.createElement('div');
            line.className = 'err-line';
            line.innerText = text;
            output.appendChild(line);
            window.parent.postMessage({ type: 'PREVIEW_CONSOLE', level: 'error', text: text }, '*');
          }
        });

        status.innerHTML = '<span style="color:#10b981;">✓</span> Python 3.11 WebAssembly Engine Ready. Executing script...';
        await pyodide.runPythonAsync(${JSON.stringify(pythonSource)});
        status.innerHTML = '<span style="color:#10b981;">✓</span> Script Execution Completed Successfully.';
      } catch(err) {
        status.innerHTML = '<span style="color:#ef4444;">❌</span> Script Execution Error';
        const line = document.createElement('div');
        line.className = 'err-line';
        line.innerText = err.message;
        output.appendChild(line);
        window.parent.postMessage({ type: 'PREVIEW_CONSOLE', level: 'error', text: err.message }, '*');
      }
    }
    runPythonScript();
  <\/script>
</body>
</html>`;
    }

    if (artifact.type === 'html') {
        // Inject Tailwind into existing HTML if it doesn't have it already.
        // Render the first runnable file, not the raw artifact: when the model
        // emits `<!-- file: -->` style markers or extra furniture, they would
        // otherwise leak into the page as literal text.
        let htmlDoc = runnable[0]?.content ?? artifact.code;
        if (htmlDoc.includes('<!DOCTYPE') || htmlDoc.includes('<html')) {
            htmlDoc = htmlDoc.includes('tailwindcss')
                ? htmlDoc
                : htmlDoc.replace('</head>', `${tailwindScript}\n</head>`);
        } else {
            htmlDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${tailwindScript}
  <style>
    body { margin: 0; padding: 0; }
  </style>
</head>
<body>
${htmlDoc}
</body>
</html>`;
        }

        // Inject console logger bridge
        const consoleBridge = `<script>
          window.addEventListener('error', function(e) {
            window.parent.postMessage({ type: 'PREVIEW_CONSOLE', level: 'error', text: e.message || 'Script error' }, '*');
          });
          ['log', 'info', 'warn', 'error'].forEach(function(m) {
            const orig = console[m];
            console[m] = function() {
              orig.apply(console, arguments);
              var args = Array.prototype.slice.call(arguments);
              var text = args.map(function(a) { return typeof a === 'object' ? JSON.stringify(a) : String(a); }).join(' ');
              window.parent.postMessage({ type: 'PREVIEW_CONSOLE', level: m, text: text }, '*');
            };
          });
        <\/script>`;

        return htmlDoc.replace('<head>', `<head>\n${consoleBridge}`);
    }

    // React / JSX mode — inject Babel, React, Lucide, Framer Motion, Recharts, Firebase, Supabase
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${tailwindScript}
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
  <script src="https://unpkg.com/prop-types@15.8.1/prop-types.min.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <script src="https://unpkg.com/lucide@latest"><\/script>
  <script src="https://unpkg.com/framer-motion@10.16.4/dist/framer-motion.js"><\/script>
  <script src="https://unpkg.com/recharts@2.10.3/umd/Recharts.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"><\/script>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"><\/script>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js"><\/script>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js"><\/script>
  <script>
    /* Global PropTypes fallback shim so UMD components like Recharts never fail on missing PropTypes */
    if (typeof window.PropTypes === 'undefined') {
      var dummyFn = function() {};
      dummyFn.isRequired = dummyFn;
      window.PropTypes = new Proxy({}, { get: function() { return dummyFn; } });
    }

    /* Console logger bridge for parent frame diagnostics */
    window.addEventListener('error', function(e) {
      window.parent.postMessage({ type: 'PREVIEW_CONSOLE', level: 'error', text: e.message || 'Script error' }, '*');
    });
    ['log', 'info', 'warn', 'error'].forEach(function(m) {
      const orig = console[m];
      console[m] = function() {
        orig.apply(console, arguments);
        var args = Array.prototype.slice.call(arguments);
        var text = args.map(function(a) { return typeof a === 'object' ? JSON.stringify(a) : String(a); }).join(' ');
        window.parent.postMessage({ type: 'PREVIEW_CONSOLE', level: m, text: text }, '*');
      };
    });

    /* Motion component fallback */
    window.MotionProxy = new Proxy({}, {
      get: function(_t, tag) {
        return function MotionTag(props) {
          return React.createElement(tag || 'div', props);
        };
      }
    });

    /* Safe localStorage & sessionStorage in-memory fallback polyfill */
    (function() {
      function createInMemoryStorage() {
        var store = {};
        return {
          getItem: function(k) { return store.hasOwnProperty(k) ? store[k] : null; },
          setItem: function(k, v) { store[k] = String(v); },
          removeItem: function(k) { delete store[k]; },
          clear: function() { store = {}; },
          key: function(i) { return Object.keys(store)[i] || null; },
          get length() { return Object.keys(store).length; }
        };
      }
      try {
        var testKey = '__cd_test_ls__';
        window.localStorage.setItem(testKey, '1');
        window.localStorage.removeItem(testKey);
      } catch(e) {
        try { Object.defineProperty(window, 'localStorage', { value: createInMemoryStorage(), writable: true }); } catch(_err) {}
      }
      try {
        var testKeyS = '__cd_test_ss__';
        window.sessionStorage.setItem(testKeyS, '1');
        window.sessionStorage.removeItem(testKeyS);
      } catch(e) {
        try { Object.defineProperty(window, 'sessionStorage', { value: createInMemoryStorage(), writable: true }); } catch(_err2) {}
      }
    })();

    /* Make React hooks, Supabase & Firebase available globally */
    window.useState = React.useState;
    window.useEffect = React.useEffect;
    window.useRef = React.useRef;
    window.useCallback = React.useCallback;
    window.useMemo = React.useMemo;

    /* Dynamic Lucide Icon Proxy for destructured lucide-react imports e.g. <CheckCircle />, <BarChart3 /> */
    window.LucideIcons = new Proxy({}, {
      get: function(_target, prop) {
        if (typeof prop !== 'string') return undefined;
        return function LucideIconWrapper(props) {
          var iconName = prop.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
          return React.createElement('span', {
            className: 'inline-flex items-center justify-center ' + (props.className || ''),
            style: props.style,
            title: props.title
          }, React.createElement('i', { 'data-lucide': iconName }));
        };
      }
    });

    // Demo Firebase Config fallback if user code calls firebase.initializeApp without params
    window.firebaseConfig = {
      apiKey: "demo-api-key",
      authDomain: "demo-app.firebaseapp.com",
      projectId: "demo-app",
      storageBucket: "demo-app.appspot.com",
      messagingSenderId: "123456789",
      appId: "1:123456789:web:demo"
    };
    if (typeof firebase !== 'undefined' && !firebase.apps.length) {
      try { firebase.initializeApp(window.firebaseConfig); } catch(e) {}
    }
  <\/script>
  <style>
    html, body { margin: 0; padding: 0; min-height: 100dvh; font-family: system-ui, -apple-system, sans-serif; }
    #root { min-height: 100dvh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-presets="react,typescript">
    try {
      ${sanitizedCode}

      // Auto-detect exported component: App > Main > Dashboard > Prototype > Page > LandingPage > last declared component
      let _component = null;
      if (typeof App !== 'undefined') _component = App;
      else if (typeof Main !== 'undefined') _component = Main;
      else if (typeof Dashboard !== 'undefined') _component = Dashboard;
      else if (typeof Prototype !== 'undefined') _component = Prototype;
      else if (typeof Page !== 'undefined') _component = Page;
      else if (typeof LandingPage !== 'undefined') _component = LandingPage;

      if (!_component) {
        // Fallback: search global scope for declared uppercase function component
        const _declared = [];
        for (const k in window) {
          if (typeof window[k] === 'function' && /^[A-Z]/.test(k) && !['React', 'ReactDOM', 'Babel', 'LucideIconWrapper'].includes(k)) {
            _declared.push(window[k]);
          }
        }
        if (_declared.length > 0) {
          _component = _declared[_declared.length - 1];
        }
      }

      const _root = document.getElementById('root');
      if (_component) {
        ReactDOM.createRoot(_root).render(React.createElement(_component));
        if (typeof lucide !== 'undefined') {
          setTimeout(function() { lucide.createIcons(); }, 150);
        }
      } else {
        _root.innerHTML = '<div style="padding:2rem;font-family:system-ui,sans-serif;color:#ef4444;background:#18181b;min-height:100dvh;">' +
          '<h3 style="margin:0 0 0.5rem 0;font-size:16px;">Preview Ready</h3>' +
          '<p style="margin:0;font-size:13px;color:#a1a1aa;">No component detected. Make sure your component is defined as <code>function App()</code> or <code>export default App</code>.</p>' +
          '</div>';
      }
    } catch(e) {
      window.parent.postMessage({ type: 'PREVIEW_CONSOLE', level: 'error', text: e.message }, '*');
      document.getElementById('root').innerHTML = '<div style="padding:1.5rem;font-family:monospace;color:#f87171;background:#090d16;min-height:100dvh;font-size:12px;">' +
        '<div style="font-weight:bold;margin-bottom:0.5rem;color:#ef4444;">Runtime Error</div>' +
        '<div>' + e.message + '</div>' +
        '</div>';
    }
  <\/script>
</body>
</html>`;
}
