## Context

propose agent は delta spec を生成する際、baseline spec（`specrunner/specs/<capability>/spec.md`）を参照していない。MODIFIED/REMOVED delta を書く際に既存 Requirement を知らないため、存在しない Requirement への参照や矛盾した delta が生成されるリスクがある。

DynamicContext は pipeline 開始時に一度だけ収集され、各 step の `buildMessage` に注入される。現在 `gitLog`, `diffStat`, `changesList` の 3 フィールドを持つ。`collectDynamicContext` は `Promise.all` で全フィールドを並列収集し、個別の失敗は空値にフォールバックする。

`buildInitialMessage`（`src/prompts/propose-system.ts`）の第4引数は現在 `{ changesList?: string[] }` という partial pick 型。implementer の `buildImplementerInitialMessage` は `DynamicContext` 型を直接受け取るパターンを採用済み。

PR #195 で `specsDirRel()` / `baselineSpecPath()` ユーティリティが `src/util/paths.ts` に追加済み。baseline spec は 51 capability、各ファイル平均 2KB。

## Goals / Non-Goals

**Goals:**

- DynamicContext に specIndex（capability 名 + Purpose 1行目 + requirement 数）を追加
- propose の初期メッセージに specIndex テーブルを注入
- propose のシステムプロンプトに baseline spec Read 許可指示を追加
- `buildInitialMessage` の引数型を `DynamicContext` に統一

**Non-Goals:**

- baseline spec の全文を initial message に注入（トークン爆発）
- propose 以外の step への specIndex 注入
- spec-review や implementer の動作変更
- specIndex を使った自動バリデーション

## Decisions

### D1: specIndex は軽量 index モデルを採用

全 baseline spec の全文を注入するとトークン数が爆発する（51 specs × 平均 2KB = ~100KB）。代わりに capability 名・Purpose 1行目・requirement 数の 3 フィールドのみを index として収集し、~1000 トークンに抑える。propose agent は specIndex を見て、自身が delta を書こうとしている capability の baseline spec のみを Read ツールで取得する。

**Alternatives**: 全文注入（コスト高、context window 圧迫）、capability 名のみ（Purpose がないと agent が不要な Read を乱発）

### D2: collectSpecIndex は collectChangesList と同じフォールバックパターン

`specrunner/specs/` が存在しない場合（新規プロジェクト等）は空配列を返す。例外は投げない。`collectDynamicContext` の `Promise.all` に追加して既存フィールドと並列収集する。

### D3: buildInitialMessage の第4引数を DynamicContext 型に変更

現在の `{ changesList?: string[] }` を `DynamicContext` 型（import from `src/git/dynamic-context.ts`）に変更する。`implementer.ts` と同じパターンに統一する。`DynamicContext` 自体が optional パラメータなので後方互換性に問題なし。呼び出し元の `propose.ts` は既に `deps.dynamicContext`（型: `DynamicContext | undefined`）をそのまま渡しているため変更不要。

### D4: baseline 参照指示は path-fence セクション直後に配置

path-fence は「`specrunner/changes/<slug>/` 外のファイルを **編集** するな」というルール。Read は編集ではないため、`specrunner/specs/` 配下の Read を許可しても path-fence に矛盾しない。path-fence 直後に専用セクションを追加し、delta spec 作成前に対応する baseline spec を Read するよう指示する。

### D5: Purpose 抽出は `## Purpose` の次の非空行

baseline spec の形式は固定（`## Purpose` → 空行 → 本文）。最初の非空行を 1 行抽出する。`## Requirements` 以降に入ってしまわないようヘッダー検知でガードする。Purpose が存在しない場合は空文字列を返す。

## Risks / Trade-offs

- [Risk] spec.md のフォーマットが想定と異なる場合に Purpose 抽出が失敗する → Mitigation: 空文字列フォールバック。requirement カウントも 0 で安全側に倒す
- [Risk] specIndex テーブルの注入で propose の context window を圧迫する → Mitigation: ~1000 トークン程度。propose は opus-4-6[1m] で十分な余裕がある
- [Risk] agent が specIndex を無視して baseline を Read しない → Mitigation: system prompt の指示で最低限の誘導は行う。強制はしない（agent 判断に委ねる設計）
