# Tasks: spec-paths-fix-pr252

## Task 1: Update `specrunner/specs/cli-commands/spec.md` [x]

Replace all `specrunner/requests/` references in L168-200 with `specrunner/changes/`.

Specific replacements:

- L168: `specrunner/requests/{active,merged}/` → `specrunner/changes/{active,merged}/`
- L172: `specrunner/requests/active/` → `specrunner/changes/active/`
- L173: `specrunner/requests/merged/` → `specrunner/changes/merged/`
- L181: `specrunner/requests/` → `specrunner/changes/`
- L184: `"specrunner", "requests", dir` → `"specrunner", "changes", dir`
- L188: `"specrunner/requests/ structure is complete"` → `"specrunner/changes/ structure is complete"`
- L189: `"specrunner/requests/ is missing dirs: ..."` → `"specrunner/changes/ is missing dirs: ..."`
- L194: `specrunner/requests/active/` → `specrunner/changes/active/`
- L194: `specrunner/requests/merged/` → `specrunner/changes/merged/`
- L195: `"specrunner/requests/ structure is complete"` → `"specrunner/changes/ structure is complete"`
- L199: `specrunner/requests/merged/` → `specrunner/changes/merged/`
- L200: `"specrunner/requests/ is missing dirs: merged"` → `"specrunner/changes/ is missing dirs: merged"`

## Task 2: Update `specrunner/specs/job-state-store/spec.md` [x]

Replace all `specrunner/requests/` references in L260-302 with `specrunner/changes/`.

Specific replacements:

- L260: `specrunner/requests/active/<slug>/` → `specrunner/changes/active/<slug>/`
- L275: `specrunner/requests/active/<slug>/request.md` → `specrunner/changes/active/<slug>/request.md`
- L282: regex `\/specrunner\/requests\/active\/` → `\/specrunner\/changes\/active\/`
- L286: `specrunner/requests/active/<slug>/<filename>.md` → `specrunner/changes/active/<slug>/<filename>.md`
- L292: `specrunner run specrunner/requests/active/readme-status-section/request.md` → `specrunner run specrunner/changes/active/readme-status-section/request.md`
- L302: `specrunner/requests/active/<slug>/` → `specrunner/changes/active/<slug>/`

## Task 3: Verify [x]

Run:
```bash
grep -rn "specrunner/requests/" specrunner/specs/
```

Expected: 0 hits.

Run:
```bash
bun run typecheck && bun run test
```

Expected: green.
