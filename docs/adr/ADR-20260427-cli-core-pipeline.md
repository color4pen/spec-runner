# ADR-20260427: CLI Core Pipeline — `specrunner run` propose ステップの構造的決定

## ステータス

採用（accepted）

## コンテキスト

ADR-20260427-cli-first-architecture で SpecRunner を CLI ファーストに転換する方針を決定した。本 ADR はその最初の実装である `specrunner run <request.md>`（propose ステップのみ）の **構造的決定事項** を記録する。後続の spec-review / implement / code-review 接続の基盤となるため、設計の不変条件を明示しておく必要がある。

調査と spec-review / code-review の過程で確定した制約:

- Managed Agents SDK v0.91.0 の `client.beta.sessions.retrieve()` は `status` のみ返し、polling 単独では `stop_reason: end_turn` を直接観察できない（`events.list` API 経由でのみ取得可能）
- Custom Tool（`register_branch`）受信のため propose セッションでは SSE が必要だが、完了検知は polling を主とする方が運用的に安定
- 過去 PR #4 / #5 で Custom Tool の二重定義（Agent tools 配列への登録漏れ）によるサイレント障害（Bug 1）を発生させた経験あり
- フィードバック「`bun:*` / `Bun.*` は import しない」「決定的導出のソースは単一にする」「Custom Tool への外部呼び出しはリトライ前提」を構造に組み込む必要がある
- spec-review iter 2 / code-review iter 2 で `EnvironmentCreateParams` の SDK 型仕様が design.md と乖離していることが判明（SDK は `config.packages` のネスト構造を要求）

## 決定

### D1. 完了検知は polling primary、SSE は Custom Tool 受信専用

- 完了判定は `client.beta.sessions.retrieve()` をポーリングし、`status === "idle"` を確定条件とする（指数バックオフ 2s → 30s 上限、×1.5 増、ジッタ ±20%）
- SSE stream は **Custom Tool（`register_branch`）受信のためのみ** に接続する。SSE で `session.status_idle` + `stop_reason: "end_turn"` を観測した時点で **必ず break** する（`completion.ts` の `assertBreakAfterCompletion` ガードで検証）
- SSE 切断時はリトライせず polling fallback に切替える。完了経路を明示区別するため `SessionResult.terminationReason: "end_turn" | "terminated" | "disconnected" | "interrupted"` の enum で SSE / polling 経路を識別する（code-review HIGH-2 由来の設計改善）

### D2. Custom Tool は colocate factory + 単一 registry に強制

- `src/core/tools/register-branch.ts` で `defineCustomTool({ definition, handler })` を **同一 export** として定義する
- `src/core/tools/registry.ts` の `getDefinitions()` / `getHandler(name)` を **唯一の参照点** とし、Agent 作成時の `custom_tools` 配列・SSE dispatch table・`definitionHash` 計算の 3 箇所がすべてこの 1 関数経由で結線される
- 「片方だけ登録」が構造的に不可能になる。Bug 1（PR #4/#5）の再発を構造的に予防する
- `tasks.md 5.5` の grep ガードで `name: "register_branch"` が `register-branch.ts` 以外に現れないことを CI で検証する

### D3. SessionResult.terminationReason enum で SSE / polling 経路を区別

- `SessionResult` に `terminationReason: "end_turn" | "terminated" | "disconnected" | "interrupted"` を追加し、`pipeline.ts` の `needsPollingFallback` 判定を `terminationReason !== "end_turn" && !== "terminated"` で行う
- code-review iter 1 の HIGH-3 で指摘された「`idleEndTurnDetected: false` と `sseDisconnected: false` が同時成立する曖昧経路」を解消する設計

### D4. Node.js 標準 API のみで実装（`bun:*` / `Bun.*` import 禁止）

- `node:crypto.randomUUID` / `node:fs/promises` / `node:child_process.execFile` / global `fetch`（Node 20+）/ `AbortController` を採用
- 開発時は bun で実行可だが、import path は Node.js 互換の標準 API に限定する
- `tasks.md 6.1` の static check で `bun:*` / `Bun.*` import を CI で検出する

### D5. atomic write + XDG path resolution は util ヘルパに抽出

- `src/util/atomic-write.ts` に `<path>.tmp.<random>` → `fsync` → `rename` の atomic write を集約（mode 引数で permission 強制も対応）
- `src/util/xdg.ts` に `resolveXdgConfigDir()` / `resolveXdgDataDir()` を集約（`XDG_CONFIG_HOME` / `XDG_DATA_HOME` フォールバック付き）
- `src/config/store.ts` と `src/state/store.ts` の両方が同一実装を共有（drift 防止）。module-analysis R1 / R2 採用

### D6. CLI 層は薄いアダプタ、preflight は core/preflight.ts に分離

- `cli/run.ts` の fail-fast バリデーション（config 存在 / git repo / origin が GitHub / request.md パース可能）は `src/core/preflight.ts` の `runPreflight()` に集約
- CLI 層は「引数パース → core 呼び出し → exit code 翻訳」のみに純化
- preflight の 5 チェックがファイルシステム / git に依存するため、core 層で deps 注入してテスト可能にする
- module-analysis S5 採用

### D7. Anthropic SDK の Environment 作成は `config.packages` のネスト構造を使う

- SDK v0.91.0 の `EnvironmentCreateParams` は `packages` を直接受け付けない。`{ name, config: { type: "cloud", packages: { type: "packages", npm: [...] } } }` のネストが必要
- design.md の記述（`packages` 直渡し）は **SDK 型を正として優先** し、実装で SDK 仕様に追従する（constraints.md「外部 SDK に依存する設計は、実装前に型定義を調査し仕様に反映する」と整合）
- spec の修正は次イテレーションまたは spec-fixer で対応する

## 検討した代替案

### Alternative A: SSE primary（完了検知）

- **Pros**: イベント駆動でレイテンシ最小、polling のレート制限を消費しない
- **Cons**: 接続切断・タイムアウト・取りこぼしのリスクが高く、CI/CD ランナーの完了判定として不安定。長時間 idle 中に課金されないため retrieve で十分
- **不採用理由**: D1 の通り SSE は Custom Tool 受信専用に限定し、完了確定は polling で行う

### Alternative B: 規約ベースの Custom Tool 結線（同名なら自動結線）

- **Pros**: ボイラープレートが少ない
- **Cons**: typo / case 違いを検出できず、サイレント障害の温床になる
- **不採用理由**: Bug 1 の再発を構造的に阻止できない。D2 の colocate factory + registry 経由を強制する

### Alternative C: bun ネイティブ API（`Bun.file`, `bun:test` 等）

- **Pros**: 開発時の実行性能向上、API が簡潔
- **Cons**: Node.js 互換性が崩れ、本番ランタイムを bun に縛る。エコシステム依存が増える
- **不採用理由**: D4 の通り Node.js 標準のみで実装する規律を維持する（`feedback_mainstream_toolchain` と整合）

### Alternative D: store ごとの inline atomic write 実装

- **Pros**: 各モジュールが自己完結
- **Cons**: 差分検証のために両方をテストする必要があり、片方だけ修正された場合の整合性 drift が発生
- **不採用理由**: D5 の通り util ヘルパに抽出して single source とする

### Alternative E: cli/run.ts に preflight を直書き

- **Pros**: ファイルが少なくなり、シンプル
- **Cons**: cli 層が「単なるアダプタ」を超えて検証ロジックを抱える。Phase 2 で run / fixup / merge / cancel が増えると preflight が複数個所に重複する
- **不採用理由**: D6 の通り core/preflight.ts に分離する

### Alternative F: design.md の記述を維持して SDK 側に合わせさせる

- **Pros**: ドキュメント一貫性
- **Cons**: SDK 型と乖離した実装は型エラーで動かない。constraints.md「SDK 型を正とする」原則に反する
- **不採用理由**: D7 の通り SDK を正として実装し、spec 側を後追い修正する

## Consequences

### Positive

- **Bug 1 再発の構造的予防**: D2 の colocate factory + 単一 registry により、Custom Tool 追加時の片側登録漏れが構造的に不可能になる
- **完了経路の明示化**: D3 の `terminationReason` enum により、SSE / polling のフォールバック判定がサイレント障害ではなく明示的に行われる
- **Node.js 互換性の確保**: D4 により本番ランタイムを bun に縛らず、CI/CD ランナーとしての可搬性を保つ
- **drift 防止**: D5 の util 抽出で atomic write / XDG 解決を 1 箇所に集約し、テストも 1 度書けば両ストアをカバーできる
- **CLI 層の純化**: D6 で cli/* のテストが smoke レベルに限定でき、検証ロジックは core で deps 注入テスト可能
- **SDK バージョン耐性**: discriminated union narrowing を `sdk/sessions.ts` に閉じることで、SDK バージョンアップの影響範囲が局所化される

### Negative

- **polling のレート消費**: D1 の polling primary は read 600 req/min を 1 ジョブで消費するが、指数バックオフで 1 ジョブあたり数十 req/min に抑制
- **registry 経由の冗長さ**: D2 の colocate factory + registry は Custom Tool 1 個に対して 4 ファイル（types / registry / register-branch / index）を要求し、初期実装のオーバーヘッドが増える
- **util 抽出の境界判断**: D5 で抽出すべきヘルパの範囲（exec ラッパ等）は今後の責務肥大化リスクを見ながら継続判断が必要

### Risks

- **[R1] SSE 切断 → polling fallback で `requires_action` のまま停止**: Custom Tool 応答漏れで session が `requires_action` に固着するリスク。Phase 1 ではタイムアウトで fail し、recovery（events.list で未処理 custom_tool_use を再応答）は Phase 2
- **[R2] SDK v0.91.0 → 上位バージョンで Environment / Session schema が再度変わる**: D7 の `config.packages` ネスト構造が将来変わる可能性。`sdk/*` ラッパで吸収する方針
- **[R3] polling 単独で `stop_reason: end_turn` を確定できない**: SDK の `BetaManagedAgentsSession` には `stop_reason` が含まれない。SSE 経路で確定できなかった場合は branch 検証（`BRANCH_NOT_REGISTERED` / `CHANGE_FOLDER_NOT_FOUND`）でカバー。完全対応は Phase 2 の events.list 統合
- **[R4] Custom Tool 結線の grep ガードが false negative を許す**: regex の精度に依存するため、Phase 2 で AST レベルの static check に切替検討

### Known Design Debt（review-feedback で指摘されたが Phase 1 スコープ外）

以下は code-review iter 2 で MEDIUM / LOW として残った技術負債。次の change で対処を推奨する:

- **(M1)** `events.list` を使った `idle + stop_reason` 確認、または spec 更新で完了検知の整合（finding #1）
- **(M2)** `src/auth/constants.ts:7` の GitHub OAuth client_id プレースホルダを本番値に登録するか env 必須化（finding #2）
- **(M3)** `src/auth/github-device.ts:115` の library 層 `process.exit` を `SpecRunnerError` 集約に変更（finding #3）
- **(M5/M6)** `runProposePipeline` の 332 行肥大化をフェーズ分解（`createSessionPhase` / `runSseAndPollPhase` / `verifyBranchPhase` / `verifyChangeFolderPhase`）+ GitHub verify ヘルパ抽出（finding #5, #6）
- **(M8)** must テスト 5 件（TC-052/054/055/102/103）の auto-implementable 分の追加実装（finding #8）
- **(L4)** `assertBreakAfterCompletion` の dead-doc-only ヘルパを削除またはテスト強化（finding #12）

## 参照

- [ADR-20260427-cli-first-architecture.md](ADR-20260427-cli-first-architecture.md) — CLI ファースト転換の経緯
- [ADR-20260424-session-pipeline-design.md](ADR-20260424-session-pipeline-design.md) — 4 セッション直列モデル
- [ADR-0012-slug-delegation-and-branch-tracking.md](ADR-0012-slug-delegation-and-branch-tracking.md) — `register_branch` Custom Tool の必要性
- `openspec/changes/2026-04-27-cli-core-pipeline/proposal.md` — 本 change の提案
- `openspec/changes/2026-04-27-cli-core-pipeline/design.md` — 詳細設計（D1-D10）
- `openspec/changes/2026-04-27-cli-core-pipeline/module-analysis.md` — module 分析（R1-R5, S1-S5）
- `openspec/changes/2026-04-27-cli-core-pipeline/implementation-notes.md` — 実装結果と Deviations
- `requests/active/2026-04-27-cli-core-pipeline/review-feedback-002.md` — code-review iter 2（approved, 7.30）
