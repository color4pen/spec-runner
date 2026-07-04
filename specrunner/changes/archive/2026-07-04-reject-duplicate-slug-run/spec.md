# Spec: reject-duplicate-slug-run

## Requirements

### Requirement: live な先行 job があるとき同一 slug の run を拒否する

local runtime で slug S の `specrunner run` を起動する際、`.specrunner/local/S/liveness.json` に
`pid` が記録されていて `isProcessAlive(pid)` が真であれば、システムは `bootstrapJob` より前に
run を拒否しなければならない（MUST）。拒否時、job state（jobId 生成・初期 JobState 構築・その永続化）を
一切作ってはならない（MUST NOT）。

#### Scenario: slug S に live な先行 job がある

**Given** `.specrunner/local/S/liveness.json` が存在し、`pid` が生存プロセス（`isProcessAlive` が真）で
`jobId` に先行 job A の ID が記録されている
**When** 同一 slug S で `specrunner run` を起動する
**Then** run は `DUPLICATE_LIVE_JOB` エラーで拒否される
**Then** `bootstrapJob` は呼ばれず、job state は新規に作られない

---

### Requirement: stale / 不在時は通常起動する

liveness.json が不在、読み取り不能、JSON 破損、`pid` フィールド欠如、または `pid` が dead
（`isProcessAlive` が偽）である場合、システムは現状通り run を起動しなければならない（MUST）。
このとき stale sidecar の上書きは現行の挙動を維持する（MUST）。

#### Scenario: liveness.json が stale（pid が dead）

**Given** `.specrunner/local/S/liveness.json` が存在するが `pid` が dead（`isProcessAlive` が偽）
**When** 同一 slug S で `specrunner run` を起動する
**Then** ガードは run を許容し、`bootstrapJob` が呼ばれる
**Then** run は通常通り開始される（stale sidecar は現行通り上書きされる）

#### Scenario: liveness.json が不在

**Given** `.specrunner/local/S/liveness.json` が存在しない
**When** slug S で `specrunner run` を起動する
**Then** ガードは run を許容し、`bootstrapJob` が呼ばれる

---

### Requirement: 拒否エラーは先行 jobId と対処手段を含む

`DUPLICATE_LIVE_JOB` エラーは、先行 job の jobId と対処手段（`specrunner job cancel <jobId>` で
cancel するか、先行 job の完了を待つ）をメッセージに含めなければならない（MUST）。

#### Scenario: 拒否エラーの内容

**Given** slug S に live な先行 job A（jobId = "abcd1234-..."）がある
**When** 同一 slug S で `specrunner run` を起動して拒否される
**Then** エラーは先行 jobId "abcd1234-..." を含む
**Then** エラーは `specrunner job cancel abcd1234-...`（cancel）と完了待ち（待機）の対処手段を含む

---

### Requirement: 生存判定は既存 isProcessAlive を再利用する

pid の生存判定は `src/core/resume/safety.ts` の既存 `isProcessAlive` を再利用しなければならない（MUST）。
本ガードのために新たな pid 判定ロジックを追加してはならない（MUST NOT）。

#### Scenario: pid 生存判定の一貫性

**Given** ガードが liveness.json の `pid` を検査する
**When** pid の live/dead を判定する
**Then** 判定は `isProcessAlive(pid)` の結果に一致する（cancel / resume / stale-running 判定と同一の生存意味論）

---

### Requirement: managed runtime はガード対象外（no-op）

managed runtime では本ガードは適用されず、no-op でなければならない（MUST）。managed の `marker.json` に
対する同型ガードは本 change の対象外とする。

#### Scenario: managed runtime では発火しない

**Given** runtime が managed
**When** `specrunner run` を起動する
**Then** duplicate-live-job ガードは何もせず、既存の起動フローがそのまま進む
