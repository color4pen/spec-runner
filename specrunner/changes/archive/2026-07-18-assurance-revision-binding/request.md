# scenario / spec の凍結・承認を revision（commit OID）に束縛する — 同一 commit 自己整合を廃す（P0 fix-forward）

## Meta

- **type**: spec-change
- **slug**: assurance-revision-binding
- **base-branch**: main
- **adr**: false

<!-- 構造判断は ADR-20260717 D4（test 不変を base→HEAD の時間境界で証明）で ratify 済み。#850 の「二層凍結」は events.jsonl と test-cases.md を**どちらも finalHeadOid から**読む同一 commit 自己整合チェックで、time boundary を検査していない。本 request はそれを、凍結・承認が確定した commit OID の content と finalHeadOid の content の**跨ぎ比較**に置き換える。journal(events.jsonl/state.json)自体の agent-write 保護と全 step の epistemic-contract 監査は別 request、本 request の射程外。新規 architecture ADR を要さない。 -->

## 背景

#850 は達成判定に「scenario 二層凍結」を入れたが、証明の構造自体が誤っている:

- `deriveAchievedAssurance`（`src/core/archive/achieved-assurance.ts`）は `events.jsonl` の frozen hash と `test-cases.md` の内容を**どちらも `finalHeadOid` から**読み hash 比較する。両者が同一 commit なので、**後続 step が test-cases.md を変更し、events.jsonl の frozen hash も同じ commit 内で書き換えれば、一致したまま通る**。workspace は書込可、`commit-push.ts` は `git add -A`。E2E（`bite-evidence-e2e-gate.test.ts`）も scenario と hash を同一 candidate commit に置き、time boundary を試していない。これは「凍結」でなく同一 commit の自己整合確認。
- 同型の穴が `specReview` にある。最新 spec-review run の verdict が `approved` かしか見ず、**レビュー後に `spec.md` が変わっても `specReview:"required"` が成立**する。承認が「承認した content」に束縛されていない。

正しくは、凍結・承認が確定した **revision（commit OID）の content** と final HEAD の content を跨いで比較する。frozen hash を journal から読むのでなく、確定 commit の blob を直接読む。

## 現状コードの前提（調査済み・実装はこの前提に沿うこと）

- **scenario freeze の現コード**（`achieved-assurance.ts`、scenario two-layer freeze block）: `readFileAtCommit(finalHeadOid, "<slug>/events.jsonl")` → `fold` → test-case-gen lineage の `test-cases.md` output hash（frozen）、`readFileAtCommit(finalHeadOid, "<slug>/test-cases.md")` → `computeContentHash` → 一致比較。**両 read が finalHeadOid**（同一 commit）。
- **各 step の commit OID は実データに在る**: events.jsonl を `fold` すると `state.steps[<step>].at(-1).commitOid` が復元される（実測: spec-review/test-case-gen/test-materialize/implementer すべて非 null）。archive が load する state は fold 済み（normalized）で `state.steps` を持つ。`state.steps["test-case-gen"].at(-1)?.commitOid` = test-case-gen 確定 commit、`state.steps["spec-review"].at(-1)?.commitOid` = spec-review 確定 commit。
- **`readFileAtCommit(oid, suffix, cwd)`**（#850、`local.ts`）: `git ls-tree` で `endsWith("/"+suffix) || endsWith("-"+suffix)` 一致 → `git show <oid>:<path>` → `{kind:"found", path, content}` | `{kind:"unavailable", reason}`。active path（`specrunner/changes/<slug>/…`）も archived path（`specrunner/changes/archive/<date>-<slug>/…`）も suffix 解決可。曖昧(≥2)/不在は unavailable。managed は unavailable。
- **`computeContentHash`**（`achieved-assurance.ts`）: `sha256:`+hex。`digestArtifacts` と round-trip 一致（実測済み）。
- **folder 移動**: archive-record commit が change フォルダを `specrunner/changes/archive/<date>-<slug>/` へ move。したがって test-case-gen 確定 commit（early、active path）と finalHeadOid（archived path）では `<slug>/test-cases.md` の full path が異なる → **single-path diff でなく、両 commit で readFileAtCommit（suffix 解決）して content hash を比較する**。
- **spec.md**: 多くの job は `<slug>/spec.md` を持つ（forward 系含む）。`isSpecRequired`（`type-config.ts`）で spec 要否が決まる。
- **fail-closed 前例**: derivation の全 return（不能・欠落・不一致 → 当該 achieved フィールド absent）。

## 要件

各次元は fail-closed を保つ。

1. **scenario freeze を commit OID に束縛する（P0）**: 現行の「events.jsonl frozen hash（finalHeadOid） vs test-cases.md（finalHeadOid）」比較を廃し、次に置き換える:
   - `testCaseGenOid = state.steps["test-case-gen"].at(-1)?.commitOid`（絶対に必要。absent → testDerivation/biteEvidence absent、fail-closed）。
   - `readFileAtCommit(testCaseGenOid, "<slug>/test-cases.md")` と `readFileAtCommit(finalHeadOid, "<slug>/test-cases.md")` の content hash を比較。**一致 → scenario 凍結成立**。不一致 / いずれか unavailable → absent（fail-closed）。
   - これで frozen 基準が「確定 commit の blob（不変 git 履歴）」になり、同一 commit 内で両者を書き換える攻撃が成立しない。events.jsonl の lineage hash には依存しない。

2. **specReview を reviewed revision に束縛する（P0）**: `specReview:"required"` の成立条件に「最新 spec-review verdict === approved」に加え、**承認 content の不変**を要求する:
   - `specReviewOid = state.steps["spec-review"].at(-1)?.commitOid`（absent → specReview absent）。
   - `readFileAtCommit(specReviewOid, "<slug>/spec.md")` と `readFileAtCommit(finalHeadOid, "<slug>/spec.md")` の content hash 一致 → 承認束縛成立。不一致 / いずれか unavailable（spec.md を解決できない）→ specReview absent（fail-closed）。
   - これでレビュー後に spec.md が変われば specReview が落ちる。

3. **反例テストを positive と同数・同型で必須にする（P0 の歯の本体）**: 上記各束縛について、**anchor commit の後に content を改竄した後続 commit を持つ time-boundary 反例**を固定する:
   - scenario: test-case-gen 確定 commit に scenario S、その後の commit で `test-cases.md` を S' に変更し finalHeadOid に S' → 跨ぎ比較で不一致 → fail-closed。positive（S のまま）→ 成立。
   - spec: spec-review 確定 commit に spec、後続 commit で `spec.md` 変更 → fail-closed。positive → 成立。
   - **協調改竄反例（#850 の穴そのもの）**: `events.jsonl` の lineage hash を finalHeadOid で書き換えても、commit-OID 束縛は testCaseGenOid の blob を読むため、改竄 test-cases.md@HEAD を弾く（fail-closed）ことを固定する。

4. **E2E の時間境界化**: `bite-evidence-e2e-gate.test.ts` を、scenario/spec を **anchor commit** に、impl/HEAD を**後続 commit**に置く構成へ更新し、positive（不変）で成立、negative（anchor 後に改竄）で fail-closed を通す。同一 commit に置かない。

5. **回帰を起こさない**: 既存 achieved-assurance / floor / bite-evidence テストは無変更で green（本 request で意味が変わる scenario-freeze 系の期待更新を除く）。`typecheck && test` が green。

## スコープ外（理由付きで明示。歯を黙って削らない）

- **journal（events.jsonl / state.json）の agent-write 保護**: commit OID や verdict の**記録自体**を agent が書き換える threat（記録された `commitOid` を改竄後 blob を指す commit に差し替える等）は、本 request の commit-OID 束縛では完全には塞げない（OID 自体が journal 由来）。これは別 request（下記 epistemic-contract 監査、または専用の journal 保護）で扱う。本 request は「同一 commit 自己整合」を「確定 commit 跨ぎ比較」に正す構造修正まで。
- **全 step の epistemic-contract 監査＋prompt 適用マトリクス**: freeze/approve/verify が content＋revision を束縛する共通契約を全 step へ展開する監査は別 request（design/prompt 作業）。
- **per-scenario 実行 / dogfood config 有効化**（`scopedTestCommand`＋`minimumAssurance`）: 従来どおり別。
- **R5** provenance carry、**R6** fast。

## 受け入れ基準（歯を名指しする）

- [ ] **T1（scenario time-boundary の歯）**: test-case-gen 確定 commit に scenario S、後続 commit で `test-cases.md` を改竄（finalHeadOid≠testCaseGenOid content）した job が、`biteEvidence:required` / `testDerivation:frozen` floor に対し fail-closed（`exitCode 1`）になることを固定する。**破壊確認**: 跨ぎ比較を同一 commit（finalHeadOid のみ）に戻すと T1 が通ってしまうこと。
- [ ] **T2（協調改竄の歯 — #850 の穴）**: `test-cases.md`@finalHeadOid を改竄し `events.jsonl` の lineage hash も finalHeadOid で書き換えた job が、commit-OID 束縛により fail-closed になることを固定する（同一 commit 自己整合では通っていた反例）。
- [ ] **T3（scenario positive）**: scenario が test-case-gen 確定 commit から finalHeadOid まで不変の forward job（base:red・HEAD:green・blob 不変）が biteEvidence 達成となることを、**実 runtime E2E**（anchor commit と HEAD を別 commit に分けた構成）で固定する。
- [ ] **T4（specReview time-boundary の歯）**: spec-review 確定 commit の後に `spec.md` を変更した job が、verdict=approved でも `specReview:required` floor に対し fail-closed になることを固定する。positive（spec.md 不変＋approved）で成立も固定する。
- [ ] **T5（fail-closed 網羅）**: testCaseGenOid / specReviewOid が absent、`readFileAtCommit` が unavailable（spec.md/test-cases.md 解決不能）のそれぞれで当該次元が absent → fail-closed になることを固定する。
- [ ] **T6（実 config anti-regression 保持）**: この repo の実 config（`scopedTestCommand` 未設定）で `biteEvidence:required` floor が fail-closed する #848 の歯を退行させない。
- [ ] **T7（backward-compat）**: 既存 achieved-assurance / floor / bite-evidence / readFileAtCommit テストが無変更で green（scenario-freeze 系の期待更新を除く）。`typecheck && test` が green。

## architect 評価済みの設計判断

- **凍結・承認は確定 commit OID の blob を跨いで比較する**。→ 却下: journal の frozen hash と finalHeadOid content を比較（同一 commit 自己整合、協調改竄で破れる）。→ 却下: 同一 commit 内の hash 一致で足れりとする（#850 の穴）。
- **anchor は state.steps の確定 commitOid（test-case-gen / spec-review）**。→ 却下: events.jsonl の lineage hash を frozen 基準にする（同一 commit read）。journal 記録自体の保護は別 request（scope-out で明示）。
- **positive と同型の adversarial negative（time-boundary / 協調改竄）を必須にする**。→ 却下: 同一 commit 前提の positive のみ（反例が素通りする）。
- **E2E は anchor と HEAD を別 commit に分ける**。→ 却下: scenario/impl を同一 candidate commit に同居（時間境界を試さない）。
- **本 request は構造修正まで、journal 保護と全 step 監査は別**。→ 却下: journal agent-write 保護や全 prompt 監査を前倒し（別 authority・広範）。
