# Tasks: single-mutator-enforcement

## T-01: allowlist に B-9 エントリを追加

- [x] `tests/unit/architecture/arch-allowlist.ts` に以下の B-9 エントリを追加:
  - `src/store/job-state-store.ts` / `"failed" as JobStatus` / invariant: `"B-9"` / tracking: `"B9-store-fail"` / comment: `fail() が transitionJob を経由せず status: "failed" を直書き`
  - `src/core/lifecycle/exit-guard.ts` / `"awaiting-resume"` / invariant: `"B-9"` / tracking: `"B9-exit-guard"` / comment: `exit-guard が transitionJob を経由せず status: "awaiting-resume" を直書き`
  - `src/core/runtime/local.ts` / `"awaiting-resume" as const` / invariant: `"B-9"` / tracking: `"B9-signal-handler"` / comment: `signal-handler が transitionJob を経由せず status: "awaiting-resume" を直書き`
- [x] 実装者は grep scan を実施し、上記以外の bypass が存在しないことを確認する（grep authoritative）。追加の bypass が見つかった場合は同様に B-9 エントリとして追加する
- [x] エントリの pattern 文字列が実際の grep マッチ行と一致することを確認（isAllowlisted の endsWith + includes 条件）

**Acceptance Criteria**:
- B-9 エントリが `arch-allowlist.ts` に存在し、全 bypass を網羅
- 各エントリに file / pattern / invariant / tracking / comment が記載
- TypeScript としてコンパイル可能

## T-02: core-invariants.test.ts に B-9 テストを追加

- [x] `tests/unit/architecture/core-invariants.test.ts` に `describe("B-9: ...")` ブロックを追加
- [x] grep パターン: `status:\s*"(running|failed|awaiting-resume|awaiting-merge|terminated|archived|canceled)"`
- [x] スキャン対象: `src/store/` と `src/core/`（2 ディレクトリ）
- [x] スキャン除外:
  - `src/state/lifecycle.ts` は grepE の対象ディレクトリに含まれないため自然に除外
  - `src/core/verification/` は PhaseResult.status であり JobState ではないため、grep 結果から `core/verification/` を含む行をフィルタ
  - テストファイル（`__tests__/` / `.test.ts`）をフィルタ
- [x] initial creation 除外: `store/job-state-store.ts` の `"running"` リテラル行は `create()` の初期化であり遷移ではないため、テスト内フィルタで除外
- [x] allowlist フィルタ: `ARCH_ALLOWLIST.filter(e => e.invariant === "B-9")` で B-9 エントリを取得し、`filterViolations()` で残りが空であることを assert
- [x] コメント線のフィルタ: 既存の `isCommentLine()` + `filterViolations()` で処理

**Acceptance Criteria**:
- B-9 テストが存在し、allowlist 込みで green
- describe/it 名に invariant 名 `B-9` と目的（"status 直書き禁止"）を明記
- 既存 B-1〜B-8 テストが引き続き green

## T-03: B-9 regression guard テストを追加

- [x] `core-invariants.test.ts` の T-04 regression guard セクションに B-9 の regression guard テストを追加
- [x] テスト 1: 「allowlist に無い新規 status 直書きを検出する」— 仮想的な violation（例: `src/core/command/new-feature.ts` に `status: "failed"` を inject）を `filterViolations` に渡し、violation が検出されることを assert
- [x] テスト 2: 「allowlist に含まれる bypass は suppression される」— B-9 allowlist エントリに合致する仮想 match を inject し、violation が 0 件であることを assert

**Acceptance Criteria**:
- B-9 regression guard テストが 2 件存在し green
- 新規 status 直書きが allowlist に無い場合に検出されることが実証済み
- 既存 allowlist エントリが正しく suppression されることが実証済み

## T-04: verification green 確認

- [x] `bun run build` が成功すること
- [x] `bun run typecheck` が成功すること
- [x] `bun run lint` が成功すること
- [x] `bun run test` が成功すること（新規テスト含む）

**Acceptance Criteria**:
- プロジェクト標準 verification 4 コマンドすべてが exit 0
