# archive/

Kept in git, deliberately not shipped.

Anything in here is history worth keeping but not worth putting on the wire.
It sits outside `public/`, so Next never serves it and it never lands in a
Vercel deployment artifact. Local scripts can still read it by path.

## old/

The original hand-built JZ Fantasy Football site, the thing that predates
The Sunday Chronicle. Moved into this repo by the May 2026 monorepo
migration (`8e611a2`) and untouched since.

It used to live at `public/old` and answer on `/old/`. Nothing on the site
ever linked to it, but all 137 MB of it (team logo PNGs at ~3 MB each,
player pictures, `yeatintro.mp3`) rode along in every single deployment.
That was roughly two thirds of the static payload, retained once per
deployment, and it is what pushed the Vercel storage quota to 100% in
September 2026.

Two scripts still read `old/pams/data/drafts/` for real data:
`scripts/import-nubbs-2019-draft.mjs` and `scripts/grader-harness/tune.js`.
Both point here now. If this directory ever moves again, update them.

To browse it, open `old/index.html` from disk. If it ever needs a URL
again, don't move it back under `public/` — serve it from somewhere that
isn't copied into every build.
