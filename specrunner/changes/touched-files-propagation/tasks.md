# Tasks: 先行 step の touched files を後続 step prompt に伝搬する

## T-01: JobState に touchedFiles top-level フィールドを追加する

- [ ] `src/state/schema/types.ts` の `JobState` に optional 新規フィールド
      `touchedFiles?: Record<string, string[]>` を追加する（key = step 名、value = worktree 相対パス配列）。
      `reviewerStatuses` / `synthesizedCommits` と同じ「state.json projection で round-trip、
      event-journal threading 不要」の top-level フィールドとして doc コメントを付す。
- [ ] `src/state/schema/operations.ts` の `validateJobState` に軽量検証を追加する
      （`reviewerStatuses` / `biteEvidence` の検証ブロックと同じスタイル）。存在時のみ検証:
      object であること、各 value が string 配列であること。absence は valid（後方互換）。
- [ ] `stateToStateJson`（`src/store/job-state-projection.ts`）が `touchedFiles` を strip しないことを確認する
      （`history` / `steps` / machine-local 以外は素通しのため追加変更不要のはず。確認のみ）。

**Acceptance Criteria**:
- `JobState.touchedFiles` が `Record<string, string[]> | undefined` として型付けされる。
- `validateJobState` は `touchedFiles` 不在の legacy state を throw せず受理する。
- `validateJobState` は `touchedFiles` が object かつ value が string 配列の state を受理し、
  非 object / 非配列 value を throw する。
- `typecheck` が green。

## T-02: AgentRunResult に touchedFiles を追加する（port 契約）

- [ ] `src/core/port/agent-runner.ts` の `AgentRunResult` に optional フィールド
      `touchedFiles?: string[]` を追加する。doc: `undefined` = この runtime は記録しない
      （managed / codex）; `[]` = 記録したが該当なし; 非空 = 記録された worktree 相対パス列。
      claude-code のみ populate する旨を明記する。

**Acceptance Criteria**:
- `AgentRunResult.touchedFiles?: string[]` が型に存在する。
- `typecheck` が green（既存 adapter は未設定＝undefined のまま影響なし）。

## T-03: claude-code adapter に touched files 記録ロジックを実装する

- [ ] 新規モジュール（例: `src/adapter/claude-code/touched-files-recorder.ts`）に純粋な抽出・正規化ロジックを置く:
  - `type: "assistant"` message（`message.content` 配列）から `type === "tool_use"` かつ
    `name ∈ {"Read","Edit","Write"}` の block の `input.file_path`（string のみ）を抽出する関数。
    `content_block_start`（partial input）は対象にしない。
  - 正規化関数: `path.resolve(cwd, filePath)` → `path.relative(cwd, resolved)`。相対パスが `..` 始まり or
    絶対パス → 除外（`createWorkspaceToolGuard` の `isInside` と同じ boundary）。posix 化した相対パスが
    `changesDirRel() + '/'`（`specrunner/changes/`）で始まる → 除外（trailing slash 必須。`startsWith(changesDirRel())` だけでは `specrunner/changes-archive/` 等を誤除外する）。除外は `null` を返す。
  - accumulator: 挿入順を保ちつつ重複排除、最大 100 件で打ち切る。
- [ ] `ClaudeCodeRunner.run`（`src/adapter/claude-code/agent-runner.ts`）で、`runQuery` の main work
      for-await ループ（626 行付近、`emitToolProgress` と同じ場所）で assistant message を accumulator に流す。
      accumulator は `run()` スコープに 1 つ持ち、resume fallback で `runQuery` が再実行されても同一 accumulator に
      蓄積する。follow-up / postWork / output-repair turn では記録しない。
- [ ] 成功時の `AgentRunResult`（`baseResult`、1048 行付近）に `touchedFiles: <accumulator の確定リスト>` を含める。
      claude-code は常に配列を返す（touch なしなら `[]`）。

**Acceptance Criteria**:
- 記録の unit test（新規、例 `src/adapter/claude-code/__tests__/touched-files-recorder.test.ts`）:
  模擬 message stream から
  (a) Read / Edit / Write のパスが抽出される
  (b) worktree 外・change folder（`specrunner/changes/`）配下が除外される
  (c) 同一パスが重複排除される
  (d) 100 件で打ち切られる
- partial `content_block_start`（空 input）を無視することを検証する test を含む。
- Grep / Glob / Bash 由来のパス・パターン・コマンドが記録されないことを検証する test を含む。
- `typecheck && test` が green。

## T-04: 共有層に注入セクション builder を実装する

- [ ] 新規モジュール（例: `src/adapter/shared/touched-files-bundle.ts`）に純関数
      `buildTouchedFilesSection(state, currentStepName): string` を実装する（I/O なし）:
  - `state.touchedFiles` から `currentStepName` を除いた（先行 step のみ）非空エントリを集める。
  - 対象が無ければ `""` を返す（fail-open）。
  - 「step 名 → ファイル一覧」セクションを構築し、必須文言
    「出発点のヒントであり網羅ではない。レビュー・探索の範囲をこの一覧に制限してはならない」を含める。
  - 構築後セクションの UTF-8 バイト長が `16 * 1024` を超えたら `""` を返す（部分注入しない、fail-open）。
    サイズ計算は `Buffer.byteLength(section, "utf-8")`（`artifact-bundle.ts` と同方式）。

**Acceptance Criteria**:
- 注入の unit test（新規、例 `src/adapter/shared/__tests__/touched-files-bundle.test.ts`）:
  (a) 先行 step 記録あり → step 名付きセクションと「範囲をこの一覧に制限してはならない」の文言を返す
  (b) 記録なし（空 or currentStepName のみ） → `""` を返す
  (c) 16KB 超過 → `""` を返す（部分文字列も返さない）
- `currentStepName` のエントリが注入対象から除外されることを検証する test を含む。
- `typecheck && test` が green。

## T-05: 両 adapter の prompt 組成に注入を配線する

- [ ] `src/adapter/claude-code/agent-runner.ts`（462-464 の `artifactSection` 付近）で
      `buildTouchedFilesSection(ctx.state, step.name)` を呼び、結果を
      `touchedFilesSection = section ? \`\n\n${section}\` : ""` として `baseFullPrompt` に挿入する。
      既存の `artifactSection` / `resumeSection` / completion directive の順序・空文字時の byte 同一性を保つ
      （記録が空なら従来 prompt と byte 同一）。
- [ ] `src/adapter/codex/agent-runner.ts`（335-336 の `artifactSection` 付近）で同じ共有層関数を同様に配線する。
      codex は記録しないため実行時は常に `""`（no-op）だが、将来 codex 記録実装時に追加変更なしで注入される。

**Acceptance Criteria**:
- 注入配線の integration test（claude-code / codex 各 1）:
  先行 step 記録を持つ `ctx.state` を与えると、query に渡る first prompt にセクションと制限禁止文言が含まれる。
- 記録が空の `ctx.state` では first prompt が注入前と byte 同一である（既存 artifact-bundle-injection test の
  `no artifacts → byte-identical` と同じ検証スタイル）。
- 両 adapter が同一の `buildTouchedFilesSection` を import している。
- `typecheck && test` が green。

## T-06: 記録を state 書き込み経路に透過する（sequential step、置換）

- [ ] `src/core/step/commit-orchestrator.ts` の `StepExecutionResult`（kind: "success"）に
      optional `touchedFiles?: string[]` を追加する。
- [ ] `src/core/step/executor.ts` の `runAgentStep` 成功 return（508 行付近）で
      `runResult.touchedFiles` を `StepExecutionResult` に透過する（`undefined` はそのまま透過）。
- [ ] `CommitOrchestrator.commitSuccess`（`store.persist(s)` の前）で、`result.touchedFiles !== undefined` の場合に
      `s = { ...s, touchedFiles: { ...(s.touchedFiles ?? {}), [step.name]: result.touchedFiles } }` を適用する
      （同一 step は最新 run で置換）。`undefined`（codex / managed）の場合は state を触らない。
- [ ] round path（`commitRound`）には配線しない（round member は read-only reviewer で記録対象外、D6）。

**Acceptance Criteria**:
- unit test: `AgentRunResult.touchedFiles = ["a.ts"]` を返す成功 step を commitSuccess 経由で処理すると
  `state.touchedFiles[<step 名>] === ["a.ts"]` になる。
- unit test: 同一 step の 2 回目の run が `["b.ts"]` を返すと `state.touchedFiles[<step 名>]` が
  `["b.ts"]` に置き換わる（`["a.ts"]` は残らない）。
- unit test: `touchedFiles === undefined` の成功 step では `state.touchedFiles` にその step のエントリが増えない。
- `typecheck && test` が green。

## T-07: resume 経路の保持と再注入を検証する

- [ ] resume 往復 test（新規）: `touchedFiles` を持つ `JobState` を `JobStateStore.persist` で保存し、
      `JobStateStore.load`（または `composeSplitLayoutFromContent`）で読み出すと `touchedFiles` が保持される
      ことを検証する。
- [ ] resume 後注入 test（新規）: 読み出した state を `buildTouchedFilesSection(state, <resume 後 step 名>)` に
      渡すと、先行 step 名とファイル一覧のセクションが返ることを検証する。

**Acceptance Criteria**:
- resume 経路の test: state 保存 → 読み出しで記録が保持され、resume 後の step prompt に注入される
  （store 往復で `touchedFiles` 保持 + `buildTouchedFilesSection` がセクションを返す）。
- `typecheck && test` が green。

## T-08: 全体検証と回帰確認

- [ ] `src/core/step/` 配下の既存 `buildMessage` テストが無改変で green であることを確認する
      （注入は adapter 層で行い `buildMessage` を変更しないため、影響しない）。
- [ ] 既存の artifact-bundle-injection test（claude-code / codex）が green であることを確認する
      （空記録時の byte 同一性が保たれること）。
- [ ] `typecheck && test` を実行して green を確認する。

**Acceptance Criteria**:
- `src/core/step/` 配下の既存 `buildMessage` テストが無改変で green。
- `typecheck && test` が green。
