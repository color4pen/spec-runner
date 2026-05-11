# Design: add-spec-review-baseline-check

## Overview

spec-review が delta spec のみをレビューしている現状では、baseline spec との整合性問題（存在しない Requirement の MODIFIED、既存 Requirement の ADDED 等）が spec-merge 時まで検出されない。この変更は spec-review の段階で baseline spec を参照可能にし、早期フィードバックを実現する。

## Design Decisions

### D1: enrichContext を Step interface の optional メソッドとして追加

**選択**: `AgentStep` interface に `enrichContext?(dynamicContext: DynamicContext, cwd: string, slug: string): Promise<DynamicContext>` を追加する。

**理由**: `buildMessage` は pure function 制約がある（I/O 不可）。baseline spec の読み取りは I/O を伴うため、buildMessage の前に async で実行する別のフックが必要。既存の Step は optional なので影響なし。

**代替案と却下理由**:
- `buildMessage` を async にする → 全 Step と両 adapter の呼び出し箇所を変更する必要があり、影響範囲が大きすぎる
- `collectDynamicContext` に baseline 収集を追加する → pipeline 起動時に slug ごとの delta spec が不明であり、spec-review 固有の情報を汎用コンテキストに混ぜるべきでない
- adapter 内で直接 baseline を読む → Step 固有のロジックを adapter に漏洩させ、port/adapter 境界を壊す

### D2: DynamicContext に baselineSpecs フィールドを追加

**選択**: `DynamicContext` interface に `baselineSpecs?: Record<string, string>` を追加する。key は capability 名、value は baseline spec 全文。

**理由**: DynamicContext は既に `AgentRunContext` 経由で adapter に渡り、`StepContext` 経由で `buildMessage` に到達する。既存の流通経路をそのまま使える。新しい型を作って流通経路を別途用意するより最小限の変更で済む。

### D3: enrichContext の呼び出し位置は両 adapter の buildMessage 直前

**選択**: `ClaudeCodeRunner.run()` と `ManagedAgentRunner.runPollingStyle()` の両方で、stepCtx 構築後・buildMessage 呼び出し前に `step.enrichContext?.()` を呼ぶ。enrichContext が返した DynamicContext で stepCtx.dynamicContext を差し替える。

**理由**: StepExecutor は adapter に ctx を渡し、adapter が buildMessage を呼ぶ構造。enrichContext は I/O を伴い cwd が必要なので、cwd を持つ adapter 側で呼ぶのが自然。executor に置くと ctx 組み立てと buildMessage 呼び出しの間に executor → adapter の制御が割り込み、責務が分散する。

**代替案と却下理由**:
- executor 側で enrichContext を呼んだ後に adapter に渡す → executor は現在 adapter に ctx（AgentRunContext）を丸ごと渡す構造であり、enrichContext の結果を「adapter に渡す前に差し込む」には executor が dynamicContext を取り出してリビルドする必要がある。また executor には cwd が存在しない（adapter が ctx.cwd を持つ）ため、同等の I/O を実行するには cwd の受け渡し経路を新設しなければならず変更量が増える。採用した adapter 側呼び出しのトレードオフとして、将来 adapter を追加した際に enrichContext 呼び出しを忘れるリスクがある。このリスクは「AgentStep が enrichContext を optional として宣言する」設計上、呼び出し漏れは動作上 no-op（undefined チェックで安全にスキップ）に収まり、型チェックで検出可能な欠陥にはならない。将来 adapter が増えた場合は adapter の共通基底クラス（または共通関数）に切り出すことで対処する。

### D4: capability 列挙は spec-merge.ts のパターンを踏襲

**選択**: `specrunner/changes/<slug>/specs/` の子ディレクトリを列挙し、各 capability に対応する `specrunner/specs/<capability>/spec.md` を読み取る。spec-merge.ts の lines 360-368 と同じ `readdir → stat → isDirectory` パターン。

**理由**: 一貫性。delta spec が存在しない場合（refactoring 等）は specs/ ディレクトリ自体がないため、enrichContext は DynamicContext をそのまま返す（no-op）。

### D5: baseline spec の注入は初期メッセージに含める

**選択**: `buildSpecReviewInitialMessage` にテンプレート変数 `{{BASELINE_SPECS}}` を追加し、enrichContext で収集した baseline spec の内容を展開する。

**理由**: system prompt はセッション全体で固定。baseline spec の内容はリクエストごとに異なるため、初期メッセージに含めるのが適切。通常 1-3 capability、5-15KB でコンテキスト膨張は問題にならない（spec-review は 1M context model を使用）。

## Architecture

### データフロー

```
pipeline start
  │
  ├─ collectDynamicContext() → DynamicContext { gitLog, diffStat, changesList }
  │
  ▼
StepExecutor.runAgentStep()
  │
  ├─ ctx = { step, state, ..., dynamicContext }
  │
  ▼
Adapter.run(ctx)
  │
  ├─ stepCtx = { config, slug, cwd, request, repo, dynamicContext }
  │
  ├─ [NEW] step.enrichContext?.(stepCtx.dynamicContext, cwd, slug)
  │         → DynamicContext + { baselineSpecs: Record<string, string> }
  │         → stepCtx.dynamicContext を差し替え
  │
  ├─ step.buildMessage(state, stepCtx)
  │         → buildSpecReviewInitialMessage() 内で
  │           dynamicContext.baselineSpecs を {{BASELINE_SPECS}} に展開
  │
  ▼
Agent session (spec-review)
  → system prompt に baseline 整合性チェック指示あり
  → 初期メッセージに baseline spec 全文あり
  → MODIFIED/REMOVED/ADDED の整合性を検証
```

### 変更対象ファイル

| File | Change |
|------|--------|
| `src/git/dynamic-context.ts` | `baselineSpecs?: Record<string, string>` を DynamicContext に追加 |
| `src/core/step/types.ts` | AgentStep に `enrichContext?` を追加 |
| `src/adapter/claude-code/agent-runner.ts` | buildMessage 前に enrichContext 呼び出し |
| `src/adapter/managed-agent/agent-runner.ts` | buildMessage 前に enrichContext 呼び出し |
| `src/core/step/spec-review.ts` | enrichContext 実装（capability 列挙 + baseline 読み取り） |
| `src/prompts/spec-review-system.ts` | baseline 整合性チェック指示 + テンプレート変数追加 |

## Scope Boundaries

- enrichContext は spec-review のみ実装する。他 Step への適用は将来のリクエストで行う
- specIndex（add-baseline-spec-context）との依存なし。baseline spec の読み取りは enrichContext 内で直接行う
- delta spec のパースは行わない（パース済みの構造は不要。baseline spec の全文を注入し、agent に整合性チェックを委ねる）
- テストは既存の型チェック + テストスイートの pass を確認。enrichContext の unit test は追加しない（I/O heavy で mock が複雑、かつ integration は spec-review 実行時に検証される）。`enrichContext` が未定義の Step（ProposeStep、ImplementerStep 等）で adapter が正常に動作すること（regression guard）は、既存テストスイートが enrichContext なしの Step を対象に動作確認しているため追加テスト不要と判断する。adapter 変更後に `bun run test` が全 pass することを Task 6 で確認する
