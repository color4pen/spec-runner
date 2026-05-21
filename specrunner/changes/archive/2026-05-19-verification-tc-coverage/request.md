# implementer の TC 網羅性を機械的に検証する

## Meta

- **type**: new-feature
- **slug**: verification-tc-coverage
- **base-branch**: main
- **adr**: true

## 背景

PR #331 (= verbose-execution-log) の escalation 分析で、implementer / verification / code-review の責務境界に **TC 網羅性の機械的検証欠如** が発見された。

### 実態 (= PR #331 の場合)

- `test-cases.md`: 40 TC 生成
- implementer 自己申告 (= `implementation-notes.md`): `tasks_completed: 11/11`、「全タスク完了」「Deviations from Spec: out of scope」
- 実装した test に TC ID 記載があるもの: 12 件のみ
- 残り 28 件は「TC ID を test 名に書いていない」or「実装漏れ」or「out of scope と自己判断」が混在
- → code-review 段で初めて「TC-XX 未実装」が指摘され、code-fixer iter で後付け実装 → maxRetries=2 到達 → escalation halt

### 構造的欠陥

| 段階 | 状態 |
|---|---|
| `test-cases.md` 読み | ✅ implementer は読んでいる |
| TC → test の追跡 | ❌ TC ID を test 関数名に書く規律がない |
| 「out of scope」判定 | ❌ implementer が自己判断 (= LLM 不確定性) |
| verification 検証 | ❌ TC 網羅性 phase が無い (= build/typecheck/test/lint/security の 5 phase に含まれない) |
| code-review 検証 | ⚠️ ここで初めて「TC-XX 未実装」が浮上 |

implementer の `completionVerdict: "success"` (= `src/core/step/implementer.ts:93`) は session 終了 = 無条件 success で hardcoded。実装の完成度 / TC 網羅性 / build 成否は一切 verdict に反映されない。

memory `feedback_verify_dont_trust` (= agent 自己申告は構造的に信頼できない、観察可能な事実で検証する) の典型例。

## 思想

memory `feedback_llm_uncertainty_principle` の implementer 版: 「全部実装したか」を agent 自己判断させず tool で機械的に検証する。

## 要件

### 1. test 関数 / comment に TC ID 記載を必須化

- prompt 規律 (= implementer-system prompt および test-case-generator 側) で「test 関数名または comment に対応 TC ID を必ず記載」を明示する
- TC ID 形式は **`TC-XXX` フラット型** (= `test-case-gen-system.ts` の現行 prompt と整合) を基本とする
- 例: `it("TC-070: Agent 定義ハッシュ — 同一定義は同一ハッシュ", ...)`
- **既存実装の混在状況**: 旧 test は `TC-070` フラット型、新しい test (= PR #331 verbose-execution-log) は `TC-10-01` 階層型を使用している。test-coverage phase の grep パターンを「フラット型のみ」「両形式許容 (= `TC-\d+(?:-\d+)?`)」のどちらにするか、および test-case-gen prompt の例示を含めて統一するかは **design 段で決定する** (= ADR に記録)
- 既存 test の retrofit はスコープ外 (= 本 request 以降の新規 test のみ規律適用)

### 2. verification step に「test-coverage phase」を追加

- 既存 5 phase (= build / typecheck / test / lint / security) に **6 番目: `test-coverage`** を追加 (= verification capability の Requirement 追加)
- 順序は **build → typecheck → test → lint → security → test-coverage** (= test phase 通過後に実行する意図、fail-fast 設計下で test 失敗時は skip される、これは意図的 — test 自体が green でない状態で coverage を測っても無意味のため)
- 処理:
  1. `test-cases.md` の `Priority: must` TC ID を抽出
  2. `tests/` 配下を grep して各 TC ID が test code に記載されているか確認
  3. 未記載の `must` TC があれば failed verdict + 未実装 TC リストを `verification-result.md` に記録
- 既存の build-fixer は失敗時に呼ばれる (= 既存 flow と整合)、未実装 TC リストを読んで test を追加する
- 既存 phase が package.json script を spawn する設計と異なり、test-coverage は CLI 内部処理 (= test-cases.md 読み + grep) として実装する (= 設計分岐点、ADR で記録)

### 3. implementer の `completionVerdict` の見直し

- `src/core/step/implementer.ts:93` の hardcoded `"success"` を見直し
- 案 A: `resultFilePath` を non-null 化、`implementation-notes.md` の `tasks_completed: N/M` で M ≠ tasks_completed なら success を出さない
- 案 B: verification の `test-coverage` phase 失敗で build-fixer に流れる前提で implementer 側はそのままにする (= 機械的検証は verification に集約)
- design 段で決定 (= ADR に記録)

## スコープ外

- 既存 test の retrofit (= 過去の test に TC ID を追記、別 issue)
- code-fixer 側の verdict 改善 (= 別 issue)
- maxRetries の動的調整 (= 別 issue、本 request の構造解で escalation 自体が削減される想定)
- test-case-generator の生成量抑制 (= test 量は機能規模に妥当と判定済、別議論)

## 受け入れ基準

- [ ] verification step に `test-coverage` phase が追加され、`must` TC 未実装で failed verdict を返す
- [ ] `verification-result.md` に未実装 TC リストが記録される (= build-fixer が読める形式)
- [ ] test-case-generator および implementer prompt で「TC ID を test 名 / comment に記載」が必須規律として明示される
- [ ] PR #331 と同型ケース (= 大量 TC 生成 → 部分実装) で本 phase が catch することを再現 test で検証
- [ ] `bun run typecheck && bun run test` が green
- [ ] ADR に「TC 網羅性検証の責務配置 (= verification phase 化)」「implementer completionVerdict の判断 (= 案 A / 案 B)」を記録

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD
