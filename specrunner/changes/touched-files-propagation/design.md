# Design: 先行 step の touched files を後続 step prompt に伝搬する

## Context

pipeline の各 step は独立した agent session として実行され、前 session の文脈を持たない。
後続 step（reviewer / fixer 群）は、先行 step が既に特定した「この request の主役ファイル」を
毎回 Grep / Glob で独立に再発見しており、この発見探索が job あたり相当数の turn を占め、
同一ソースが複数セッションで重複読みされている。

先行 request で導入済みの change folder artifact 同梱（`src/adapter/shared/artifact-bundle.ts`）は、
design.md / tasks.md / spec.md 等の change folder 内成果物を後続 prompt に注入する。
本 change はその補完として、artifact では救えない「request 固有の登場人物ソース / テストファイル」を
対象に、先行 step が実際に touch したファイル一覧を後続 step の prompt にヒント注入する。
同一 job 内の伝搬であり、注入知識の鮮度リスクはない。

### 現状コードの前提（確認済み）

- **記録点**: `src/adapter/claude-code/agent-runner.ts` の `runQuery`（626 行〜）は SDK message を
  `for await` で逐次観測する。`emitToolProgress` が `isToolUse`（`src/adapter/claude-code/message-types.ts`）で
  `stream_event` の `content_block_start` を narrow するが、この event の `input` は streaming 中に
  部分的（空 `{}`）であり得る。
- **完全な input を持つ message 種別**: SDK の `type: "assistant"` message（`SDKAssistantMessage`）は
  `message.content: BetaContentBlock[]` を持ち、その `tool_use` block（`BetaToolUseBlock = { id, name, input, type }`）は
  完成した `input` を保持する。抽出はこの message 種別から行う。
- **共有注入層**: `buildArtifactBundle(cwd, slug)` は fail-open（空 or サイズ超過で `""` を返し従来 prompt になる）。
- **prompt 組成点**: claude-code `agent-runner.ts:462-464` と codex `agent-runner.ts:335-336` は
  いずれも `artifactSection` を `baseFullPrompt` に挿入する同型パターンを持つ。
- **state 永続化**: `JobStateStore.persist` → `stateToStateJson(state)` を state.json に atomic write する。
  `stateToStateJson` は `history` / `steps`（journal 由来）と slug mode の machine-local フィールドのみ除去し、
  それ以外の top-level フィールドは素通しする。`validateJobState` は未知フィールドを素通しする
  （`return raw as JobState`）。したがって新規 top-level フィールドは state.json 経由で resume を跨いで
  round-trip する。これは `reviewers` / `reviewerStatuses` / `synthesizedCommits` / `biteEvidence` と同型。
- **state 書き込み点**: 成功した agent step は `StepExecutor.runAgentStep` → `AgentRunResult` を
  `StepExecutionResult`（kind: "success"）に詰め、`CommitOrchestrator.commitSuccess` が
  `store.persist` する。ここが in-memory state → state store 一元永続化の単一経路。

## Goals / Non-Goals

**Goals**:

- claude-code adapter の agent 実行中に、agent が使用した Read / Edit / Write の対象ファイルパスを
  step 単位で記録する（完全 input を持つ message 種別からのみ抽出）。
- 記録を worktree 相対に正規化し、worktree 外と change folder 配下を除外、step 内で重複排除、最大 100 件で打ち切る。
- 記録を pipeline の in-memory state 経由で既存 state store に一元化して永続化し、同一 step 再実行時は最新 run で置換する。
- 後続 step の prompt 組み立て時（artifact bundle と同じ共有層）に「step 名 → ファイル一覧」セクションを注入し、
  「出発点のヒントであり網羅ではない。レビュー・探索の範囲をこの一覧に制限してはならない」を明記する。
- 記録が空なら注入なし（従来 prompt、fail-open）。注入セクション合計サイズ上限 16KB、超過時は注入なし（部分注入しない）。
- resume 経路で記録が保持され、resume 後の step にも注入される。
- codex adapter は記録しないが、注入側は共有層経由のため、将来 codex 側が記録を実装すれば追加変更なしで注入される。

**Non-Goals**:

- codex adapter での touched files 記録。
- Grep / Glob のパターン・検索結果の記録。
- Bash 経由のファイルアクセス（cat 等）の検出。
- 効果実測（merge 後に attended で実施）。
- follow-up / postWork / output-repair turn での記録（D6）。
- 並列 reviewer round member での記録（D6）。
- managed runtime への注入配線（記録主体が無いため注入は常に no-op；scope 外）。

## Decisions

### D1: 記録は `type: "assistant"` message の完成 tool_use block から抽出する

`stream_event` の `content_block_start`（`isToolUse` が narrow する対象）は streaming 中に `input` が
部分的（空 `{}`）であり得るため、これを根拠にしない。代わりに SDK の `type: "assistant"` message の
`message.content` 配列を走査し、`type === "tool_use"` かつ `name ∈ {Read, Edit, Write}` の block の
`input.file_path`（string のみ）を抽出する。この message 種別の `input` は完成形である。

- **Rationale**: 要件が明示する「input が完全な形で得られる message 種別」に一致し、部分 input による
  空パス・欠損パスの取りこぼしを構造的に排除する。
- **Alternatives considered**:
  - `content_block_start` を記録点に流用（`emitToolProgress` と同じ）: partial input を根拠にするため却下。
  - `~/.claude` の transcript 解析: 外部フォーマット依存になるため却下（adapter が既に観測している
    SDK message stream から記録する）。

### D2: 記録は JobState の新規 top-level フィールド `touchedFiles: Record<stepName, string[]>` に持つ

`state.json` projection で round-trip し、event-journal threading を要しない。`reviewerStatuses` /
`synthesizedCommits` / `biteEvidence` と同型の top-level フィールドとして扱う。

- **Rationale**: `stateToStateJson` が top-level フィールドを素通しし、`validateJobState` が未知フィールドを
  素通しするため、state.json への書き込みと resume 時の読み出しで記録が自動的に保持される（要件 6 を
  store 層で満たす）。`.specrunner/local/` 等への別ファイル直接追記は、in-memory 先行の state 丸ごと persist と
  競合して記録が巻き戻る既知問題があるため採らない。
- **Alternatives considered**:
  - `StepRun.outcome.touchedFiles`（journal 側）: StepRun は events.jsonl fold 由来で、run ごとに append される。
    「最新 run で置換」は末尾 run 参照で自然に得られるが、記録の一元管理点が top-level フィールドより
    分散する。top-level フィールドの方が注入側の参照が単純（`state.touchedFiles`）で、既存の同型フィールド群と
    一貫するため採用。
  - 別 store / 別 disk ファイル: architect 評価で却下済み（巻き戻り問題）。

### D3: 伝搬経路は adapter → AgentRunResult → StepExecutionResult → CommitOrchestrator.commitSuccess

claude-code adapter は run 中に記録し、`AgentRunResult.touchedFiles?: string[]` として返す。
`StepExecutor.runAgentStep` はこれを `StepExecutionResult`（kind: "success"）に透過し、
`CommitOrchestrator.commitSuccess` が `state.touchedFiles[step.name] = files`（置換）を適用してから
`store.persist` する。これが in-memory state → state store の単一永続化経路。

- **置換セマンティクス**: 同一 step の再実行（fixer の iteration 2 等）では、`state.touchedFiles[step.name]` を
  最新 run のリストで丸ごと上書きする（append しない）。要件 3「最新 run の記録で置き換える」に一致。
- **undefined と `[]` の区別**: `AgentRunResult.touchedFiles` が `undefined`＝この runtime は記録しない
  （managed / codex）→ state を触らない。`[]`＝記録したが touch なし → 空で置換する。この区別により
  codex / managed 経路は state.touchedFiles を一切生成しない。
- **Rationale**: 既存の `commitOid` / `addedTurns` / `invocationMetrics` と同じ透過パターンで、
  新しい書き込み点を作らず単一 writer（CommitOrchestrator）を維持する（B-13）。
- **Alternatives considered**: `ctx.emit` による domain event 化: 新しい event 種別と projection handler が
  必要になり、既存の透過パターンより重い。却下。

### D4: 正規化ルール（worktree 相対・除外・dedup・cap 100）

各 raw `file_path` を次の順で処理する:

1. `path.resolve(cwd, filePath)` → `path.relative(cwd, resolved)` で worktree 相対化。
2. worktree 外を除外: 相対パスが `..` で始まる、または絶対パスなら除外
   （`createWorkspaceToolGuard` の `isInside` 判定と同じ boundary ロジック）。
3. change folder 配下を除外: posix 正規化した相対パスが `specrunner/changes/`（`changesDirRel()`）配下なら除外
   （artifact 同梱で既知のため）。
4. step 内で重複排除（挿入順を保持）。
5. 最大 100 件で打ち切る（101 件目以降は捨てる）。

- **Rationale**: worktree 相対の統一表現により後続 step の探索ヒントとして直接使える。change folder 除外で
  artifact bundle との重複注入ノイズを避ける。cap で state / prompt の肥大を抑える。
- **Alternatives considered**: 絶対パスのまま記録: worktree 移動・resume で不整合、prompt でも冗長。却下。

### D5: 注入は共有層の純関数 `buildTouchedFilesSection(state, currentStepName)` で行い、両 adapter に配線する

`src/adapter/shared/` に純関数（I/O なし）を新設する。`state.touchedFiles` から `currentStepName` を除いた
（＝先行 step のみ）エントリを「step 名 → ファイル一覧」セクションとして構築し、必須文言
「出発点のヒントであり網羅ではない。レビュー・探索の範囲をこの一覧に制限してはならない」を含める。
claude-code / codex 両 adapter の prompt 組成点で、`artifactSection` と同様に `baseFullPrompt` へ挿入する。

- **fail-open**: 対象エントリが無い（全 step が空 or 記録なし）→ `""`（従来 prompt）。
- **サイズ上限**: 構築後セクションの UTF-8 バイト長が 16KB（`16 * 1024`）超過 → `""`（部分注入せず全体を落とす）。
- **currentStepName 除外**: 注入対象は先行 step の記録のみ。現 step 自身の過去 run 記録は除外して
  「先行 step の一覧」というセマンティクスを保つ。
- **Rationale**: 純関数のため単体テストが容易（要件が求める模擬 state からの注入検証）。共有層に置くことで
  codex 側が記録を実装すれば追加変更なしで注入される（要件 7）。artifact bundle と同じ fail-open 方針で、
  空・超過時に従来 prompt へ安全に退避する。
- **Alternatives considered**: `buildArtifactBundle` に統合: あちらは change folder ファイルの fs 読み出しに
  特化した関数であり、state 由来・純関数の本 section とは責務が異なる。同じ共有層の sibling 関数として分離。

### D6: 記録境界は「main work turn の for-await ループ」かつ「sequential step（commitSuccess）」

- **turn 境界**: 記録は `runQuery` の main work ループ（`agent-runner.ts:626` の for-await）でのみ行う。
  report_result retry / postWorkPrompts / output-repair の follow-up turn では記録しない。これらの turn は
  report tool 再送・検証再送が主で、実質的な Read/Edit/Write の主役ではない。
- **step 境界**: 記録の state 書き込みは sequential step の `commitSuccess` 経路のみ。並列 reviewer round member
  （custom reviewer、read-only）は `commitRound` 経路で、主役ファイルの生成者ではないため今回は記録しない。
  主要な file 生成 step（design / implementer / 各 fixer）は全て sequential であり、この境界で網羅される。
- **codex / managed**: codex adapter は記録しない（tool 体系が claude-code と異なり抽出マッピングが別物になるため）。
  managed も記録しない。いずれも `touchedFiles: undefined` を返し state を触らない。
- **Rationale**: 主役ファイルを生成する経路（main turn × sequential step）に記録を絞ることで、最小の変更点で
  要件の対象（request 固有の登場人物ソース/テスト）を捉える。

## Risks / Trade-offs

- **[Risk] partial input を根拠にすると空パス・欠損パスを記録する** → D1 により完成 input を持つ
  `type: "assistant"` message からのみ抽出する。unit test で partial `content_block_start` を無視することを検証。
- **[Risk] 注入がレビュー独立性を侵食する（reviewer が implementer の見た場所しか見なくなる）** → 注入文言で
  「範囲をこの一覧に制限してはならない」を明示。ヒントであって範囲制限ではないことを prompt 上で禁止として記述。
- **[Risk] 記録・注入の肥大化** → 1 step 100 件 cap（D4）、change folder 除外（D4）、注入 16KB 上限（D5、超過時は
  全体を落とす fail-open）で抑制。
- **[Risk] resume で記録が失われる** → D2 により state.json top-level フィールドとして round-trip
  （`reviewerStatuses` 等で実証済みの経路）。store 往復 test で保証。
- **[Trade-off] follow-up / round member を記録しない** → 主役ファイル生成経路は main turn × sequential step に
  収まるため、対象取りこぼしは限定的。将来必要なら同じ透過パターンで拡張可能。
- **[Trade-off] codex では注入が常に空** → codex job では記録主体が無く `touchedFiles` が生成されないため注入は
  no-op。共有層配線により、将来 codex 記録を足すだけで有効化される。

## Open Questions

なし（scope 内の設計判断は D1〜D6 で確定）。
