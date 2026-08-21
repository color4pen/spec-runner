# Spec Review Result — Round 002

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだ仕様ファイル

- `request.md` — 要件・受け入れ基準・architect 設計判断（全体再読）
- `spec.md` — 6 Requirement・8 Scenario（Scenario の修正箇所を中心に確認）
- `design.md` — D1–D7 設計決定（7 項目）
- `tasks.md` — T-01〜T-08（前周指摘対象 T-02・T-05 を中心に確認）
- `test-cases.md` — TC-001〜TC-033（TC-030 カテゴリ修正・Summary カウント整合性確認）

### 確認したコードファイル

- `src/adapter/claude-code/sdk-loader.ts` — `ClaudeSdkQuery` 型の現状（`ClaudeSdkQueryResult` 未追加であることを確認）
- `src/adapter/claude-code/provider-readiness-probe.ts` — 実装手本として lazy import・probe factory パターンを確認
- `src/config/model-registry.ts` — `BUILTIN_MODEL_REGISTRY` の現状（alias 未登録を確認）
- `src/config/step-config.ts` — `traceStepExecutionConfig` の `source.path` / `source.configPath` の型定義を再確認
- `src/core/command/pipeline-run.ts` — `prepare()` の実行順序を確認（compose → validate → assertNoDuplicate → bootstrap）
- `src/core/port/runtime-strategy.ts` — `RuntimeStrategy` / `RealRuntimeStrategy` のパターン確認
- `src/core/step/custom-reviewer.ts` — `model: snapshot.model ?? DEFAULT_REVIEW_MODEL`（line 106）を確認
- `src/core/step/regression-gate.ts` — `model: DEFAULT_REVIEW_MODEL`（line 93）を確認
- `src/core/doctor/types.ts` — `DoctorContext` 現状（`supportedModelsProbe` 未追加を確認）
- `src/core/doctor/checks/index.ts` — `localChecks` 配列の現状（model-existence 未登録を確認）
- `src/core/doctor/runner.ts` — `runChecks()` の単純 forEach パターンを確認
- `tests/config/model-registry.test.ts` — alias 追加後の既存テスト影響を確認
- `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` — `Query.supportedModels()`（:2098）・`close()`（:2230）・`SDKUserMessage`（:3489）・`ModelInfo`（:1064）の型定義を確認

### 前周 finding の解消確認

| Finding | 対象 | 解消確認結果 |
|---------|------|-------------|
| HIGH: ClaudeAgentSdk 型が supportedModels() / close() を公開していない | sdk-loader.ts, tasks.md T-05 | **解消済み** — T-05 line 96–101 に「`ClaudeSdkQuery` の戻り値型 `ClaudeSdkQueryResult` に `supportedModels(): Promise<SdkModelInfo[]>` と `close(): void` を追加すること」「型安全のために拡張またはキャストを採用すること（実装者判断）」が明記された |
| MEDIUM: T-05 streaming AsyncIterable の構成方法が未定義 | tasks.md T-05 | **解消済み** — T-05 に `makePromptIterable(signal)` の具体的なコードパターン（abort イベント待機・finally での return）が追加された（lines 103–118） |
| MEDIUM: EffectiveModelRef.configPath と TracedStepConfigSource.configPath の命名混同 | tasks.md T-02 | **解消済み** — T-02 に「configPath の意味」コメントブロックが追加され、「ここでは dotted key パスを意味する。`source.configPath`（設定ファイル絶対パス）と混同しないこと」「`source.path` を使うこと」が明記された |
| LOW: TC-030 カテゴリが 'unit' だが実体は typecheck gate | test-cases.md TC-030 | **解消済み** — TC-030 の Category が `gate` に変更され、GWT が削除されて検証フェーズ名のみの記述形式に修正された |
| LOW: Scenario の custom reviewer 実効モデルが snapshot.model のフォールバックを省略 | spec.md | **解消済み** — Scenario THEN 節が `snapshot.model ?? DEFAULT_REVIEW_MODEL`（未設定時は `DEFAULT_REVIEW_MODEL`（`claude-sonnet-5`）にフォールバック）に修正され、TC-001 に両パターンを固定するコメントも追加された |

### 整合性確認

| チェック項目 | 結果 |
|---|---|
| TC Summary/Result 整合（Automated:31、gate 2件） | ✓ TC-030（gate）・TC-033（gate）の 2 件が除外されており、31 automated = 33 − 2 ゲート が成立 |
| 受け入れ基準 8 項目が TC に対応するか | ✓（TC-001/002/005/006/007/008/023/024/011/012/013/014/015/026/018/019/020/030/033 で網羅） |
| prepare() の挿入点（compose 後・bootstrapJob 前）が現行コードと整合するか | ✓（pipeline-run.ts の composeReviewerDescriptor l.121 → validateDescriptorInputCompleteness l.126 → assertNoDuplicateLiveJob l.140 → bootstrapJob l.143、挿入は 135〜140 行の間） |
| RealRuntimeStrategy に listSupportedModels を含めない（managed に強制しない）設計 | ✓（D6 で明示、runtime-strategy.ts の Optional method パターンを踏襲） |
| alias 追加後の既存テスト model-registry.test.ts green | ✓（toEqual(BUILTIN_MODEL_REGISTRY) は追加後も自己参照比較であり、件数変動は無影響） |
| provider === "openai" 除外の TC 固定 | ✓（TC-005, TC-010） |
| session cleanup 全経路の TC 固定 | ✓（TC-018 timeout, TC-019 success, TC-020 SDK throw） |
| doctor T-07 の optional 条件付き配置が受け入れ基準に必須でないことの明確性 | ✓（design.md D7 Note に「doctor の構造的制約」「受け入れ基準の必須項目ではない」と明記） |

---

## 検証できなかった項目

1. **TC-033（gate）の実際のビルド・テスト実行**: 実装前のため `bun run typecheck && bun run test` は未実行。設計上の問題は発見されていないが、型チェックの通過は実装フェーズで確認が必要。

2. **`Query.supportedModels()` が streaming mode 起動直後に利用可能かどうかの実機確認**: sdk.d.ts:2026-2030 のコメントに基づく設計であるが、SDK の実際の挙動は実装時に確認が必要。

---

## Findings 詳細

### Finding 1: T-05 で導入された `SdkModelInfo` 型の定義が spec 内に存在しない（LOW / fixable）

**概要**: tasks.md T-05 は `ClaudeSdkQueryResult` に追加するメソッドとして `supportedModels(): Promise<SdkModelInfo[]>` を定義しているが、`SdkModelInfo` がどのように定義されるべきかの仕様がない。

**根拠**:
- tasks.md T-05 line 97: "`ClaudeSdkQuery` の戻り値型 `ClaudeSdkQueryResult`（`src/adapter/claude-code/sdk-loader.ts`）に `supportedModels(): Promise<SdkModelInfo[]>` と `close(): void` を追加すること"
- tasks.md T-05 line 121: "起動した `Query` の `supportedModels()` を呼び、`ModelInfo[].value` を抽出して `{ kind: "listed", models }` を返す"
- sdk.d.ts:1064 で SDK 側の正式型は `ModelInfo = { value: string; displayName: string; description: string; ... }` として定義済み
- `SdkModelInfo` という名称は sdk.d.ts にも sdk-loader.ts にも存在しない（新規 local alias）

**影響**: 実装者は以下の選択肢から判断が必要:
- `import type { ModelInfo as SdkModelInfo } from "@anthropic-ai/claude-agent-sdk"` としてリネーム
- `interface SdkModelInfo { value: string }` として必要最小限を local 定義
- `type SdkModelInfo = { value: string; [key: string]: unknown }` として structural subtype 定義

probe が使う `.value` フィールドのみが必要なため、実装上の実害は小さい。しかし sdk-loader.ts に明示した型名が未定義のまま実装仕様を渡すと、型安全性の実現方針が実装者に委ねられる。

**改善案**: tasks.md T-05 の `ClaudeSdkQueryResult` 定義箇所に「`SdkModelInfo` は sdk.d.ts の `ModelInfo` の local alias または `{ value: string }` の minimal 定義として sdk-loader.ts 内に置く」旨を 1 行追記することで実装方針が確定する。
