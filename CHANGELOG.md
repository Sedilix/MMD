# Changelog

All notable changes to the Playground desktop client. Every tagged release is
built by CI and published — installers, signatures and updater manifest — to
the public repository [Sedilix/MMD](https://github.com/Sedilix/MMD/releases).

The format: each `## vX.Y.Z` section is extracted verbatim by the release
workflow and published as that release's notes. Keep entries as plain
markdown bullets; an optional `— date` suffix on the heading is ignored
by the extractor and rendered as the release date.

## v0.2.1 — 1 Sep 2026

- War-room workbench monolith (2,615 lines) split into 11 focused modules, unlocking the agent-tool roadmap
- Skill-gated gateway web search: enabling the Stripe Billing or GCP Dataflow skill arms the gateway search loop, with a live tool-activity strip showing real search spend and cited sources — never fabricated
- Workbench behaves like a native app surface: page scroll locked to the viewport and the desktop titlebar offset absorbed
- Column layouts rebuilt: two and three models sit side by side, four models fill a 2×2 quadrant, every window stretches to full pane height
- Tool directive cards report capture state instead of inventing execution output

## v0.2.0 — 31 Aug 2026

- Releases now publish to the public Sedilix/MMD repository — installers, signatures and the updater manifest ship as GitHub release assets anyone can download without auth
- Interactive liquid-glass showcase site served from the repo via GitHub Pages: deflecting playground card, Okazz tile canvas, and a release tree fed live by GitHub releases
- Pinned Playground build in the Community Hub Featured Builds with a live mini-GitHub panel (repo stats, release timeline, installer downloads)
- cybrdeck.com download and updater endpoints become compatibility shims that resolve the newest MMD release for the installed fleet
- Playground hidden from public marketing surfaces; reachable via Community Hub and the desktop app
- Lockfile version brought back in sync with package.json so `npm ci` can never reject the release build

## v0.1.9 — 31 Aug 2026

- Google sign-in on the desktop shell now uses the system-browser pairing flow instead of a dead WebView popup path
- Updater manifest and installer routes resolve the newest release actually published, so releases can never drift out of sync with the web deploy
- BYOK lanes unlocked for OpenRouter, Mistral and xAI via CSP connect-src
- Standalone /playground page with universal navbar

## v0.1.8 — 31 Aug 2026

- Python/HTML previews now run through the runnable-file filter, so multi-file markers never leak into the Build Mode sandbox
- Entering Build Mode cleanly disables MMD to keep landing tab state coherent
- Suggestion-stream rejections release the loading spinner instead of hanging the rail

## v0.1.7 — 30 Aug 2026

- Build Mode turns the Playground into an AI Studio-style prototype workbench
- Community DM inbox with mark-as-read, edit/repost UI and server-side badge minting
- Alibaba Model Studio lanes join the Playground with a binary thinking toggle
- Spectral rim CTAs site-wide, HiDPI-correct navbar ripple and a steady landing showcase

## v0.1.6 — 27 Aug 2026

- Native window now ships the live React playground instead of a static bundle
- Landing Release Tree and download page read a single shared changelog source

## v0.1.5 — 27 Aug 2026

- Account-credit cloud streaming now renders real model responses in every column
- Model catalog remapped to the live registry (DeepSeek V4, Claude Sonnet 5, GPT-4o, o3-mini, Gemini 2.5 Flash, Qwen Plus)
- Desktop CORS layer unlocks quota, streaming and pairing calls from the native window
- CSP gains Tauri IPC and provider API origins for the dev-mode webview

## v0.1.4 — 20 Aug 2026

- Registered explicit allow-open-external and allow-desktop-info ACL permissions
- Added official tauri-plugin-opener with automatic multi-tier fallback chain
- Direct JSON updater manifest delivery with 1-click fallback installer button
- Local desktop release and Storage publishing automation

## v0.1.3 — 19 Aug 2026

- Resolved Google sign-in auth loopback via system browser on Windows native desktop
- Surface explicit system URL launch errors with fallbacks
- Fixed titlebar drag handler eating caption and window control clicks
- Unified auto-updater manifest and Firebase Storage deployment pipeline

## v0.1.2 — 18 Aug 2026

- Replaced shell:allow-open with secure scheme-validated desktop command
- Routed auto-updater manifest through Firebase Storage signed URLs
- Enabled signed updater artifacts for automatic background patching

## v0.1.0 — 18 Aug 2026

- Initial production release — native Windows x64 client with custom titlebar and system tray daemon mode
- Client-Side BYOK Engine for direct, zero-latency streaming (OpenAI, Anthropic, Gemini, DeepSeek, Groq, Mistral, xAI, OpenRouter)
- Local Ollama & LM Studio integration with zero token costs and 100% offline privacy
- Multi-column comparison workspace with synchronized prompt fanout and independent temperature/topP controls
- Background auto-updater with SHA-256 integrity verification and progress indicator

## v0.0.9 — 16 Aug 2026

- Responsive multi-model playground grid with fluid column expansion
- Firebase Auth session bridge with real-time subscription tier and quota tracking
- BYOK configuration modal with local encrypted browser storage

## v0.0.8 — 14 Aug 2026

- Initial Windows native wrapper with Microsoft Edge WebView2 runtime
- Frameless dark glass window shell with instant startup redirect bootstrap
