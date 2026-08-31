/* ════════════════════════════════════════════════════════════════════
   Playground showcase — interaction layer, standalone port.

   Ports the CybrDeck website's showcase behaviours with zero
   dependencies: synonym scramble, Okazz generative tile canvas,
   deflecting 3-D card tilt, the pointer-tracked crystal light field,
   and a release tree that reads this repo's own GitHub releases — so
   the page is always current with whatever CI last published.

   Motion is gated behind prefers-reduced-motion.
   ════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var REPO = 'Sedilix/MMD';
  var GH_HEADERS = { accept: 'application/vnd.github+json' };

  /* ── Synonym scramble ──────────────────────────────────────────── */

  var SYNONYMS = [
    'hallucinations.',
    'fabrications.',
    'confabulations.',
    'blind spots.',
    'AI slop.',
    'delusions.',
    'reasoning drift.',
  ];
  var GLYPHS = '01#$X_!%&*?+=/[]{}';

  function initScramble() {
    var el = document.getElementById('scramble-word');
    if (!el) return;
    var idx = 0;

    function scrambleTo(target, done) {
      var progress = 0;
      var interval = setInterval(function () {
        progress += 1;
        var decoded = Math.floor(progress / 2);
        var out = target
          .split('')
          .map(function (ch, i) {
            if (i < decoded) return target[i];
            if (ch === '.' || ch === ' ') return ch;
            return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          })
          .join('');
        el.textContent = out;
        if (decoded >= target.length) {
          clearInterval(interval);
          el.textContent = target;
          if (done) done();
        }
      }, 35);
    }

    function cycle() {
      idx = (idx + 1) % SYNONYMS.length;
      el.classList.add('unsettled');
      scrambleTo(SYNONYMS[idx], function () {
        if (SYNONYMS[idx] === 'hallucinations.') el.classList.remove('unsettled');
      });
    }

    el.addEventListener('click', cycle);
    if (!REDUCED) setInterval(cycle, 3400 + 1200);
  }

  /* ── Okazz generative tile background ──────────────────────────── */

  var PALETTE = [
    '#38bdf8', // sky / cyan
    '#f59e0b', // amber
    '#f43f5e', // rose
    '#10b981', // emerald
    '#fb923c', // orange
    '#a855f7', // purple
    '#06b6d4', // teal
  ];

  function initTiles() {
    var canvas = document.getElementById('okazz-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var width = 0;
    var height = 0;

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    var COLS = 7;
    var ROWS = 8;
    var SIZE = 46;
    var tiles = [];

    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        tiles.push({
          col: c,
          row: r,
          type: (r * COLS + c + ((r ^ c) % 3)) % 7,
          rotation: (((r + c * 2) % 4) * Math.PI) / 2,
          color1: PALETTE[(r * 3 + c * 7) % PALETTE.length],
          color2: PALETTE[(r * 5 + c * 2 + 1) % PALETTE.length],
          speed1: 1.2 + ((r * c) % 4) * 0.4,
          speed2: 0.8 + ((r + c) % 3) * 0.3,
          phase1: (r * 1.7 + c * 2.3) % (Math.PI * 2),
          phase2: (r * 2.1 + c * 1.1) % (Math.PI * 2),
        });
      }
    }

    if (REDUCED) {
      // One static frame — the composition without the motion.
      drawFrame(1.7);
      return;
    }

    var start = performance.now();
    function loop(now) {
      drawFrame((now - start) / 1000);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    function drawFrame(t) {
      ctx.clearRect(0, 0, width, height);
      var stroke = 'rgba(255, 255, 255, 0.28)';

      tiles.forEach(function (tile) {
        ctx.save();
        ctx.translate(tile.col * SIZE + SIZE / 2, tile.row * SIZE + SIZE / 2);
        ctx.rotate(tile.rotation);
        ctx.translate(-SIZE / 2, -SIZE / 2);

        var s = SIZE;
        var half = s / 2;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(s, 0);
        ctx.moveTo(0, 0);
        ctx.lineTo(0, s);
        ctx.stroke();

        switch (tile.type) {
          case 0: {
            var travel = s * 0.6;
            var pos = half + Math.sin(t * tile.speed1 + tile.phase1) * (travel * 0.35);
            ctx.beginPath();
            ctx.moveTo(0, half); ctx.lineTo(s, half);
            ctx.moveTo(half, half); ctx.lineTo(half, s);
            ctx.stroke();
            ctx.fillStyle = stroke;
            ctx.beginPath(); ctx.arc(half, s - 3, 1.8, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = tile.color1;
            ctx.beginPath(); ctx.arc(pos, half, 3.8, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#020713'; ctx.lineWidth = 0.8; ctx.stroke();
            break;
          }
          case 1: {
            ctx.beginPath();
            ctx.moveTo(0, half); ctx.lineTo(half - 8, half);
            ctx.moveTo(half + 8, half); ctx.lineTo(s, half);
            ctx.moveTo(half, 0); ctx.lineTo(half, half - 8);
            ctx.stroke();
            ctx.beginPath(); ctx.arc(half, half, 7.5, 0, Math.PI * 2); ctx.stroke();
            ctx.save();
            ctx.translate(half, half);
            ctx.rotate(t * tile.speed2 + tile.phase1);
            ctx.beginPath();
            ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
            ctx.moveTo(0, -6); ctx.lineTo(0, 6);
            ctx.stroke();
            ctx.restore();
            ctx.fillStyle = tile.color1;
            ctx.beginPath(); ctx.arc(half, half, 2.8, 0, Math.PI * 2); ctx.fill();
            break;
          }
          case 2: {
            ctx.beginPath(); ctx.arc(0, 0, half, 0, Math.PI / 2); ctx.stroke();
            var a = (Math.sin(t * tile.speed1 + tile.phase1) * 0.5 + 0.5) * (Math.PI / 2);
            ctx.fillStyle = tile.color1;
            ctx.beginPath(); ctx.arc(Math.cos(a) * half, Math.sin(a) * half, 3.6, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#020713'; ctx.lineWidth = 0.8; ctx.stroke();
            ctx.fillStyle = tile.color2;
            ctx.fillRect(s - 9, s - 9, 6, 6);
            break;
          }
          case 3: {
            ctx.beginPath();
            ctx.moveTo(0, half * 0.5);
            ctx.bezierCurveTo(half * 0.5, 0, half * 0.5, s, s, s * 0.75);
            ctx.stroke();
            var prog = Math.sin(t * tile.speed1 + tile.phase1) * 0.5 + 0.5;
            var nx = prog * s;
            var ny = half * 0.5 * (1 - prog) + s * 0.75 * prog + Math.sin(prog * Math.PI) * 8;
            ctx.fillStyle = tile.color1;
            ctx.beginPath(); ctx.arc(nx, ny, 3.4, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.moveTo(half, s); ctx.lineTo(half, s * 0.5); ctx.stroke();
            ctx.fillStyle = tile.color2;
            ctx.fillRect(half - 3, s * 0.5 - 6, 6, 6);
            break;
          }
          case 4: {
            var pos1 = half * 0.6 + Math.sin(t * tile.speed1 + tile.phase1) * (s * 0.22);
            var pos2 = half * 1.4 - Math.sin(t * tile.speed1 + tile.phase2) * (s * 0.22);
            ctx.beginPath();
            ctx.moveTo(s * 0.3, 0); ctx.lineTo(s * 0.3, s);
            ctx.moveTo(s * 0.7, 0); ctx.lineTo(s * 0.7, s);
            ctx.stroke();
            ctx.fillStyle = tile.color1;
            ctx.beginPath(); ctx.arc(s * 0.3, pos1, 3.6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = tile.color2;
            ctx.beginPath(); ctx.arc(s * 0.7, pos2, 3.6, 0, Math.PI * 2); ctx.fill();
            break;
          }
          case 5: {
            ctx.beginPath();
            ctx.moveTo(0, half); ctx.lineTo(half, half); ctx.lineTo(half, 0);
            ctx.stroke();
            ctx.fillStyle = tile.color1;
            ctx.fillRect(half - 4, half - 4, 8, 8);
            ctx.beginPath(); ctx.arc(s * 0.75, s * 0.75, 5, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = tile.color2;
            ctx.beginPath(); ctx.arc(s * 0.75, s * 0.75, 2.5, 0, Math.PI * 2); ctx.fill();
            break;
          }
          case 6: {
            var slider = half + Math.sin(t * tile.speed2 + tile.phase2) * (s * 0.24);
            ctx.beginPath();
            ctx.moveTo(half, 0); ctx.lineTo(half, s);
            ctx.moveTo(0, half); ctx.lineTo(half, half);
            ctx.stroke();
            ctx.fillStyle = tile.color2;
            ctx.beginPath(); ctx.arc(half, s - 4, 3.2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = tile.color1;
            ctx.beginPath(); ctx.arc(half, slider, 3.6, 0, Math.PI * 2); ctx.fill();
            break;
          }
        }
        ctx.restore();
      });
    }
  }

  /* ── Deflecting card tilt (spring-damped, rAF-lerped) ──────────── */

  function initTilt() {
    var card = document.getElementById('playground-card');
    if (!card || REDUCED) return;

    var targetX = 0, targetY = 0, targetZ = 0;
    var curX = 0, curY = 0, curZ = 0;
    var hovering = false;
    var floatPhase = 0;

    card.addEventListener('pointermove', function (e) {
      var rect = card.getBoundingClientRect();
      var x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      var y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      targetX = x;
      targetY = y;
      targetZ = Math.min(Math.hypot(x, y), 1.4);
    });
    card.addEventListener('pointerenter', function () { hovering = true; });
    card.addEventListener('pointerleave', function () {
      hovering = false;
      targetX = targetY = targetZ = 0;
    });

    function frame() {
      // Critically-damped-ish lerp approximates the framer spring.
      curX += (targetX - curX) * 0.12;
      curY += (targetY - curY) * 0.12;
      curZ += (targetZ - curZ) * 0.12;
      floatPhase += 0.02;
      var floatY = hovering ? 0 : Math.sin(floatPhase) * 6;
      card.style.transform =
        'translateY(' + floatY + 'px)' +
        ' rotateX(' + (-curY * 16) + 'deg)' +
        ' rotateY(' + (curX * 16) + 'deg)' +
        ' translateZ(' + (-curZ * 10) + 'px)';
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ── Crystal light field — pointer → --cd-gx / --cd-gy ─────────── */

  function initLightField() {
    var crystals = Array.prototype.slice.call(document.querySelectorAll('.cd-crystal'));
    if (crystals.length === 0) return;
    var current = null;

    document.addEventListener('pointermove', function (e) {
      var hit = null;
      for (var i = 0; i < crystals.length; i++) {
        var rect = crystals[i].getBoundingClientRect();
        if (
          e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom
        ) {
          hit = crystals[i];
          break;
        }
      }

      if (current && current !== hit) {
        current.style.removeProperty('--cd-gx');
        current.style.removeProperty('--cd-gy');
      }
      current = hit;
      if (hit) {
        var r = hit.getBoundingClientRect();
        hit.style.setProperty('--cd-gx', ((e.clientX - r.left) / r.width) * 100 + '%');
        hit.style.setProperty('--cd-gy', ((e.clientY - r.top) / r.height) * 100 + '%');
      }
    });
  }

  /* ── Scenario description cards ────────────────────────────────── */

  var SCENARIOS = [
    {
      kicker: 'Riemann Hypothesis',
      question:
        'Explain why the Riemann Hypothesis connects the zeros of ζ(s) to prime numbers, and why a proof has eluded mathematicians for 160+ years.',
      perspectives: [
        {
          model: 'Claude 3.7 Sonnet',
          provider: 'Anthropic',
          accent: 'rgba(245, 158, 11, 0.7)',
          text: 'The Euler product connects ζ(s) to primes, but the explicit formula of Riemann makes the link dynamic: prime counting π(x) is an exact harmonic sum where each non-trivial zero ρ acts as a Fourier frequency. The critical line Re(s) = ½ is the only line where the prime distribution error remains tightly bounded. A proof has eluded mathematicians because the analytic continuation to the critical strip obscures the operator-theoretic properties needed to force all zeros onto the line.',
        },
        {
          model: 'GPT-4o',
          provider: 'OpenAI',
          accent: 'rgba(16, 185, 129, 0.7)',
          text: 'The connection is algebraic at s > 1, but arithmetic on the critical line. Montgomery’s pair correlation conjecture showed that the spacing of zeros mirrors the eigenvalues of random Hermitian matrices from quantum mechanics (GUE). This suggests the zeros are spectrum values of an unknown self-adjoint operator (the Hilbert-Pólya conjecture). We lack the geometric framework to construct that operator unconditionally.',
        },
        {
          model: 'Gemini 2.5 Pro',
          provider: 'Google',
          accent: 'rgba(6, 182, 212, 0.7)',
          text: '10¹³ zeros computed so far all lie precisely on Re(s) = ½. The difficulty is that local methods (contour integrals, approximate functional equations) fail to globally constrain the zeros. A breakthrough requires either a global spectral interpretation (non-commutative geometry à la Connes) or a new arithmetic-geometric bridge that links prime sieve bounds to L-function analytic ranks.',
        },
      ],
      synthesis:
        'All three models agree on the core mechanism: zeros of ζ(s) are the vibrational frequencies of the prime counting function, and the critical line is the minimum-error balance point. They converge on the Hilbert-Pólya spectral operator as the most viable path to a proof.',
    },
    {
      kicker: 'Alignment vs Capability',
      question:
        'Is RLHF fundamentally capability-limiting, or can alignment and reasoning capability scale together without Pareto trade-offs?',
      perspectives: [
        {
          model: 'Claude 3.7 Sonnet',
          provider: 'Anthropic',
          accent: 'rgba(245, 158, 11, 0.7)',
          text: 'Standard RLHF produces the "alignment tax" — reward models act as crude heuristic filters that penalize nuanced, creative chain-of-thought reasoning. However, Constitutional AI and RL with Verifiable Rewards (RLVR) invert this: when models are trained on deterministic ground-truth verification (math, code proofs), alignment directly accelerates reasoning depth by reinforcing self-correction loops.',
        },
        {
          model: 'GPT-4o',
          provider: 'OpenAI',
          accent: 'rgba(16, 185, 129, 0.7)',
          text: 'The apparent trade-off is an artifact of preference modeling over subjective human feedback. When alignment is framed as process-supervised search over verifiable proof steps (PRMs), alignment and capability become identical goals: both reward verified logical correctness and penalize hallucinated inference steps.',
        },
        {
          model: 'Gemini 2.5 Pro',
          provider: 'Google',
          accent: 'rgba(6, 182, 212, 0.7)',
          text: 'The Pareto frontier moves outward when multi-agent debate and self-consistency sampling are used as training signals. The limitation is not alignment itself, but human annotator bandwidth. Synthetic consensus verification removes the human bottleneck and aligns models to truth rather than perceived politeness.',
        },
      ],
      synthesis:
        'The consensus is definitive: naive RLHF on subjective human preference creates an alignment tax, but process-supervised reward modeling and RLVR dissolve the trade-off. The frontier is moving from politeness alignment to epistemic verification alignment.',
    },
    {
      kicker: 'Can AI Understand?',
      question:
        'Can a system that manipulates symbolic tokens ever truly "understand" meaning, or is it a Chinese Room?',
      perspectives: [
        {
          model: 'Claude 3.7 Sonnet',
          provider: 'Anthropic',
          accent: 'rgba(245, 158, 11, 0.7)',
          text: 'Searle’s Chinese Room (1980) demonstrates that executing mechanical lookup rules produces fluent answers without the operator understanding Chinese. The functionalist system reply counters: while the individual operator doesn’t understand, the integrated system — rules, memory, context loop — exhibits functional semantic comprehension. Behavioral competence and phenomenological experience are categorically different things.',
        },
        {
          model: 'GPT-4o',
          provider: 'OpenAI',
          accent: 'rgba(16, 185, 129, 0.7)',
          text: 'Modern neural networks don’t use static rule tables. They project tokens into continuous high-dimensional vector spaces that model relational physics and causality. An internal representation that accurately predicts counterfactual outcomes constitutes a functional world model. Understanding isn’t a binary toggle — it’s a continuous spectrum of predictive compression and causal generalization.',
        },
        {
          model: 'Gemini 2.5 Pro',
          provider: 'Google',
          accent: 'rgba(6, 182, 212, 0.7)',
          text: 'The symbol grounding problem: pure text lacks direct sensorimotor coupling unless anchored by multi-modal feedback in physical environments. Machine understanding of truth conditions is empirically verifiable through benchmark generalization. But subjective phenomenal consciousness remains unfalsifiable by current methods. Separating the two questions is where progress lies.',
        },
      ],
      synthesis:
        'Deep neural networks achieve functional world-modeling through high-dimensional latent geometry — this is measurable and real. Subjective consciousness is a separate philosophical question. The productive move is to specify which kind of understanding we mean.',
    },
  ];

  function initScenarios() {
    var grid = document.getElementById('scenario-grid');
    if (!grid) return;

    SCENARIOS.forEach(function (sc) {
      var card = document.createElement('article');
      card.className = 'cd-crystal scenario-card';

      var persp = sc.perspectives
        .map(function (p) {
          return (
            '<div class="perspective" style="--accent:' + p.accent + '">' +
              '<div class="perspective-head">' +
                '<span class="perspective-model">' + p.model + '</span>' +
                '<span class="perspective-provider">' + p.provider + '</span>' +
              '</div>' +
              '<p class="perspective-text">' + p.text + '</p>' +
            '</div>'
          );
        })
        .join('');

      card.innerHTML =
        '<span class="scenario-kicker">' + sc.kicker + '</span>' +
        '<p class="scenario-question">' + sc.question + '</p>' +
        persp +
        '<div class="scenario-synthesis"><strong>Synthesis</strong>' + sc.synthesis + '</div>';

      grid.appendChild(card);
    });
  }

  /* ── Live release tree + download buttons ──────────────────────── */

  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch (e) {
      return '';
    }
  }

  function firstLine(body) {
    if (!body) return '';
    return body
      .split(/\r?\n/)
      .map(function (l) { return l.trim(); })
      .filter(Boolean)[0] || '';
  }

  function renderReleaseTree(releases) {
    var body = document.getElementById('rt-body');
    if (!body) return;

    if (!releases.length) {
      body.innerHTML =
        '<p class="rt-loading">No releases published yet — every tagged build lands here automatically.</p>';
      return;
    }

    var latest = releases[0];
    var older = releases.slice(1, 5);

    var latestHtml =
      '<div class="rt-latest">' +
        '<span class="rt-live"></span>' +
        '<div class="rt-version-row">' +
          '<span class="rt-version">' + esc(latest.tag_name) + '</span>' +
          '<span class="rt-badge">Latest</span>' +
        '</div>' +
        (latest.name ? '<p class="rt-title-text">' + esc(latest.name) + '</p>' : '') +
        (firstLine(latest.body)
          ? '<p class="rt-notes">' + esc(firstLine(latest.body)) + '</p>'
          : '') +
        '<span class="rt-date">' + formatDate(latest.published_at) + '</span>' +
      '</div>';

    var olderHtml = older.length
      ? '<div class="rt-divider"></div><div class="rt-older"><div class="rt-spine">' +
        older
          .map(function (rel) {
            return (
              '<div class="rt-node">' +
                '<div class="rt-node-head">' +
                  '<span class="rt-node-version">' + esc(rel.tag_name) + '</span>' +
                  '<span class="rt-node-date">' + formatDate(rel.published_at) + '</span>' +
                '</div>' +
                (rel.name ? '<p class="rt-node-title">' + esc(rel.name) + '</p>' : '') +
              '</div>'
            );
          })
          .join('') +
        '</div></div>'
      : '';

    body.innerHTML = latestHtml + olderHtml;
  }

  function wireDownloads(release) {
    if (!release) return;
    var assets = release.assets || [];
    function assetUrl(suffix) {
      var hit = assets.filter(function (a) { return a.name.indexOf(suffix) === a.name.length - suffix.length; })[0];
      return hit ? hit.browser_download_url : null;
    }

    var exe = assetUrl('_x64-setup.exe');
    var msi = assetUrl('_x64_en-US.msi');
    var exeBtn = document.getElementById('download-exe');
    var msiBtn = document.getElementById('download-msi');
    if (exe && exeBtn) { exeBtn.href = exe; exeBtn.removeAttribute('target'); }
    if (msi && msiBtn) { msiBtn.href = msi; msiBtn.removeAttribute('target'); }

    var note = document.getElementById('release-note');
    if (note) {
      note.textContent = 'Latest release ' + release.tag_name + ' · published ' +
        formatDate(release.published_at) + ' · SHA-256 signed';
    }
  }

  function initReleases() {
    fetch('https://api.github.com/repos/' + REPO + '/releases?per_page=5', {
      headers: GH_HEADERS,
    })
      .then(function (res) { return res.ok ? res.json() : []; })
      .then(function (releases) {
        var visible = (releases || []).filter(function (r) { return !r.draft; });
        renderReleaseTree(visible);
        wireDownloads(visible[0]);
      })
      .catch(function () {
        var body = document.getElementById('rt-body');
        if (body) {
          body.innerHTML =
            '<p class="rt-loading">Release feed is unreachable right now — see the ' +
            '<a href="https://github.com/' + REPO + '/releases" style="text-decoration:underline">releases page</a>.</p>';
        }
      });
  }

  /* ── Boot ──────────────────────────────────────────────────────── */

  initScramble();
  initTiles();
  initTilt();
  initLightField();
  initScenarios();
  initReleases();
})();
