# Design: single-mutator-enforcement

## Context

`architecture/model.md` §4 は構造不変条件 B-1〜B-8 を定義し、`tests/unit/architecture/core-invariants.test.ts` + `arch-allowlist.ts` の ratchet パターンで enforcement している。しかし「JobState の status 変更は `transitionJob` 経由のみ」という不変条件は §5 divergence 台帳に「単一 mutator 未強制」として記録されたまま歯が存在しない。

現状 bypass（`transitionJob` を経由せず status を直書きする経路）:
- `src/store/job-state-store.ts` の `fail()` — `status: "failed"` を直書き
- `src/core/lifecycle/exit-guard.ts` — `status: "awaiting-resume"` を直書き
- `src/core/runtime/local.ts` の signal-handler — `status: "awaiting-resume"` を直書き

一方、正しく `transitionJob` を使っている箇所:
- `src/core/finish/job-state-update.ts` — `transitionJob(current, "archived", ...)` 
- `src/state/reconcile.ts` — `transitionJob(state, "awaiting-resume"|"archived", ...)`
- `src/core/pipeline/pipeline.ts` — `transitionJob` 経由
- `src/core/step/executor.ts` — `transitionJob` 経由
- `src/core/command/resume.ts` — `transitionJob` 経由
- `src/core/cancel/runner.ts` — `transitionJob` 経由
- `src/core/runtime/managed.ts` — `transitionJob` 経由

本 change は既存 B-1〜B-8 と同じ ratchet パターン（grep + allowlist + regression guard）で歯を立て、現状の bypass を凍結する。

## Goals / Non-Goals

**Goals**:
- B-9 として「status 直書き禁止」の歯を `core-invariants.test.ts` に追加
- 既知 bypass 3 件を `arch-allowlist.ts` に grandfather（削除のみ許容の ratchet）
- allowlist に無い新規 status 直書きで red になる regression guard を確立

**Non-Goals**:
- bypass の修正そのもの（`store.fail` 等を `transitionJob` 化するのは後続 burn-down）
- 他 invariant（B-3 / B-7）の修正
- 振る舞い変更
- `architecture/model.md` の編集（歯の追加は test + allowlist のみ）

## Decisions

### D1: invariant 名は `B-9` を採用

**選択**: 既存 B-1〜B-8 の連番として `B-9` を使用。

**Rationale**:
- model.md §4 の不変条件表は B-1〜B-8 を定義しており、同じカテゴリ（構造不変条件）の連番が自然。
- `arch-allowlist.ts` の `invariant` フィールドが `"B-1"` 〜 `"B-8"` の形式で統一されている。新しい形式（`INV-MUTATOR` 等）を導入すると allowlist フィルタや消費コードに不整合が生じる。
- model.md §4 表との対応: **B-9 = "JobState の status 変更は `transitionJob`（`src/state/lifecycle.ts`）経由のみ"**。

**Alternatives considered**:
- `INV-MUTATOR`: 独立名は目的を表現できるが、既存 B-# naming convention と不整合。B-# 系フィルタ（`e.invariant.startsWith("B-")` 等）に漏れるリスク。

### D2: grep パターンは JobStatus リテラル一致方式

**選択**: `status:\s*"(running|failed|awaiting-resume|awaiting-merge|terminated|archived|canceled)"` で grep し、JobStatus 値のリテラル直書きを検出する。

**Rationale**:
- `transitionJob` は `status: to` と変数を使うため、リテラル一致パターンに hit しない。自然に canonical 経路が除外される。
- HistoryEntry.status（`"started"` / `"ok"` / `"error"` / `"warning"`）、PhaseResult.status（`"passed"` / `"failed"` / `"skipped"`）、DoctorCheck.status（`"pass"` / `"warn"` / `"fail"`）は JobStatus リテラルと重複しない値を使うため、大半の false positive が自然に排除される。
- 唯一の重複: `PhaseResult.status: "failed"` と `JobStatus: "failed"` が同じ文字列。これは D3 のスコープ制限で対処。

**Alternatives considered**:
- AST 解析: 正確だが tooling dependency が大きい。既存 B-1〜B-8 が grep ベースで成立しており、一貫性を優先。
- `\.status\s*=` の代入パターン: object spread `{ ...state, status: "..." }` を捕まえられない。

### D3: スキャン対象は `src/store/` + `src/core/`（lifecycle.ts 除外）

**選択**: JobState の mutation が起こり得る層（persistence + domain/composition-root）のみスキャンし、canonical authority（`src/state/lifecycle.ts`）を除外する。

**Rationale**:
- `src/adapter/`: managed-agent の `SessionResult.status: "terminated"` 等は JobState mutation ではない。除外で false positive を排除。
- `src/core/verification/`: `PhaseResult.status: "failed"` は D2 パターンに hit するが JobState ではない。`src/core/verification/` を対象外とすることで false positive 排除。PhaseResult を返すだけで JobState を直接書き換えないためスコープ外が正しい。
- `src/state/lifecycle.ts`: `transitionJob` 定義（canonical mutator）。grep パターンは変数 `status: to` なので hit しないが、明示除外で意図を文書化。
- `src/state/schema.ts`: backward compat remap `obj["status"] = "awaiting-merge"` は bracket notation で `status:` パターンに hit しない。自然に除外。

**Alternatives considered**:
- `src/` 全体スキャン: false positive が多すぎる（adapter, verification, doctor 等）。
- `src/core/` のみ: `src/store/job-state-store.ts` の `fail()` bypass を見逃す。

### D4: `JobStateStore.create()` は initial creation として除外

**選択**: `create()` の `status: "running"` は状態遷移ではなく初期化であるため、テストのスコープから除外する。除外方法は、grep 結果から `store/job-state-store.ts` 内の `"running"` リテラル行を除外するフィルタで実装（allowlist には入れない）。

**Rationale**:
- `transitionJob` は status の**変更**を制約する。`create()` は prior state が存在しないため遷移ではない。
- allowlist は「いずれ修正すべき divergence」を記録する場所。initial creation は設計上正しい動作であり divergence ではないため、allowlist に入れるのは意味的に不正確。
- `create()` は `status: "running"` 固定であり、この値は create 以外で直書きされる現実的なケースがない（`transitionJob` で running に遷移する経路は resume 等で存在するが、それは変数 `to` を使う）。

**Alternatives considered**:
- allowlist に `tracking: "design-permanent"` で登録: governance rule（"ONLY shrinks"）との不整合。permanent entry が allowlist に混在すると burn-down 管理が曖昧になる。

### D5: 既存テスト + allowlist パターンに合流

**選択**: `core-invariants.test.ts` に B-9 テストブロックを追加し、`arch-allowlist.ts` に B-9 エントリを追加。新規ファイルは作らない。

**Rationale**:
- B-1〜B-8 と同じファイル・同じ `filterViolations` ロジックを再利用でき、一貫性が高い。
- CODEOWNERS-gated な `tests/unit/architecture/` 配下で governance が自動的に適用される。

## Risks / Trade-offs

- [Risk] grep リテラル一致は、将来 JobStatus 値が追加された場合にパターン更新が必要 → Mitigation: JobStatus 型定義（`src/state/schema.ts`）の変更は稀であり、schema 変更時にテストも更新するのは自然な流れ。
- [Risk] `store/job-state-store.ts` 内の create() 除外フィルタが、同ファイル内の将来の bypass を `"running"` リテラルで偶然マスクする可能性 → Mitigation: `"running"` 以外の JobStatus リテラル（`"failed"`, `"awaiting-resume"` 等）は create() には存在しないため、fail() のような bypass は捕捉される。`"running"` リテラルの新規 bypass は極めて稀（running への遷移は通常 transitionJob 経由）。
- [Risk] `src/core/verification/` のスコープ除外で、将来そのディレクトリに JobState mutation が追加された場合に見逃す → Mitigation: verification/ は PhaseResult を返す責務であり、JobState mutation はアーキテクチャ上ここに配置されない。

## Open Questions

- なし（architect 評価済みの判断で解消済み）。
