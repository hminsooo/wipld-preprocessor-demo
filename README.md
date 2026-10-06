# WIPL-D Preprocessor · Web demo

An independent, public-safe interactive demonstration of the desktop
preprocessor workflow. Built with HTML, CSS and JavaScript; no build step,
Python, WIPL-D license or external JavaScript dependency is required.

**Live demo:** https://hminsooo.github.io/wipld-preprocessor-demo/

## Try the workflow

1. Inspect the sample project and five fictional mounting coordinate systems.
2. Add/select/remove antennas, adjust offsets and prepare a simulated Base.
3. Save a MAIN co-site or coverage plan and frequency inputs.
4. Split frequencies by boundaries or a maximum frequency ratio.
5. Simulate project generation and verification.
6. Run the mock sequential queue, stop after the current Case, and try failure
   and shutdown-hang scenarios. Download the demo's JSON settings or logs.

The dependency-free canvas viewer supports orbit by dragging, wheel zoom,
ISO/TOP/SIDE presets, coordinate axes and a decorative mesh overlay.
The workflow inputs are stored in this browser's local storage. Reloading
restores inputs; in-flight execution and case results are not restored.

## Scope

Every geometry, coordinate, antenna value and output here is a fictional
sample. The rotorcraft is generated mathematically in `demo.js`, independently
of real CAD assets. No private source files, platform geometry, actual WIPL-D
projects, workstation paths, credentials or scientific results are included.

The demo does not convert CAD, generate WCM files, build meshes or run a solver.
`DEMO PASS` is a simulated UI status, not an engineering verification. Exported
JSON is marked `demo_only` and cannot be used as a WIPL-D solver result.
Mesh sizes shown in the table are a display calculation from maxpatch and the
highest frequency, not an estimate of model accuracy. All antenna ports are
retained; no electrical short-circuit reduction is performed.

## Run locally

Serve this directory with any static HTTP server. For example:

```sh
python -m http.server 8765
```

Open `http://localhost:8765/`. The page also works when opening `index.html`
directly, although browser storage/download behavior can vary on file URLs.

## GitHub Pages

The dedicated public demo repository publishes the `main` branch root through
GitHub Pages. `.nojekyll` prevents Jekyll processing. All asset URLs are relative
so the site works under the repository's `/wipld-preprocessor-demo/` path.

To publish a clone: Settings → Pages → Deploy from a branch → main → /(root).
Subsequent pushes to `main` update the site automatically.

## Verification

`tests/smoke.cjs` exercises the actual page with Playwright: mounting, invalid
frequency/band inputs, planning, generation, normal/failure/hang runs,
stop/resume, JSON downloads, browser storage and mobile layout. It is a local
development check; the hosted demo itself does not depend on Playwright.

```sh
node tests/smoke.cjs http://127.0.0.1:8765/
```

Provide the `PLAYWRIGHT_MODULE` environment variable if Playwright is installed
outside the normal Node.js package resolution path.
Set `PLAYWRIGHT_CHANNEL=msedge` or `chrome` to use an installed browser instead
of Playwright's bundled Chromium.
