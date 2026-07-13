# Tasks: build-fixer の config 編集を同一 job 内 verification に反映する（in-job coverage 再解決）

> 依存順:
> T-01（再解決ヘルパ）→ T-02（verification step 配線）。
> T-03（既存 step テストの hermetic 化）は T-02 後。T-04（ヘルパ単体テスト）は T-01 後。
> T-05（受け入れ統合テスト）は T-02 後。T-06（docs）は独立。
> 実装は `node:fs/promises` / `node:path` / `node:child_process`（`bun:*` / `Bun.*` は禁止）と既存 `config/store.ts`・`util/repo-root.ts` を用い、外部依存を追加しない。
> スコープ厳守: `runVerification`（`runner.ts`）・gate（`changed-line-coverage.ts`）・config schema は変更しない。fail-closed 判定ロジックには触れない。

## T-01: coverage 再解決ヘルパ `reloadCoverageConfig` を追加する

- [ ] `src/core/verification/reload-coverage-config.ts`（新規）に非同期関数を追加する:
  `reloadCoverageConfig(cwd: string): Promise<{ applied: boolean; coverage?: import("../../config/schema.js").CoverageConfig }>`
- [ ] 挙動（design D3 / D4）:
  - `resolveRepoRoot(cwd)`（`src/util/repo-root.ts`）で repo-root を解決する。null なら `{ applied: false }` を返す。
  - `<repoRoot>/.specrunner/config.json` の存在を `fs.access` で確認する。不在なら `{ applied: false }` を返す（project-local overlay を持たない cwd での回帰防止 gate）。
  - `loadConfig(repoRoot)`（`src/config/store.ts`）で 2 層 overlay（user global + project local）を再解決し、`{ applied: true, coverage: config.verification?.coverage }` を返す（coverage 未宣言なら `coverage: undefined`）。
  - 上記いずれかで例外が発生した場合（`loadConfig` の validation エラー・I/O 例外等）は catch して `{ applied: false }` を返す（例外を投げない）。
- [ ] このモジュールは coverage 以外の config フィールドを返さない（対象範囲を型で `CoverageConfig | undefined` に限定。design D2）。
- [ ] 依存追加なし（`node:*` + 既存 `config/store.ts`・`util/repo-root.ts`・`config/schema.ts` の型のみ）。

**Acceptance Criteria**:
- `.specrunner/config.json` を持つ cwd で `coverage.exclude` を宣言した config を書くと、`reloadCoverageConfig(cwd)` が `{ applied: true, coverage: { …exclude を含む } }` を返す。
- `.specrunner/config.json` が不在の cwd では `{ applied: false }` を返す。
- disk config が不正（JSON parse 不能 / validation エラー）でも throw せず `{ applied: false }` を返す。
- `typecheck` が green。

## T-02: `VerificationStep.run` で coverage を再解決して runVerification に渡す

- [ ] `src/core/step/verification.ts` の `run` で、`runVerification` を呼ぶ前に `reloadCoverageConfig(verificationCwd)` を呼ぶ（`verificationCwd = deps.cwd ?? process.cwd()` は既存のまま）。
- [ ] effective な verification config を組み立てる（design D2 / D3）:
  - `applied === true` のとき: `{ ...deps.config.verification, coverage: reload.coverage }`（coverage のみ差し替え。`deps.config.verification` が undefined でも `{ coverage: reload.coverage }` となり既存の dispatch と整合）。
  - `applied === false` のとき: `deps.config.verification` をそのまま使う（job 開始時の値へ fail-safe）。
- [ ] 組み立てた effective config を `runVerification(deps.slug, verificationCwd, effectiveVerification, deps.request.baseBranch)` の第 3 引数に渡す。第 1/2/4 引数と後続の `propagateVerificationResult` 呼び出しは不変。
- [ ] `deps.config` オブジェクト自体は変更しない（effective config はローカルに組み立てるのみ。他 step・他フィールドへ副作用を出さない。design D2）。
- [ ] `deps.config.verification.commands` を含む coverage 以外のフィールドは effective config でも job 開始時の値を保持することをコード上で明示する（`coverage` キーのみ上書き）。

**Acceptance Criteria**:
- `reloadCoverageConfig` が `applied: true` を返すと、`runVerification` に渡る verification config の `coverage` が再解決値になり、`commands` を含む他フィールドは `deps.config.verification` の値のまま。
- `reloadCoverageConfig` が `applied: false` を返すと、`runVerification` に渡る verification config は `deps.config.verification`（job 開始時の値）と等価。
- `runVerification` の第 4 引数（baseBranch）は従来どおり `deps.request.baseBranch`。
- `typecheck` が green。

## T-03: 既存 `verification-step.test.ts` を hermetic に保つ

- [ ] `tests/unit/core/step/verification-step.test.ts` に `src/core/verification/reload-coverage-config.js` の `vi.mock` を追加し、既定で `{ applied: false }` を返すようにする（既存の runner.js / propagate.js のモック方針と同じ）。
- [ ] 既存の baseBranch 検証テスト（TC-11）が無変更の意図で green を保つこと（`applied: false` により effective config = `deps.config.verification` となり、第 4 引数 baseBranch の assertion は不変）。

**Acceptance Criteria**:
- `tests/unit/core/step/verification-step.test.ts` が実 git/実 fs I/O を踏まずに green。
- 既存 TC-11（baseBranch 引き渡し）の assertion が維持される。

## T-04: `reloadCoverageConfig` の単体テストを追加する

- [ ] `tests/unit/core/verification/reload-coverage-config.test.ts`（新規）を追加する。一時ディレクトリ + 実 git init（`resolveRepoRoot` が解決できるよう最小 commit）で決定的に構成するか、`resolveRepoRoot` / `loadConfig` をモックして構成する（既存テストの方針に合わせ、実 git 依存は最小化）。
- [ ] 次を固定する:
  - project-local `.specrunner/config.json` に coverage（`command`/`lcovPath`/`include`）＋ `exclude` を書いた cwd → `{ applied: true, coverage }` で `exclude` が含まれる。
  - 同 config の `exclude` を書き換えて再度呼ぶと、返る coverage が更新後の `exclude` を反映する（disk の現在値を読むことの固定）。
  - `.specrunner/config.json` 不在の cwd → `{ applied: false }`。
  - JSON 不正 / validation 不通過の config → throw せず `{ applied: false }`。
  - coverage 未宣言の config → `{ applied: true, coverage: undefined }`。
- [ ] user global が存在する環境で project-local が partial（coverage のみ）でも overlay で解決されることを、可能なら 1 ケース固定する（環境依存が強い場合はモックで代替）。

**Acceptance Criteria**:
- 上記ケースが決定的に green。
- `typecheck && test` が green。

## T-05: 受け入れ統合テスト — 同一 job 内の後続 verification が追加された exclude を反映して pass する

- [ ] `tests/unit/core/step/verification-config-reload.test.ts`（新規）を追加し、request の受け入れ基準（coverage.exclude 追加後、同一 job 内の後続 verification がその exclude を反映して pass）を固定する。
- [ ] 構成（決定的にするため git-diff 部分＝`getChangedFilesAndLines` はモック、lcov は実ファイル、config 再解決は実挙動を推奨。実 git init が容易なら init して `resolveRepoRoot` を実挙動にしてよい）:
  1. 一時 worktree ディレクトリに project-local `.specrunner/config.json` を書く。coverage を宣言（`include: ["src/**"]`、`exclude` 無し）。
  2. 変更ファイル `src/types.ts` が lcov に `SF` として存在しない状況を作り（型のみファイル想定）、`VerificationStep.run` を呼ぶ → gate が `not-loaded` で verdict failed になることを確認（前提の再現）。in-memory `deps.config.verification.coverage` も exclude 無し。
  3. build-fixer の編集を模して disk 上の `.specrunner/config.json` の `verification.coverage.exclude` に `src/types.ts` にマッチする glob を追記する（in-memory `deps.config` は変更しない）。
  4. 同一 `deps`（＝ job 開始時の in-memory config のまま）で `VerificationStep.run` を再実行する → 再解決された disk 上の exclude により `src/types.ts` が対象外になり、gate が pass、verdict passed になることを確認する。
- [ ] 併せて「in-memory config は exclude を持たないまま」であることを確認し、pass の要因が in-memory ではなく disk 再解決であることを明示する。

**Acceptance Criteria**:
- exclude 追加前の verification は failed（`not-loaded`）、追加後の同一 job 内 verification は passed（exclude 反映）であることがテストで固定される。
- pass が in-memory config の変更ではなく disk 再解決に由来することがテスト構成上明確。
- `typecheck && test` が green。

## T-06: docs に in-job coverage 再解決の挙動を追記する

- [ ] `docs/configuration.md` の `verification.coverage`（changed-line coverage gate）セクションに、次を 1〜2 文で追記する:
  - build-fixer 等が同一 job 内で `.specrunner/config.json` の `verification.coverage`（例: `exclude`）を編集・commit した場合、後続の verification は verification 直前に project-local config を再解決してその更新を反映する。
  - 再解決の対象は `verification.coverage` に限定され、`verification.commands` を含む他 config は job 開始時の値を保持する。
  - config 変更は従来どおり PR に含まれ人間レビュー可能。
- [ ] 既存 docs の記述（決定表・commands/phases 両対応・未宣言時 skip）とは矛盾させない（追記のみ）。

**Acceptance Criteria**:
- `docs/configuration.md` に in-job 再解決の挙動と対象範囲（coverage 限定）の記述が存在する。
- 既存 docs テスト（あれば）が green。
