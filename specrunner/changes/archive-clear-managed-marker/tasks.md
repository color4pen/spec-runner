# Tasks: archive 成功時に managed marker / liveness sidecar を削除する

## T-01: Phase 2 に sidecar 削除を追加し repoint を撤去する（D1 / D2 / D3）

- [ ] `src/core/archive/orchestrator.ts` の Phase 2 の `if (worktreePath) { ... }` ブロック内にある liveness `worktreePath: null` repoint（`fs.readFile(sidecarAbsPath)` → JSON parse → `data["worktreePath"] = null` → `fs.writeFile(...)` の一連）を撤去する（D2）。worktree 削除（`manager.remove` / `manager.prune`）と feature branch 削除はそのまま残す。
- [ ] Phase 2 の末尾（feature branch 削除の後、`return { exitCode: 0 }` の前）に、`worktreePath` の有無に依存しない sidecar 削除 step を追加する（D1）。
  - [ ] `path.join(cwd, managedMarkerPath(slug))` を injected `fs.unlink`（`FinishFs.unlink`）で削除する。`managedMarkerPath` は `src/util/paths.js` から import する（`livenessJsonPath` は既に import 済み）。
  - [ ] `path.join(cwd, livenessJsonPath(slug))` を injected `fs.unlink` で削除する。
  - [ ] 各 `fs.unlink` を個別の try/catch で囲む。catch で error の `code === "ENOENT"` なら silent（何もしない）、それ以外は `stderrWrite(...)` で warning を出す。throw せず処理を継続する（D3）。`stderrWrite` は既に import 済み。
  - [ ] このブロックは `node:fs/promises` module ではなく、関数引数から分解した injected `fs`（`FinishFs`）を使う（既存 Phase 2 と同じ）。
- [ ] 新規の共通 helper / fs 抽象は追加しない（`managed.ts` の `clearManagedMarker` と同じ `path.join` + `fs.unlink` パターンに揃える）。

**Acceptance Criteria**:
- Phase 2 から liveness `worktreePath: null` の `writeFile` repoint が無くなっている。
- archive 成功時に `path.join(cwd, managedMarkerPath(slug))` と `path.join(cwd, livenessJsonPath(slug))` が `fs.unlink` される。
- 削除ブロックは `if (worktreePath)` の外にあり、`worktreePath` が null（managed 等）でも実行される。
- `fs.unlink` が ENOENT で reject しても archive は `{ exitCode: 0 }` を返し warning を出さない。ENOENT 以外で reject した場合は archive は `{ exitCode: 0 }` を返し stderr に warning を出す。
- `.specrunner/jobs/` への read/write は Phase 2 に追加されていない。

## T-02: テストを更新・追加する（spec の各 Scenario に対応）

- [ ] `tests/unit/core/archive/orchestrator.test.ts` の TC-032 を更新する: 「Phase 2 が liveness.json に `worktreePath: null` を `writeFile` する」アサートを、「Phase 2 が `${CWD}/.specrunner/local/${SLUG}/liveness.json` を `fs.unlink` する」検証に置き換える（D2 で挙動が repoint → delete に変わったため）。
- [ ] managed marker 削除テストを追加する: archive 成功時に `${CWD}/.specrunner/local/${SLUG}/marker.json` が `fs.unlink` で呼ばれることを検証する。`worktreePath` が null のケース（managed 相当）でも marker 削除が呼ばれることを固定する。
- [ ] best-effort（ENOENT 以外の失敗）テストを追加する: `fs.unlink` が ENOENT 以外の error で reject しても結果が `{ exitCode: 0 }` で、`process.stderr.write`（stderr spy）に warning が出ることを検証する。
- [ ] ENOENT silent テストを追加する: `fs.unlink` が `code === "ENOENT"` の error で reject した場合、結果が `{ exitCode: 0 }` で warning が出ないことを検証する。
- [ ] 既存 TC-034（Phase 2 が `.specrunner/jobs/` に触れない）が引き続き green であることを確認する。新規の `fs.unlink` は `.specrunner/local/` 配下のみを対象とする。

**Acceptance Criteria**:
- 追加・更新した test が green。
- spec.md の各 Scenario（marker 削除 / liveness 削除 / repoint なし / 失敗時 warning + exit 0 / 不在時 silent + exit 0 / jobs-dir 不可侵）に対応する検証が存在する。

## T-03: 検証を green にする

- [ ] `bun run typecheck` が pass。
- [ ] `bun run test` が pass。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
