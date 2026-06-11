# Tasks:

## T-01: archive orchestrator — sidecar ディレクトリ削除を追加

- [x] `src/util/paths.ts` から `localSidecarDir` を import に追加する
  - 対象ファイル: `src/core/archive/orchestrator.ts` 29 行目の import 行
- [x] 既存の marker.json unlink ブロック（`src/core/archive/orchestrator.ts:286-293`）の直後に
  sidecar ディレクトリ削除ブロックを追加する:
  ```typescript
  // Delete sidecar directory (best-effort)
  try {
    await fs.rm(nodePath.join(cwd, localSidecarDir(slug)), { recursive: true, force: true });
  } catch (err) {
    stderrWrite(`Warning: failed to remove sidecar directory for ${slug}.`);
  }
  ```

**Acceptance Criteria**:
- `runArchiveOrchestrator` 実行後、`fs.rm` が `nodePath.join(cwd, localSidecarDir(slug))` と
  `{ recursive: true, force: true }` を引数に呼ばれていること
- `fs.rm` が例外を投げても `result.exitCode` は 0 であること

---

## T-02: archive orchestrator テスト — sidecar ディレクトリ削除

- [x] `src/core/archive/__tests__/orchestrator.test.ts` に以下のテストを追加する
  - `T-sidecar-01`: archive 成功後に `fs.rm` が `localSidecarDir(FAKE_SLUG)` のフルパスで呼ばれる
  - `T-sidecar-02`: `fs.rm` が例外を投げても `exitCode` は 0（best-effort）
  - `T-sidecar-03`: `fs.rm` が EACCES で例外を投げると stderrWrite に "Warning" を含む文字列が出る
- [x] `localSidecarDir` を `src/util/paths.js` から import するよう import 行を更新する

**Acceptance Criteria**:
- 3 テストケースすべてが vitest で green

---

## T-03: doctor check — orphan-sidecars を新規作成

- [x] `src/core/doctor/checks/storage/orphan-sidecars.ts` を新規作成する
- [x] `DoctorCheck` を実装する `orphanSidecarsCheck` をエクスポートする:
  - `name`: `"orphan-sidecars"`
  - `category`: `"storage"`
  - `required`: `false`
- [x] check ロジック:
  1. `ctx.fs.existsSync(path.join(ctx.cwd, ".specrunner", "local"))` が false → pass を返す
  2. `ctx.fs.readdirSync(localBase)` でエントリを列挙する（例外はキャッチして pass を返す）
  3. 各エントリについて `ctx.fs.stat(sidecarDir)` で isDirectory を確認する（ファイルはスキップ）
  4. 各 slug ディレクトリについて `isOrphanSidecar(ctx, slug, sidecarDir)` で判定する:
     - `liveness.json` を `ctx.fs.readFile` で読んで `worktreePath` を取得（失敗は null）
     - main checkout の `specrunner/changes/<slug>/state.json` を読んで `status` を確認する
       - active（"running" / "awaiting-resume" / "awaiting-archive" / "failed" / "terminated"）→ orphan ではない
       - "archived" / "canceled" → orphan
       - ENOENT → worktreePath を使って worktree 内の state.json も試みる
         - active status が見つかれば → orphan ではない
         - 見つからなければ → orphan
       - JSON 破損等 → スキップ（orphan とみなさない）
  5. orphan リストが空 → pass
  6. orphan リストが非空 → warn。message に件数、hint に `rm -rf <path> ...` コマンド、
     details に orphan パスのリストを含める

**Acceptance Criteria**:
- sidecar が存在しない場合: status "pass"
- active job の sidecar: orphan リストに含まれない
- archived / 不存在 job の sidecar: warn に列挙される
- check は sidecar ディレクトリを削除しない（fs.rm / fs.unlink を呼ばない）

---

## T-04: orphan-sidecars check のテストを作成

- [x] `src/core/doctor/checks/storage/orphan-sidecars.test.ts` を新規作成する
- [x] `DoctorContext` を最小限にモックして以下のケースをテストする:
  - `P-01`: `.specrunner/local/` が存在しない → status "pass"
  - `P-02`: sidecar ディレクトリが存在し、対応する state.json の status が "running" → status "pass"（orphan なし）
  - `P-03`: sidecar ディレクトリが存在し、対応する state.json の status が "awaiting-archive" → status "pass"（orphan なし）
  - `W-01`: sidecar ディレクトリが存在し、state.json が不存在 → status "warn"、details に sidecar パスを含む
  - `W-02`: sidecar ディレクトリが存在し、state.json の status が "archived" → status "warn"
  - `W-03`: orphan が複数 → warn の message に件数、hint に全パスの rm コマンドを含む
  - `RO-01`: check が `ctx.fs` の rm / unlink を呼ばないことを確認する（read-only 固定）
  - `WT-01`: liveness.json に worktreePath があり、worktree 内 state.json の status が "running" → orphan とみなさない

**Acceptance Criteria**:
- 8 テストケースすべてが vitest で green
- `RO-01` により非終端 job のサイドカーが archive 以外の経路で削除されないことが固定される

---

## T-05: doctor checks index に orphanSidecarsCheck を登録

- [x] `src/core/doctor/checks/storage/orphan-sidecars.ts` から `orphanSidecarsCheck` を import する
- [x] `commonChecks` 配列の storage セクション末尾に `orphanSidecarsCheck` を追加する
- [x] ファイル末尾の re-export に `orphanSidecarsCheck` を追加する

**Acceptance Criteria**:
- `specrunner doctor` の実行で `orphan-sidecars` チェックが表示される（既存チェックの後）
- `allChecks` に含まれる

---

## T-06: typecheck && test を green にする

- [x] `bun run typecheck` が エラーなし
- [x] `bun run test` が全 green

**Acceptance Criteria**:
- CI 相当の `typecheck && test` が通る
