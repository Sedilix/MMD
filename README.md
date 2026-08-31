# Cybrdeck Playground

The chat workbench from [Cybrdeck](https://www.cybrdeck.com) — a streaming multi-model LLM console you can run on your own machine with your own API keys.

This repository contains the **frontend application only**, published source-available under the [Elastic License 2.0](LICENSE). CybrDeck's hosted backend, billing, and managed model gateway are not part of this repository and are not licensed here.

## Showcase

**[sedilix.github.io/MMD](https://sedilix.github.io/MMD/)** — an interactive showcase ([`docs/`](docs/)) served straight from this repo via GitHub Pages: the liquid-glass Playground card, the live release tree (fed by this repo's own releases), and the multi-model description cards. The download buttons resolve to the newest installer assets on every release — no rebuild required.

## Downloads

Windows x64 installers (`.exe` NSIS setup and `.msi`) are published as assets on every tagged release — grab them from the [Releases](https://github.com/Sedilix/MMD/releases) page.

## What it is

Playground is a workbench for working with language models the way an engineer works with a terminal: several models answering the same prompt side by side, live token streams, per-column telemetry (time-to-first-token, tokens/sec, cost), and a sandboxed preview pane that renders generated React/HTML/Python prototypes as you chat.

Key surfaces:

- **War Room columns** — fan one prompt out to multiple models in parallel; each column streams independently and a failure in one never affects the others.
- **MMD (Multi-Model Discussion)** — columns debate over configurable rounds with a chairman model synthesizing the outcome.
- **Capability chips** — describe an app you want to build and the workbench infers the capability contract (charts, persistence, drag & drop, …) and rides it along to the model at send time.
- **Preview pane** — detected code artifacts render in a sandboxed iframe with a live code editor, console capture, VFS file view, and project ZIP export.
- **Bring-your-own-key (BYOK) and local inference** — every request can go direct to your own provider keys or a local Ollama instance, with zero dependence on any CybrDeck service.

## What is in this repo

| Path | Contents |
|---|---|
| `src/app/playground/` | The workbench UI (landing, columns, preview, studios) |
| `src/components/playground/` | Workbench components |
| `src/lib/playground/` | Client-side stream hook, artifact parser, chip engine, BYOK/local clients |
| `src/data/playground/` | Model registry, modes, and skills manifests |

## What is deliberately not in this repo

- The managed streaming gateway (`/api/playground/stream/*`) and the model-tier keys behind it.
- Accounts, credit billing, and tier enforcement.
- Any CybrDeck backend configuration or secrets.

Running this app therefore requires you to point it at inference you control. Two paths work out of the box:

1. **Local Ollama** — models prefixed `ollama:` / `local:` stream directly from `localhost:11434`. No keys, no server, entirely on your machine.
2. **BYOK** — add your own provider keys (OpenAI, Anthropic, DeepSeek, Groq, Mistral, xAI, OpenRouter, …) in the app settings; requests go direct from your browser to the provider with no intermediary.

## Quick start

```bash
git clone <this-repo>
cd <repo>
npm install          # .npmrc sets legacy-peer-deps; no extra flags needed
npm run dev          # http://localhost:9002/playground
```

Copy `.env.example` to `.env.local` and fill in only what you intend to use. With no environment configured at all, Ollama and BYOK sessions still work — the app degrades to whatever inference you control.

## Desktop wrapper

A Tauri v2 shell (`src-tauri/`) is included for a native window experience. It loads this app; it contains no proprietary logic of its own.

```bash
npm run desktop:dev      # dev window against localhost:9002
npm run desktop:build    # native installer bundle
```

## License

Elastic License 2.0 (ELv2) — see [LICENSE](LICENSE). In plain terms, you may:

- **view, study, and modify** the code for your own use,
- **run it locally** for personal, research, or internal purposes,
- **open pull requests** back to this repository.

You may **not**:

- offer the software, modified or not, to third parties as a hosted service,
- remove or obscure this license, the copyright notice, or CybrDeck branding from redistributed copies,
- circumvent any license-key functionality present in the code.

This is a **source-available** license, not an OSI-approved open-source license.

**Trademark notice:** CybrDeck and the CybrDeck logo are trademarks of CybrDeck and are not granted under this license. Nothing here permits using the CybrDeck name in the marketing of your own product or service.

## Contributions

Contributions are accepted on the terms of the Elastic License 2.0 and remain subject to the trademark notice above. By opening a PR you confirm you have the right to submit the change and that it contains no third-party code you are not allowed to share.

## Contact

For commercial licensing beyond ELv2 (embedded use, redistribution as a component, white-label), reach out via [cybrdeck.com](https://www.cybrdeck.com).
