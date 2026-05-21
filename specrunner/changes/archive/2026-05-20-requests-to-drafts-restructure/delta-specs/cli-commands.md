# Delta Spec: cli-commands

## Changes

### request subcommand path

The slug resolution for all `request` subcommands now uses `specrunner/drafts/<slug>.md` instead of `specrunner/requests/active/<slug>.md`.

- `request new <slug>` creates `specrunner/drafts/<slug>.md`
- `request rm <slug>` deletes `specrunner/drafts/<slug>.md`
- `request show <slug>` reads `specrunner/drafts/<slug>.md` (fallback: `specrunner/requests/active/<slug>.md` with deprecation warning)
- `request migrate-flat` migrates dir-form entries in `specrunner/drafts/` and `specrunner/requests/merged/`

### job start <slug> path

`job start <slug>` (= `specrunner run <path>`) accepts `specrunner/drafts/<slug>.md` as the canonical path.

### job finish without arguments

`specrunner finish` called without `<slug>`, `--pr`, or `--job` now returns exit code 2 with message:
```
No slug specified. Specify <slug>, --pr, or --job.
```

The previous `requests/active/` auto-detection behavior has been removed.
