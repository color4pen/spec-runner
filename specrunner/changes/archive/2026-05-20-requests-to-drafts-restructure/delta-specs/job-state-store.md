# Delta Spec: job-state-store

## Changes

### CANONICAL_PATTERN

The canonical path pattern for detecting whether a request file is a "known" specrunner request is updated:

- **Before**: `/^.*\/specrunner\/requests\/active\/([^/]+)\.md$/`
- **After**: `/^.*\/specrunner\/drafts\/([^/]+)\.md$/`

### RequestInfo.slug extraction

The `requestSlug` stored in job state is now extracted from `specrunner/drafts/<slug>.md` paths. Files outside `specrunner/drafts/` (e.g. `/tmp/...`) still produce `requestSlug = null`.
