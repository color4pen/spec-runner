# Tasks: archive 親ディレクトリの実行時保証

## T-01: `archiveChangeFolder` で `git mv` 前に archive 親ディレクトリを保証する

対象: `src/core/finish/archive-change-folder.ts`

- [x] 既存 import に `archivedChangesDirRel` を追加する（`../../util/paths.js` から。`changeFolderPath` / `changesDirRel` / `archivedChangeFolderPath` と同じ import 行）。
- [x] change folder 不在の早期 return（`if (!changeExists) { ... }`）の **後**、`git mv` を spawn する **前**に、移動先親ディレクトリを保証する 1 行を追加する: `await fs.mkdir(path.join(cwd, archivedChangesDirRel()), { recursive: true });`
- [x] `recursive: true` のまま使い、`fs.exists` による事前分岐は追加しない（mkdir 自体が冪等）。
- [x] `git mv` / `git add` / escalation / return 形（`ArchiveChangeFolderResult`）など他のロジックは変更しない。

**Acceptance Criteria**:
- `git mv` 実行前に `fs.mkdir(<cwd>/specrunner/changes/archive, { recursive: true })` が呼ばれる。
- change folder 不在（skip）経路では mkdir を呼ばない（mkdir は skip return の後に置かれている）。
- `archive/` が既に存在する場合でも mkdir は throw せず、既存の archive 挙動が変わらない。
- 関数シグネチャ（`archiveChangeFolder` の params / 戻り値型）に変更がない。

## T-02: TC-CF-006 ユニットテストを canonical テストファイルに追加する

対象: `tests/unit/core/finish/archive-change-folder.test.ts`（既存・TC-CF-001〜005 を持つこのモジュールの canonical テストファイル）

- [x] 既存ファイル冒頭に `node:path` と `archivedChangesDirRel`（`../../../../src/util/paths.js`）の import を追加する。`makeFs` / `makeSpawn` ヘルパーは既存のものを再利用する（`makeFs` は既に `mkdir` を `vi.fn()` で持つ）。
- [x] ファイル先頭の docstring に `TC-CF-006: archive parent dir absent → mkdir(recursive) runs before git mv` を追記する。
- [x] `TC-CF-006` describe を末尾に追加する。内容:「`archive/` 不在時にディレクトリが作成されてから `git mv` が成功する」。
  - `mkdir` spy を持つ fs と成功 spawn（exitCode 0）で `archiveChangeFolder({ slug, cwd, spawn, fs, now })` を呼ぶ。
  - `fs.mkdir` が `path.join(cwd, archivedChangesDirRel())` と `{ recursive: true }` で呼ばれたことを assert する。
  - `fs.mkdir` の呼び出しが `git mv` の spawn 呼び出しより **前**であることを `mock.invocationCallOrder` の比較で assert する（mkdir の invocationCallOrder < git mv spawn 呼び出しの invocationCallOrder）。
  - 結果が `ok: true` かつ `skipped: false` であることを assert する。
- [x] skip 経路の不変条件を補強する: 既存 TC-CF-002（change folder 不在）で `fs.mkdir` が呼ばれないことを assert する。

**Acceptance Criteria**:
- `tests/unit/core/finish/archive-change-folder.test.ts` に TC-CF-006 が追加され、ID 重複がない（次の空き番号を使用）。
- TC-CF-006 が「mkdir(recursive) → git mv の順序」と「ok/skipped: false」を検証する。
- 同一モジュールのテストが canonical 1 ファイルに集約され、テストの置き場所が分散しない。

## T-03: 検証

- [x] `bun run typecheck` が pass する。
- [x] `bun run test` が pass する（新規 TC-CF-006 を含む全テスト green、既存テストに regression なし）。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
- 受け入れ基準の 4 項目（初回 finish 完走 / 既存 archive 挙動不変 / TC-CF-006 追加 / typecheck+test green）をすべて満たす。
