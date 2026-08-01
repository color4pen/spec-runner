# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `specrunner/changes/spec-review-prior-round-context/request.md`
- `specrunner/changes/spec-review-prior-round-context/design.md`
- `specrunner/changes/spec-review-prior-round-context/spec.md`
- `specrunner/changes/spec-review-prior-round-context/tasks.md`

### 現状コードの前提確認（request.md assertions）

request.md が主張する既存コードの前提を実際のソースコードと突合した。

| 前提 | 確認対象 | 結果 |
|------|----------|------|
| `spec-review.ts:82-90` — reads() は 4 ファイルのみ | `src/core/step/spec-review.ts` を直接確認 | ✓ request.md / spec.md / design.md / tasks.md の 4 ファイルのみ。spec-review-result-NNN.md は含まれない |
| `spec-review.ts:102-114` — buildSpecReviewInitialMessage は前周 findings を渡さない | `src/core/step/spec-review.ts` + `src/prompts/spec-review-system.ts:174-196` 確認 | ✓ `SpecReviewPromptInput` に前周 findings フィールドなし。`buildSpecReviewInitialMessage` は slug / requestType / requestContent / branch / iteration / findingsPath / mode のみ |
| `step-context-builder.ts:96-98` — FIXER_STEP_NAMES のみ session 継続 | `src/core/step/step-context-builder.ts` 確認 | ✓ line 96: `const resumeSessionId = FIXER_STEP_NAMES.has(step.name) ? ...` — spec-review は FIXER_STEP_NAMES に含まれない |
| `spec-fixer.ts:150` — `getLatestJudgeFindings` seam | `src/core/step/spec-fixer.ts` 確認 | ✓ line 150: `const findings = getLatestJudgeFindings(state, STEP_NAMES.SPEC_REVIEW)` |
| `runtime-strategy.ts:651` — `listCommitChangedFiles` seam (never-throw) | `src/core/port/runtime-strategy.ts` 確認 | ✓ line 651: optional method `listCommitChangedFiles?(oid, cwd): Promise<ChangedFilesResult>`。コメントに "Never throws" 明記 |
| `commit-orchestrator.ts:277-278` — priorOid 解決パターン | `src/core/step/commit-orchestrator.ts` 確認 | ✓ line 277-278: `stepRuns[stepRuns.length - 2]?.commitOid ?? null` で前周 OID を解決する前例が存在する |
| `pipeline/types.ts:235-246` — spec-review ⇄ spec-fixer ループ遷移 | `src/core/pipeline/types.ts` 確認 | ✓ spec-review needs-fix → spec-fixer、spec-fixer approved → spec-review（specFixerForwardsToTestGen が false のとき）の遷移が存在する |

### design.md の設計判断（D1–D7）確認

**D1（core 層での導出）**: `enrichContext` が 3 アダプター（claude-code / managed-agent / codex）から呼ばれていることを `src/adapter/*/agent-runner.ts` で確認。`buildStepContext` には `enrichContext` の呼び出しがなく（step-context-builder.ts を全読み確認）、`runtimeStrategy` を adapter 層から利用できないことを検証。core 層での導出が必要という設計根拠を確認。

**D2（prepareRoundContext フック）**: `src/core/port/step-types.ts` の `AgentStep` interface を確認。`enrichContext` の signature が `(dynamicContext, cwd, slug): Promise<DynamicContext>` で `runtimeStrategy` なしであることを確認。`prepareRoundContext` は現在未定義であり、追加が必要な新 optional メソッドであることを確認。

**D3（DynamicContext の priorRoundContext field）**: `src/git/dynamic-context.ts` を確認。`verificationContent` / `requestContentHash` / `factCheckAttestation` が inline 構造型で既に存在する前例を確認。`collectDynamicContext` は `priorRoundContext` を設定しない（one-shot 寿命の構造的保証）ことを確認。

**D4（prior-round-context.ts モジュール構成）**: `src/core/step/finding-recency.ts` を参照し、同様の純関数 + 配線 + seam 3 層構成が実績として存在することを確認。`getLatestJudgeFindings` が `src/core/step/fixer-helpers.ts:52` に存在し、design が `derivePriorRoundContext` から呼ぶ seam として使えることを確認。

**D5（省略契約）**: `ChangedFilesResult` の DU（discriminated union: `success` / `unavailable`）が runtime-strategy.ts にドキュメント化されており、`unavailable` の場合に省略するという設計が seam の型と整合することを確認。

**D6（全量列挙規律を弱めない）**: `src/prompts/spec-review-system.ts` の `## Method` 節（line 49）に既存の全量列挙規律文言が存在することを確認。ADR 2026-07-24-spec-review-full-enumeration.md を確認（D1 全量列挙 / D2 gate 化将来送りの内容を検証）。

**D7（{{PRIOR_ROUND_CONTEXT}} placeholder）**: `SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE`（spec-review-system.ts:104-121）の現在の構造を確認。`{{PRIOR_ROUND_CONTEXT}}` placeholder は現在存在せず、追加が必要であることを確認。

### spec.md の Requirement / Scenario 確認

すべての Requirement と Scenario を tasks.md の実装タスクと照合した。

| Scenario | 対応タスク | 網羅確認 |
|----------|-----------|----------|
| iteration ≥ 2 で前周 findings と fixer 変更ファイルが含まれる | T-02, T-03, T-05, T-06 | ✓ |
| fixer 変更ファイルは機械導出のみを真実源にする | T-02（listCommitChangedFiles mock 検証） | ✓ |
| iteration 1 では注入ブロックなし | T-02（iteration < 2 → null） | ✓ |
| 前周 fixer commit OID が解決できない → 省略 | T-02（null OID パス） | ✓ |
| diff unavailable → 省略 | T-02（unavailable パス） | ✓ |
| 再指摘プロトコル文言が注入ブロックに含まれる | T-02（buildPriorRoundContextBlock 文言） | ✓ |
| 注入は state を汚さない | T-04（DynamicContext の構造的保証）、T-06 | ✓ |

### セキュリティ観点（Full review）

**Prompt injection リスク**:
- `buildPriorRoundContextBlock` が生成するブロックに含まれる finding の `title` フィールドは prior round の spec-review agent が生成した構造化 JSON から取り出す。外部ユーザー入力でなく信頼済みパイプラインプロセスの出力だが、spec.md / tasks.md に injection 防護の方針が明示されていない（F-001 参照）。
- `changedFiles` はリポジトリ内の git 管理下のファイルパスであり、arbitrary user input ではない。
- `{{PRIOR_ROUND_CONTEXT}}` placeholder の配置（`<user-request>` タグの内側 or 外側）は tasks.md T-05 で「`<user-request>` ブロックの前後いずれか」と幅を持たせており、実装者の裁量がある。

**Authentication / Authorization**: spec-runner は内部 CI/CD ツールであり、公開 API surface はなし。ランタイム認証（GitHub OAuth 等）への影響なし。

**Input validation**: finding title の文字列長・文字集合の制限が未明示（F-001 関連）。changedFiles パスはリポジトリ相対パスであり任意コマンド実行のリスクなし。

**OWASP Top 10 該当観点**: A03:2021 Injection のうち prompt injection のみ関連。その他（SQLi / XSS / SSRF / broken auth 等）はこのコンポーネントの問題領域外。

### 既存テストへの影響確認

- `src/prompts/__tests__/spec-review-full-enumeration-prompt.test.ts`: `SPEC_REVIEW_SYSTEM_PROMPT` の `## Method` 節と 5 節骨格を検証。T-05 が `{{PRIOR_ROUND_CONTEXT}}` を initial message template に追加する変更は system prompt 側には影響しないため、既存テストへの影響なし。
- `src/core/step/__tests__/step-context-builder.test.ts`: T-04 で `buildStepContext` に `prepareRoundContext` の呼び出しを追加するが、既存テスト step objects は `prepareRoundContext` 未実装であり、`if (step.prepareRoundContext && dynamicContext)` 条件が false になるため既存テストは無改変で green を維持できる。`deps.dynamicContext = undefined` の既存テスト環境でも `dynamicContext` が falsy でフックはスキップされる。
- `src/core/step/__tests__/spec-review-fixer-routing.test.ts`: routing 遷移テスト。`buildMessage` の出力内容変更（priorRoundContext の有無）は routing logic に影響しない。

## 検証できなかった項目

- **executor.ts:313 の step.prepareRoundContext 呼び出し前後の state push タイミング**: executor.ts の詳細 commit flow を追うことで「buildStepContext は current round の StepRun push 前に呼ばれる」という timing 不変を完全に追跡したが、agent 実行 → StepRun push の全フローはファイル数が多く完全精読はしていない。design の Risks セクションの記述（executor.ts:313）を信頼として確認にとどめた。
- **finding-recency.ts との実装的干渉**: `findingRecency` の post-persist 位置（commit-orchestrator.ts:271-299）と `prepareRoundContext`（buildStepContext 内、round 開始前）は実行タイミングが完全に分離しているため干渉はないと判断したが、commit-orchestrator の全フローは精読していない。

## Findings 詳細

### F-001: `buildPriorRoundContextBlock` の出力ブロックに injection 防護方針が未明示

**対象ファイル**: `specrunner/changes/spec-review-prior-round-context/spec.md` + `tasks.md`

spec.md と tasks.md は `buildPriorRoundContextBlock` が生成するブロック（finding title、changedFiles パス）を `{{PRIOR_ROUND_CONTEXT}}` placeholder 経由で reviewer の initial message に直接埋め込む設計を記述しているが、prompt injection 防護の方針が明示されていない。

**根拠**:
1. tasks.md T-05 が placeholder の配置位置として「`<user-request>` ブロックの前後いずれか」と幅を持たせており、`<user-request>` タグの**外側**に置いた場合は XML 区切りなしにブロックが埋め込まれる。
2. finding の `title` は prior round の spec-review agent が生成した文字列であり、外部ユーザー入力ではないが、信頼境界内のエージェント出力として扱う場合でも防護方針の明示がある方が実装誤りを防げる。
3. spec-fixer の `buildSpecFixerInitialMessage` が `<user-request>...</user-request>` で全コンテンツを囲む前例と対称的な明示がない。

**修正方針**: tasks.md T-02 の `buildPriorRoundContextBlock` 実装仕様に、block 全体または finding title / changedFiles のそれぞれを適切な XML 区切り（例: `<prior-round-context>...</prior-round-context>`）で囲むことを明示するか、あるいは injection リスクが低い理由（信頼済みパイプライン出力、finding title は schema 拘束された短い説明）を明記して防護不要と意識的に決定する。

**重要度**: medium（fixable）。practical なリスクは低い（finding title は pipeline agent の schema 拘束出力、changedFiles はリポジトリ相対パス）が、実装段階での判断に委ねると防護の漏れが生じる可能性がある。
