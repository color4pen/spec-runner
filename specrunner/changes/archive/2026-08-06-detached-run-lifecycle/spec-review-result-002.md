# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 前周 findings の解消確認

**F-1 [medium/fixable]: job wait 起動直後の race condition（slug not found → exit 2 誤報）**

- spec.md 行 131-133: "slug 不在（どの job にも一致しない）の場合、`job wait` はループ開始前に **2 秒間隔 × 5 回**（計約 10 秒）リトライしてから exit 2 を返す MUST" が追加された。
- spec.md 行 153-157: "Scenario: slug 不在は 2 秒 × 5 回リトライ後に exit 2 を返す" が追加された。
- tasks.md T-06 AC: "slug 不在は **2 秒間隔 × 5 回**（計約 10 秒）リトライしてから exit 2 を返す（detach 親の初期化ウィンドウ対応）。リトライ間隔・回数は DI seam で注入可能にし、テストで実時間なしに検証する" が追加された。
- tasks.md T-09: slug 不在リトライのテスト要件が明記された。
- **解消済み** ✓

**F-2 [low/decision-needed]: `--detach --json` の組み合わせ時 stdout 契約が未定義**

- spec.md 行 37-42: "Scenario: `--detach` と `--json` の同時指定は ARG_ERROR（exit 2）" が追加された。決定: 両 flag 排他 → exit 2。
- tasks.md T-05 AC: "`--detach` と `--json` の同時指定は ARG_ERROR（exit 2）で終了し、pipeline も spawn も行わない（テストで固定）" が追加された。
- tasks.md T-10: "`--detach --json` 同時指定で exit 2 を返し pipeline も spawn も行わないことをテストで固定する" が追加された。
- **解消済み** ✓

**F-3 [low/fixable]: D5 parent slug 解決で `parseRequestMdRaw` 後の SLUG_REGEX 検証が未言及**

- design.md 行 144-145: "抽出後、`SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/` で検証し、不一致なら子を spawn せず非ゼロ終了する（不正な slug 値で `job wait <invalid>` 案内を出して子を spawn する UX 混乱を防ぐ）" が追加された。
- tasks.md T-05 AC: "`run` / `job start` の detach 経路で `parseRequestMdRaw` 後に `SLUG_REGEX` を検証し、不一致なら spawn せず非ゼロ終了すること（テストで固定）" が追加された。
- **解消済み** ✓

**F-4 [low/fixable]: detach log ファイルのパーミッション（0o600）が未指定**

- tasks.md T-01 AC: "detach log ファイルは `0o600` モードで作成されること（既存 verbose log の `openSync(path, 'a', 0o600)` 慣例と一致）" が追加された。
- tasks.md T-02 AC: "log redirect で渡すファイル記述子は `openSync(path, 'a', 0o600)` で開くこと（owner-only 保護）" が追加された。
- **解消済み** ✓

**F-5 [info]: pid-present path の最大待機上限なし（設計既知リスク）**

- 引き続き Non-Goal として明記されている。再指摘不要 ✓

### コード参照の再確認（前周との差分なし確認）

- `src/core/resume/safety.ts:13-24` — `isProcessAlive`（EPERM→alive / ESRCH→dead）: 前周確認と変化なし。
- `src/core/resume/safety.ts:40-67` — `isStaleRunning`: `status !== "running"` で即座に false（non-running status は settled 扱いしない）を再確認。status が `running` のときのみ stale を返す。
- `src/util/spawn.ts:73-107` — `spawnBackground`: `detached: true` なし・`stdio: "ignore"`・`stripSecrets` 適用の現状を再確認（T-02 での拡張対象として正しい）。
- `src/state/lifecycle.ts:58-60` — `TERMINAL_STATUSES = {archived, canceled}`、`ACTIVE_STATUSES = {running, awaiting-resume}` を再確認。FSM valid transitions: `running → {awaiting-resume, awaiting-archive, failed, terminated, canceled}`。
- `src/core/command/resume.ts:226-243` — `runStore` が null のとき worktree 側 persist が skip され、main checkout の state.json が `awaiting-resume` のままになる構造を再確認（D6 process-death gate の技術的根拠）。
- `src/errors.ts:3-7` — `EXIT_CODE = { SUCCESS: 0, GENERAL_ERROR: 1, ARG_ERROR: 2 }` を再確認。
- `src/util/xdg.ts:44-53` — `getVerboseLogDir` / `getVerboseLogPath` の現状を再確認（`getDetachLogPath` は T-01 で追加予定）。

### 全体整合性レビュー

- spec.md の全 Requirement と Scenario（7 Requirement / 15 Scenario）を読了し、request.md 受け入れ基準 11 項との対応を確認した。
- design.md の D1〜D8 および Risks / Open Questions の記述を通読した。
- tasks.md T-01〜T-12 の acceptance criteria を全件確認した。
- `--detach` 子への full-env passthrough（D4）: `stripSecrets` 除去対象（`GITHUB_TOKEN` 等）が子の preflight に必要であることを `src/util/env-filter.ts` の前周確認と照合して再確認。`SPECRUNNER_DETACHED` は `_TOKEN`/`_API_KEY`/`_SECRET` 非該当なので strip されないことも確認済み。
- SLUG_REGEX の path traversal 安全性: `[a-z0-9-]` のみ許容するため `.` / `/` が含まれず、`getDetachLogPath(repoRoot, slug)` は安全 ✓

### D7 settle table の完全性確認

design.md D7 の next-action 写像テーブル（awaiting-archive→0, archived→0, awaiting-resume→1, failed/terminated→1, canceled→1）と `VALID_TRANSITIONS`（running → awaiting-resume / awaiting-archive / failed / terminated / canceled）の対応を照合した。

`running` は FSM において terminal ではなく、`pid-present → 死亡後の確定 status` がほぼ常に awaiting-archive/awaiting-resume/failed/terminated/canceled になることを確認した。ただし SIGKILL または `beforeExit` を経由しないクラッシュでは disk status が `running` のまま残るケースがあり、この場合の D7 テーブルの扱いが未定義（下記 Findings 参照）。

## 検証できなかった項目

- テストの存在・品質（pre-implementation フェーズのため T-08〜T-10 は実装待ち）。
- `detached: true` の Windows 動作（スコープ外、設計で明記済み）。
- `parseRequestMdRaw` と run.ts の `storeResolve` が auth/network なしで完結することの実コード確認（前周確認に基づき変化なしと判断）。

## Findings 詳細

### F-A [low/fixable]: `job wait` pid-present-then-dead パスで disk status が `running` のとき挙動が未定義

**観察**: design D6 pid-present 経路では「プロセス死亡後に初めて on-disk status を確定値として読む」と定義されている。しかし D7 の settle テーブルには `running` が含まれない（awaiting-archive / archived / awaiting-resume / failed / terminated / canceled のみ）。

SIGKILL またはプロセスのクラッシュ（`process.on('beforeExit')` が発火しない場合）では、プロセス死亡後もディスク上の status が `running` のまま残る可能性がある。この状態で `job wait` が `isProcessAlive(pid)` → false を検出してディスク status を読むと、`running` が settle テーブルに存在しないため、実装によっては待機ループが無期限に続くか、予期しない挙動を返す。

**影響**: 通常の harness 用途（SIGTERM → `beforeExit` → `awaiting-resume`）では発生しない。SIGKILL やクラッシュ時のみ。実運用での頻度は低いが、スペックとして挙動が未定義なのは実装者にとって曖昧さを残す。

**対処案（spec または design への 1 行追記）**:
1. D6 pid-present 経路に「死亡後の status が `running` の場合は `awaiting-resume` として扱う」を追記する（最も保守的）。
2. D6 pid-present 経路で `running` を検出したら D6-3（pid-absent fallback = `isStaleRunning`）に移行するとする。

**現行ファイルの記述**: spec.md 行 114-116、design.md D6 の 2 番に「確定値として読む」とのみ記載。`running` ケースの明示がない。
