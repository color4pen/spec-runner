# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### コード参照の正確性（request.md / design.md の前提）

- `src/cli/run.ts:108-113` — `process.exit(await runRunCore(...))` を確認。`runRun` が foreground blocking で detach 機構を持たないことを確認した（実際は `:112`）
- `src/util/spawn.ts:73-107` — `spawnBackground` が `detached: true` なし・`stdio: "ignore"` の現状を直接読んで確認。`unref()` と `onError` ハンドラ同期付与も確認
- `src/core/resume/safety.ts:13-24, 40-67` — `isProcessAlive`（EPERM→alive / ESRCH→dead）と `isStaleRunning`（pid 解決順 state.pid → sidecar pid → updatedAt 15 分 fallback、`status === "running"` のみ）を確認。design の記述と正確に一致
- `src/state/schema/types.ts:417-418` — `pid?: number | null` フィールドの存在を確認
- `src/state/lifecycle.ts:58-60` — `TERMINAL_STATUSES = {archived, canceled}`・`ACTIVE_STATUSES = {running, awaiting-resume}`・FSM 遷移表（`running → failed/terminated` が valid）を確認
- `src/errors.ts:3-7` — `EXIT_CODE = { SUCCESS: 0, GENERAL_ERROR: 1, ARG_ERROR: 2 }` を確認
- `src/util/xdg.ts:44-53` — `getVerboseLogDir`・`getVerboseLogPath` の実装を確認。`getDetachLogPath` 追加先として適切
- `src/cli/job-show.ts:115-122` — 現状は `Log:` 行（`<jobId>.log`）のみで detach log 表示がないことを確認（T-07 追加箇所の特定）
- `src/util/paths.ts:315-316` — `livenessJsonPath(slug)` = `.specrunner/local/<slug>/liveness.json` を確認
- `src/util/env-filter.ts` — `stripSecrets` が `GITHUB_TOKEN`・`ANTHROPIC_API_KEY`・`SPECRUNNER_API_KEY`・`*_TOKEN`/`*_API_KEY`/`*_SECRET` パターンを除去することを確認。detach 子への full-env passthrough の必要性が技術的に正当であることを確認
- `src/parser/rules/slug-required.ts` → `SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/` を確認。スラッシュ・ドットを含まないため `getDetachLogPath(repoRoot, slug)` にパストラバーサルリスクがないことを確認
- `src/parser/request-md.ts:68` — `parseRequestMdRaw` が I/O なしで slug を抽出できることを確認（D5 の parent slug 解決に使用）
- `src/logger/stdout.ts:173-176` — `logInfo` が stderr に書き `isLevelEnabled("default")` を確認する（quiet で抑制）。foreground notice の要件を満たすことを確認
- `src/cli/command-registry.ts:436` — `guardedSubcommands: new Set(["start", "resume", ...])` で main checkout 外からの拒否を確認。`job wait` は同様の guard が T-05 で追加される

### Spec ↔ Design ↔ Tasks ↔ Request 整合性

- request.md 受け入れ基準 11 項を全て追跡し、spec.md Scenario、tasks.md 受け入れ基準との対応を確認
- process-death gate（D6 / spec.md Requirement "job wait はプロセス生存を gate にする"）は main checkout state.json が awaiting-resume のまま残る resume 構造（`src/core/command/resume.ts:226-243`、`runStore` が null の場合 persist skip）に対する正当な解法であることを確認
- detach 子への env full passthrough（D4）は `stripSecrets` の除去対象（`GITHUB_TOKEN` 等）が child preflight に必要であることを確認。既存の外部プロセス経路（factory.ts / power-assertion.ts）は新フィールド未指定で従来 strip 挙動を維持
- `job wait` の終了コード規約（awaiting-archive/archived → 0、awaiting-resume/failed/terminated/canceled → 1）は `src/core/command/runner.ts:325-369` の run 規約と整合することを確認
- `SPECRUNNER_DETACHED` マーカーが `stripSecrets` の除去対象外（`_TOKEN`/`_API_KEY`/`_SECRET` パターン非該当）であることを確認。detach 子へ正しく伝播する

### スコープ外事項の確認

- `docs/operations.md` に `--detach`・`job wait` の記載がないことを確認（T-11 の追加対象として正しい）
- `src/cli/ps.ts` と `operations-view.ts` の `running (stale?)` 表示が変更不要であることを確認（spec スコープ外と一致）

## 検証できなかった項目

- テストの存在・品質（この spec review は pre-implementation 段階のため。テストは T-08〜T-10 で実装される）
- `detached: true` の Windows 動作（設計が POSIX 一次対象・Windows 非検証を明示しており、スコープ外）
- 実 agent harness 環境での SIGTERM 挙動（ランタイム実証が必要）
- `src/core/command/resume.ts` の `runStore` が null になる具体的な条件（設計で「main checkout の state.json が awaiting-resume のまま残り得る」と明記され、コード該当箇所 `:226-243` も確認したが、完全な網羅テストは別途）

## Findings 詳細

### F-1 [advisory]: `job wait` 起動とジョブ状態作成の間の race condition が未定義

**観察**: `--detach` 親が `job wait <slug>` 案内を出力して exit 0 した直後、子プロセスはまだ preflight → bootstrapJob を走らせていない可能性がある。この初期化ウィンドウ（通常数秒）に `job wait <slug>` を実行すると、`JobStateStore.list` が slug に一致する state を返さず、T-06 の実装仕様（「不一致 → exit 2」）により即座に exit 2 で終了する。

**影響**: エージェントや自動化スクリプトが detach 案内を受け取り即座に `job wait` を実行した場合、"slug not found" として誤った失敗を報告する。detach log にエラーがなくても job は正常起動中で `job wait` の判断が早すぎただけ。

**対処案（spec への追記として）**:
1. `job wait` が slug not found を確認した場合、起動直後の可能性として短時間リトライする（例: 3 回 × 2 秒）ロジックを `isSettled` ループの初期化段階に追加する
2. または detach 親の guidance 出力に "job wait は少し待ってから実行" の一言を加える

**現行 spec の記述**: 「slug 不在が終了コード 2 になることをテストで固定する」とのみあり、初期化 race への対処は未定義。

---

### F-2 [advisory]: `--detach --json` の組み合わせ挙動が未定義

**観察**: detach 親は `buildDetachGuidance(slug)` を stdout に出力する（D1・D3）。既存の `--json` フラグは pipeline の結果を JSON で stdout に出力する契約を持つ（`src/core/command/runner.ts`）。`specrunner run <slug> --detach --json` と実行した場合、親は非 JSON テキストを stdout に書き exit 0 する。自動化が `--json` 出力を前提にパースする場合、パースエラーになる。

**影響**: `--json` を使う CI/自動化スクリプトが `--detach` 対応時にパース失敗する可能性がある。

**対処案**: 以下のいずれかを spec に明記する
1. `--json` かつ `--detach` 指定時、guidance を JSON 形式（`{"slug": "...", "wait": "specrunner job wait ..."}` 等）で出力する
2. `--json` と `--detach` は排他とし、同時指定を ARG_ERROR (exit 2) にする
3. `--detach` 時は `--json` を無視する（detach parent に pipeline 結果が存在しないため）

---

### F-3 [advisory]: D5 の parent slug 解決で `parseRequestMdRaw` 使用後に SLUG_REGEX 検証が未言及

**観察**: design D5 は「`parseRequestMdRaw`（認証・network なしの決定的 parse）で slug を抽出する」と明記する。`parseRequestMdRaw` は slug の形式検証（`SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/`）を行わず raw 値を返す（検証は `parseRequestMdContent` → `createRequestMdRegistry().validate()` で行われる）。

**影響**: slug が SLUG_REGEX を満たさない request.md（誤記等）に対して親が `job wait <invalid-slug>` 案内を出力し子を spawn する。子は preflight の `parseRequestMdContent` で REQUEST_MD_INVALID を投げて失敗するが、案内は既に出力済み。UX が混乱する（exit 2 の `job wait` / 詳細エラーは detach log のみ）。

**対処案**: D5 実装時に `parseRequestMdRaw` で slug を抽出した後、SLUG_REGEX で検証し、不一致なら子を spawn せず非ゼロ終了（run.ts と同等のエラー）する処理を明示する。

---

### F-4 [advisory]: detach log ファイルのパーミッションが spec/design に未指定

**観察**: 既存の verbose log は `openSync(currentLogPath, "a", 0o600)` で作成されている（`src/logger/stdout.ts:92`）。detach log（`.specrunner/logs/<slug>.detach.log`）の作成 mode について spec / design は言及していない。

**影響**: デフォルト umask によってはグループ・他者に readable なパーミッションで作成される可能性がある。detach log は `maskSensitive` 適用前の生 stdout/stderr を受け取るため、起動直後の初期化エラーメッセージに env 由来の情報が含まれる可能性がある。

**対処案**: T-01（`getDetachLogPath` 追加）または T-02（`spawnBackground` 拡張）の acceptance criteria に「log ファイルは `0o600` モードで作成すること」を追記する。既存 verbose log の慣例との一貫性を保つ。

---

### F-5 [info]: pid-present path に最大待機上限がない（設計で既知リスクとして認識済み）

**観察**: design Risks セクションに「PID reuse で wait が生存誤判定して hang する」と明記され、「既存 `isProcessAlive` / `isStaleRunning` と同じ既知限界として扱い、Non-Goal に明記」と対処方針が示されている。ただし、pid-present path で pid が reuse された場合、`isProcessAlive(pid)` が永続 true を返し `job wait` が無期限にハングする。15 分 fallback は pid-absent path のみに作用する。

**影響**: 理論上は無期限ハング。実環境では PID reuse の確率は低く、operationally は手動 Ctrl+C で脱出可能。

**設計判断**: Non-Goal として明記されており対処不要。追加の safe-guard（例: updatedAt が一定時間以上更新されない場合は強制 settle 扱い）は将来 request に分離するのが適切。情報として記録。
