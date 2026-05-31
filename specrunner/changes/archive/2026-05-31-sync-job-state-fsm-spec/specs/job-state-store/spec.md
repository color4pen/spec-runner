## Requirements

### Requirement: `JobStatus` includes `archived` as a terminal status

`JobStatus` SHALL be typed as `"running" | "awaiting-resume" | "awaiting-merge" | "failed" | "terminated" | "archived" | "canceled"`.

**状態区分**:
- **active** = {`running`, `awaiting-resume`} — 実行中または再開待ち。
- **terminal** = {`archived`, `canceled`} — 出口なし。以後どこへも遷移しない。

**canonical 正常完走遷移**: `awaiting-merge → archived`。`specrunner finish` が Phase 4（markJobArchived after `git pull --ff-only`）を完了した時点で遷移する。

**許可遷移（VALID_TRANSITIONS）**: 下表のセルのみ許可。表に無い遷移は throw。同一 status への遷移は常に noop（許可）。

| from \ to | running | awaiting-resume | awaiting-merge | failed | terminated | archived | canceled |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **running** | — | ✓ | ✓ | ✓ | ✓ |  | ✓ |
| **awaiting-resume** | ✓ | — |  |  |  |  | ✓ |
| **awaiting-merge** |  |  | — |  |  | ✓ | ✓ |
| **failed** | ✓ | ✓ |  | — |  |  | ✓ |
| **terminated** | ✓ |  |  |  | — |  | ✓ |
| **archived** |  |  |  |  |  | — |  |
| **canceled** |  |  |  |  |  |  | — |

`awaiting-resume` は異常終了 guard（exit-guard）が倒す checkpoint であり、`running → awaiting-resume` で記録される。`canceled` はユーザーによる明示的なジョブキャンセルを示す。

Legacy state files with `status: "success"` SHALL be remapped to `"awaiting-merge"` on load（`validateJobState` 内の on-read remap）。`success` は現行コードで生成されない legacy 値であり、load 時に自動的に `awaiting-merge` へ変換される。

#### Scenario: New status value `archived` persists across load/save

- **WHEN** `state.status` is set to `archived` and `JobStateStore.persist()` is called, then `JobStateStore.load()` reads the same file
- **THEN** the loaded state has `state.status === "archived"`

#### Scenario: Legacy `success` state is remapped to `awaiting-merge` on load

- **GIVEN** a state file with `status: "success"` written by a prior CLI version
- **WHEN** `JobStateStore.load()` is invoked
- **THEN** the loaded state has `state.status === "awaiting-merge"`（`validateJobState` が on-read remap を実行するため）

#### Scenario: No intermediate `merged` status

- **WHEN** `specrunner finish` Phase 3 (`gh pr merge`) succeeds but Phase 4 (markJobArchived) has not yet executed
- **THEN** `state.status` remains `awaiting-merge`. After Phase 4 completes, it transitions directly to `archived`. There is no observable `merged` intermediate value.

### Requirement: `state.error.code = SPEC_REVIEW_RETRIES_EXHAUSTED` は retry 上限到達を示す

`runPipeline` の loop プリミティブが `onExceeded` 経由で書き込む `state.error` は MUST `{ code: "SPEC_REVIEW_RETRIES_EXHAUSTED", message: "spec-review did not approve after <N> iterations", hint: "Review spec-review-result-<NNN>.md and adjust the request manually." }` の形式である。ここで `<NNN>` は 3 桁ゼロ埋めの iteration 番号（例: `001`）を示す。`state.steps["spec-review"]` の末尾要素の verdict は SHALL `escalation` に書き換えられている。

#### Scenario: retries exhausted の状態

- **WHEN** maxRetries=2 で iter=1 needs-fix → iter=2 needs-fix が起きる
- **THEN** state.error.code が `SPEC_REVIEW_RETRIES_EXHAUSTED` で、state.steps["spec-review"][1].verdict が `escalation` に書き換えられている。state.status は `awaiting-merge`（pipeline 自体は完走）
