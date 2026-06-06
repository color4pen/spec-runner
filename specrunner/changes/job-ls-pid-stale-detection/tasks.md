# Tasks: `job ls` のプロセス死亡検出を `isStaleRunning` に一本化する

## T-01: `ps.ts` の stale 判定を `isStaleRunning` に置き換える

`src/cli/ps.ts` を編集し、独自の経過時間判定を廃して `isStaleRunning` を再利用する。

- [x] import を追加する:
  - `import * as fs from "node:fs";`
  - `import * as path from "node:path";`（既存の import 群に合わせて `node:path` を使用）
  - `import { isStaleRunning } from "../core/resume/safety.js";`
  - `import { livenessJsonPath } from "../util/paths.js";`
  - （`getJobSlug` は既に import 済みのため追加不要）
- [x] `const STALE_THRESHOLD_MS = 60 * 60 * 1000;`（1 時間閾値）の定義を削除する。
- [x] `formatJobRow` のシグネチャに事前計算済みの `isStale: boolean` を追加する
  （`prMerged` と同じく末尾に追加、デフォルト `false`）:
  `formatJobRow(job, isTty, nowMs?, prMerged?, isStale = false)`
- [x] `formatJobRow` 内の inline stale 計算
  （`const isStale = job.status === "running" && (... > STALE_THRESHOLD_MS)`）を削除し、
  status 決定ロジックを「`prMerged` → awaiting-archive hint / `isStale` → `running (stale?)` /
  else → `job.status`」の順で引数の `isStale` を参照する形に書き換える（表示文字列は不変）。
- [x] `runPs` のループ内で job ごとに staleness を算出して `formatJobRow` に渡す:
  - `const sidecarCandidate = path.join(repoRoot, livenessJsonPath(getJobSlug(job)));`
  - `const sidecarPath = fs.existsSync(sidecarCandidate) ? sidecarCandidate : undefined;`
    （sidecar ファイルが存在しない場合は `undefined` を渡し `isStaleRunning` の時間 fallback を有効にする）
  - `const isStale = isStaleRunning(job, sidecarPath);`
  - `stdoutWrite(formatJobRow(job, isTty, nowMs, prMerged, isStale) + "\n");`
  - `repoRoot` は `runPs` 冒頭で解決済みの値を使う（`resume.ts` の `path.join(cwd, livenessJsonPath(slug))` と同一構成）。
- [x] `formatJobRow` の他の呼び出し元を grep で洗い出し、シグネチャ変更に追随する
  （`grep -rn "formatJobRow" src/ tests/`）。本体側で `formatJobRow` を呼ぶ箇所が `runPs` 以外に
  あれば `isStale` を補う。

**Acceptance Criteria**:
- `src/cli/ps.ts` に `STALE_THRESHOLD_MS`（1 時間）が残っていない（`grep -n "STALE_THRESHOLD_MS" src/cli/ps.ts` が 0 件）。
- `runPs` が `running` job ごとに `isStaleRunning(job, sidecarPath)` を呼び、結果を `formatJobRow` に渡している。
- `formatJobRow` は stale 判定ロジックを内製せず、引数の `isStale` のみを参照する。
- 表示文字列は従来どおり `running (stale?)` のまま（TTY / 非 TTY 双方）。
- `bun run typecheck` が green。

## T-02: テストを新契約に更新し、`runPs` レベルの pid/sidecar 検証を追加する

`scenario`（spec.md）を満たすことを検証するテストを更新・追加する。実装（T-01）の
インターフェース確定後に着手する。

- [x] `tests/finish-ps-integration.test.ts` の `TC-NEW-08`（`formatJobRow` 直接テスト）を
  新シグネチャに合わせて更新する:
  - 「`isStale=true` を渡すと STATUS に `running (stale?)` が含まれる」
  - 「`isStale=false`（または未指定）では `(stale?)` が付かない」
  - 「`awaiting-resume` job では `isStale=false` のため `(stale?)` が付かない」
  - 旧来の「updatedAt > 1 時間で stale / 30 分は not stale」を `formatJobRow` 内部で判定する前提の
    assertion は撤去する（判定は `runPs` / `isStaleRunning` へ移動したため）。
- [x] `runPs` レベルの integration test を追加する（`tests/finish-ps-integration.test.ts` または
  `tests/unit/cli/` 配下、既存の `writeStateFile` ヘルパーと `repoRoot` 指定パターンを踏襲）:
  - 死亡 pid（例: 存在しない大きな pid）を持つ `running` job → 出力に `running (stale?)` を含む。
  - 生存 pid（`process.pid`）を持つ `running` job → 出力に `(stale?)` を含まない。
  - `pid` / sidecar なし・`updatedAt` 16 分前の `running` job → `running (stale?)` を含む（15 分 fallback）。
  - `pid` / sidecar なし・`updatedAt` 直近の `running` job → `(stale?)` を含まない。
- [x] `tests/cli-stdout-snapshot.test.ts` が `formatJobRow` / `runPs` の出力 snapshot を持つ場合、
  シグネチャ・閾値変更による差分の有無を確認し、必要なら snapshot を更新する。

**Acceptance Criteria**:
- spec.md の各 Scenario（pid 死亡 / pid 生存 / sidecar pid 死亡 / 15 分 fallback 両側 / awaiting-resume）に
  対応するテストが存在する。
- 更新後の `TC-NEW-08` が `formatJobRow` の新シグネチャ（`isStale` 引数）で通る。
- `bun run test` が green。

## T-03: 受け入れ基準の最終検証

- [x] `bun run typecheck && bun run test` を実行し、全 green を確認する。
- [x] request.md の受け入れ基準を満たしていることを確認する:
  - プロセス死亡済みの `running` job が `job ls` で `running (stale?)` と表示される（pid / sidecar 経由で即判定）。
  - pid / sidecar が取得できない場合は 15 分（`STALE_RUNNING_THRESHOLD_MS`）の経過時間 fallback で判定される。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
- request.md の 3 つの受け入れ基準がすべて満たされている。
