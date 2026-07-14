# post-work の決定論的 self-check を無条件実行から outputContract（detect→repair）へ移す

## Meta

- **type**: spec-change
- **slug**: postwork-format-check-as-detector
- **base-branch**: main
- **pipeline**: standard
- **adr**: false

<!-- adr: 既存の OutputContract detect→repair seam を拡張する範囲であり、新しい port/pattern の導入ではないため false。設計判断は design.md に記す。 -->

## 背景

agent step は成功後に post-work turn（`followUpPrompt` / `getFollowUpPrompt`）を**無条件**で実行する（`src/adapter/claude-code/agent-runner.ts` の post-work ループは成功時に全 post-work prompt を走らせる）。このうち design と code-review の self-check は「spec.md の形式（Requirement / Scenario / SHALL の有無）」「review-feedback の Markdown テーブル形式（必須カラムの有無）」という**決定論的に検査可能**な内容であり、違反が無くても毎回 AI ターンを 1 つ消費している。

spec-runner には既に detect→repair の seam が存在する（`OutputContract` policy `"follow-up"`：CLI が違反を検出し、**違反時のみ**同一セッションへ repair prompt を送る）。決定論的な形式検査をこの seam に移せば、形式が正しい通常ケースでは AI ターンをゼロにでき、違反時のみ従来どおり repair が走る（挙動は保存される）。

## 現状コードの前提

- 成功後 post-work turn は無条件実行。post-work turn では tool call は捕捉されない（`src/adapter/claude-code/agent-runner.ts`）。
- design の形式 self-check は `followUpPrompt` にあり、`### Requirement:` header・`#### Scenario:`・本文の `SHALL`/`MUST` の有無を確認させる（`src/core/step/design.ts:72-74`）。すべて文字列 grep で決定論的に検査可能。
- code-review の形式 self-check は `followUpPrompt` にあり、Findings が Markdown テーブル形式か・必須カラムが揃うか等を確認させる（`src/core/step/code-review.ts:143` 付近）。テーブル/カラムの有無は決定論的に検査可能。
- 既存 detect→repair seam:
  - `OutputContract`（`src/core/port/output-contract.ts`）: `kind`（現状 `"produced"` / `"tasks-complete"`）、`policy`（`"halt"` / `"follow-up"`）。
  - step は `outputContracts(state, deps): OutputContract[]` で宣言（例: `src/core/step/implementer.ts:144` の tasks-complete）。
  - 検出は runtime の `validateStepOutputs`（`src/core/runtime/local.ts:819` / `src/core/runtime/managed.ts:407`）。
  - repair prompt は `buildOutputFollowUpPrompt`（`src/core/step/output-verify.ts:92`）が kind 別に生成。follow-up policy の repair ループは agent-runner の outputVerification 経路（最大 `OUTPUT_FOLLOWUP_MAX_ATTEMPTS = 2`, `src/core/step/output-verify.ts:24`）。
- design の spec.md は spec-change / new-feature type のみ生成される（形式検査は spec 必須 type に限定すべき）。

## 要件

1. 決定論的な形式検査のための新しい `OutputContractKind`（1 つの汎用 content 検査 kind、または用途別の kind）を追加し、`policy: "follow-up"` で扱えるようにする。検出は `validateStepOutputs`（local / managed 両 runtime）に実装し、`buildOutputFollowUpPrompt` に該当 kind の repair 文言を追加する。
2. design の形式 self-check（Requirement / Scenario / SHALL の有無）を `followUpPrompt` から `outputContracts` へ移す。無条件 post-work turn を廃し、CLI 検出で違反があるときのみ repair turn を発火させる。形式検査は spec.md が必須の type に限定して宣言する。
3. code-review の Markdown テーブル形式 self-check（テーブル形式・必須カラムの有無）を `followUpPrompt` から `outputContracts` へ移す。同じ detect→repair 挙動にする。決定論的に検査できない意味的判断（severity 定義との整合など）が残る場合は、その扱い（`followUpPrompt` に残す / 別途）を design で明示する。

## スコープ外

- 決定論的に検査できない意味的 self-check（adr-gen の Alternatives セクション自己修正など）— 無条件 post-work のまま残す。
- rules follow-up の条件化・再配置（別 request）。
- post-work ループ全体の一般的な条件化（形式検査以外の post-work prompt の扱いは変えない）。
- 完了契約の初回注入・ターン種別 metrics（別 request で対応済み）。

## 受け入れ基準

- [ ] design の spec.md 形式が正しい場合、その形式検査による post-work / repair turn が発火しないことをテストで固定する（valid → repair 0 回）。
- [ ] design の spec.md 形式に違反がある場合（例: Scenario 欠落）、repair turn が発火することをテストで固定する（invalid → repair 発火）。
- [ ] code-review の Markdown テーブル形式について、valid → repair 0 回 / invalid → repair 発火 をテストで固定する。
- [ ] 新 `OutputContractKind` の検出が local / managed 両 `validateStepOutputs` で決定論的に動作することを、valid / invalid 双方でテストする。
- [ ] design / code-review の `followUpPrompt` から移設した決定論的形式検査の記述が無いことをテストで固定する。
- [ ] 形式違反は従来どおり修復される（挙動保存）。verdict 導出・pipeline 遷移の観測挙動は不変で、既存テストは形式検査の移設で期待が変わる箇所以外は無変更で green。
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: 既存の `OutputContract` detect→repair seam（policy `"follow-up"`）を拡張し、新 kind を `"produced"` / `"tasks-complete"` の隣に差す。並行機構は作らない。
- **採用**: 形式検査は `outputContracts(state, deps)` で条件付き宣言する（design は spec 必須 type のときのみ）。検出は CLI 側（AI ターン不要）。
- **却下**: post-work ループ全体を汎用 detector で条件化する案。blast radius が大きく、形式以外の意味的 post-work まで巻き込む。対象を決定論的形式検査に限定し、実証済み seam を再利用する。
- **却下**: 形式検査を `followUpPrompt` に残したまま「違反時のみ実行」する案。実行有無の判定自体に 1 ターン要り、無条件実行の削減にならない。検出は CLI 側に置く。
