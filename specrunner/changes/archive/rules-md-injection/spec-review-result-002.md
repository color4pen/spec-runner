# Spec Review Result 002

- **date**: 2026-05-20
- **reviewer**: spec-reviewer
- **verdict**: approved

## Summary

`specrunner/rules.md` を source of truth として導入し、change folder にコピー + 全 agent 冒頭で Read 強制することで「業界慣習 MADR が context 発火して docs/adr/ に誤配置する」事故を構造的に抑止する変更。前回レビュー (001) で挙がった HIGH 1件 + MEDIUM 2件はいずれも tasks.md / design.md 側で適切に対応されており、設計と実装計画は一貫している。

## Findings

### step 数表記の不整合（前回 Finding #5 未解消）
- **severity**: minor
- **location**: tasks.md T-01 / src/prompts/fragments.ts
- **issue**: T-01 が rules.md の System Context セクションに「pipeline 概要（10 step state machine）」と記載しているが、現 SPEC_RUNNER_COMMON_CONTEXT は 10 step と書きつつ verification + pr-create を含めて 11 項目を列挙している。移植時に同じ不整合が rules.md に持ち越される。
- **suggestion**: rules.md 作成時に「11 step (うち 2 つは CLI step、agent なし)」または「9 agent step + 2 CLI step」と正確に書き直す。T-01 の受け入れ基準に「step 数の正確性」を追記する。

### rules.md パス文字列の重複（前回 Finding #6 未解消）
- **severity**: minor
- **location**: tasks.md T-02 (local.ts / managed.ts の両方で `specrunner/rules.md` をハードコード)
- **issue**: rules.md のソース path とコピー先 path が 2 ファイルに重複出現する。将来 path を変える時の drift リスクがある。
- **suggestion**: `src/util/paths.ts` に `rulesFilePath()` / `changeFolderRulesPath(slug)` ヘルパーを追加し、両 runtime で再利用する。任意の改善。

### buildSystemPrompt の implicit prepend 依存コードの全数監査が tasks に未記載（前回 Finding #7 未解消）
- **severity**: minor
- **location**: tasks.md T-04
- **issue**: T-04 は `SPEC_RUNNER_COMMON_CONTEXT` import 削除を行う 6 ファイルを列挙しているが、「implicit prepend に依存する他コードが存在しないことを confirm する」工程が無い。
- **suggestion**: T-04 完了基準に「`grep -r SPEC_RUNNER_COMMON_CONTEXT src tests` の hit が 0 になる」を追加する。

### change folder の mkdir 順序が tasks に暗黙化
- **severity**: minor
- **location**: tasks.md T-02
- **issue**: T-02 は request.md コピー処理の「後」に rules.md コピーを追加すると記載しており、request.md 側の `fs.mkdir(..., { recursive: true })` で change folder が既に作成されている前提に乗っている。実装上は問題ないが、前提が明記されていない。
- **suggestion**: T-02 に「request.md コピー処理が先に change folder を mkdir 済みであるため、rules.md コピーでは追加の mkdir は不要」を一文添える。

### 静的 test の防御範囲が acceptance criteria に未昇格
- **severity**: minor
- **location**: request.md 受け入れ基準 / design.md `[Risk] 静的 unit test の限界`
- **issue**: design.md の Risks セクションには「静的テストは input 側のガードであり agent 出力は保証しない」と明記されている。一方 request.md の受け入れ基準項目は「catch」と書いており、入力ガードである旨が受け入れ基準側に反映されていない。
- **suggestion**: 受け入れ基準を「PR #339 / #343 / #344 同型の **入力側 structural guard** を静的 unit test で検証する」と書き直すか、design.md の Risk への参照を追記する。

## Requirements Mapping

| # | request.md 受け入れ基準 | tasks.md / delta spec | 状態 |
|---|---|---|---|
| 1 | `specrunner/rules.md` 新設 (7 セクション) | T-01 / delta spec §rules.md の存在と構造的保証 | covered |
| 2 | worktree setup での rules.md コピー (local + managed) | T-02（ENOENT ガード明記済） | covered |
| 3 | 全 11 agent prompt 冒頭に identity priming + Read 指示 | T-03 / delta spec §System prompt の builder 経由構成 | covered |
| 4 | `SPEC_RUNNER_COMMON_CONTEXT` / `AUTHORITY_SPEC_GUARD` / `DELTA_SPEC_FORMAT` を fragments.ts から削除 | T-04 / delta spec §Fragment 集約 export | covered |
| 5 | `buildSystemPrompt` の強制 prepend 整理 | T-04 / delta spec §Builder 純粋関数 | covered |
| 6 | `fragment-coverage.test.ts` update | T-05 | covered |
| 7 | `common-context-catch.test.ts` update | T-06 / delta spec §Inject 漏れの構造的検出 | covered |
| 8 | 静的 unit test 新設 (PR #339/#343/#344 同型 catch) | T-07 | covered (minor caveat あり) |
| 9 | `bun run typecheck && bun run test` green | T-08 | covered |
| 10 | ADR への方針記録 | pipeline adr-gen step + `adr: true` meta | covered |

## Delta Spec Format 整合性チェック

- Delta spec: `specrunner/changes/rules-md-injection/specs/prompt-fragment-registry/spec.md`
- Section header: `## Requirements` 単一（`## ADDED/MODIFIED/REMOVED/RENAMED` 旧形式なし）— 新規約と整合 ✓
- MODIFIED 対象 5 Requirement の header はすべて baseline と完全一致 ✓
- 新規 Requirement `rules.md の存在と構造的保証` は ADDED として tool が自動分類する ✓
- 旧 `## Removed`（001 review で指摘）は削除済み ✓

## Verdict rationale

前回 review (001) で指摘された HIGH 1 件（Finding #1: T-02 ENOENT ガード）と MEDIUM 3 件（Finding #2: `## Removed` 形式、Finding #3: 静的 test の限界、Finding #4: 同一 job rules.md 上書きリスク）はすべて tasks.md / design.md に反映されている。

残課題はいずれも minor（前回 LOW のうち #5/#6/#7 + 新規 2 件）で、実装段階で吸収可能な品質改善であり承認阻止条件には該当しない。delta spec format は新規約に完全準拠しており、runtime のコピー処理は `this.cwd` (managed) / `worktreePath` (local) で正しく分離されている。self-referential bootstrap シナリオも T-02 の ENOENT ガードで保護されている。

設計の核心（acquired > given）は当初から正当で、レビュー round 1 → 2 でリスク記録と test 限界の言語化が強化されたため、実装フェーズに進める状態に達している。
