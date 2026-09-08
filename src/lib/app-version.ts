/**
 * The shipped application version, read from the one file that defines it.
 *
 * `scripts/bump-version.ts` writes package.json, src-tauri/tauri.conf.json
 * and src-tauri/Cargo.toml together, so package.json is already the single
 * source of truth for a release. Anything else that needs the version
 * should read it from here rather than keep its own copy.
 *
 * That matters most for the installer download route: its storage prefix
 * and filenames are versioned, so a hardcoded constant there would silently
 * point at the previous build's objects after a bump — a 404 on the
 * download button, with nothing in the diff to suggest why.
 */

import pkg from '../../package.json';

export const APP_VERSION: string = pkg.version;
