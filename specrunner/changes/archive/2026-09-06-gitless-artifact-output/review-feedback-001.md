# Code Review Feedback — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 読んだファイル
- `specrunner/changes/gitless-artifact-output/design.md` — 全体
- `specrunner/changes/gitless-artifact-output/tasks.md` — T-01〜T-12
- `specrunner/changes/gitless-artifact-output/test-cases.md` — TC-001〜TC-079（must/should 全件）
- `src/core/artifact-output/run.ts` — 全体（オーケストレーター）
- `src/core/artifact-output/revision-binding.ts` — 全体
- `src/core/artifact-output/source-guard.ts` — 全体
- `src/core/artifact-output/execution-profile.ts` — 全体
- `src/core/artifact-output/preflight.ts` — 全体
- `src/core/artifact-output/patch.ts` — 全体
- `src/core/artifact-output/artifact-writer.ts` — 全体
- `src/core/artifact-output/guarded-spawn.ts` — 全体
- `src/core/snapshot/collect.ts` — 全体
- `src/core/snapshot/digest.ts` — 全体
- `src/core/snapshot/compare.ts` — 全体
- `src/core/command/guide.ts` — artifact-output topic 節
- `src/core/pipeline/registry.ts` — DESIGN_ONLY_DESCRIPTOR
- `tests/artifact-output-vertical.test.ts` — 全体
- `src/core/artifact-output/__tests__/run.test.ts` — 全体
- `src/core/artifact-output/__tests__/preflight.test.ts` — 全体
- `src/core/artifact-output/__tests__/context-binding.test.ts` — 全体
- `src/core/artifact-output/__tests__/patch.test.ts` — 抜粋
- `src/core/artifact-output/__tests__/materialize.test.ts` — 抜粋
- `tests/unit/architecture/artifact-output-git-free.test.ts` — 全体
- `src/core/command/__tests__/guide.test.ts` — TC-074/TC-075 節
- `specrunner/changes/gitless-artifact-output/verification-result.md` — passed 確認

### 確認した内容
- `git diff main...HEAD --stat` で変更全体を把握（50 files, +9733 行）
- verification-result.md で all green 確認（build/typecheck/test/lint/changed-line-coverage 全 passed）
- TC-001（git spawn なし）、TC-003（.git 非参照）、TC-004/005（source 不変）、TC-023（artifact 一式）、TC-024（失敗時 artifact なし）、TC-032/TC-073（resume.supported=false）、TC-033（halt 記録）、TC-065（metrics）、TC-067（1000 file）、TC-068（git/gh 0 件）、TC-078（escape symlink halt）が vertical test に存在することを確認
- snapshot digest の canonical 形式（`dir\0<path>\040000\0\n`）が digest.ts で正しく実装されていることを確認
- `collectSnapshot` の fail-closed 挙動（unsupported-kind / symlink-escape / io-error）が正しいことを確認
- `deriveChangeSet` の kind 変化 → delete+add 分解が仕様通りであることを確認
- `runBoundToCandidateRevision` の pre/post snapshot drift 検出が正しいことを確認
- `UNSUPPORTED_OPERATIONS` テーブルと guide topic の内容を突き合わせ確認
- `checkSourceUnchanged` の unverifiable 分岐処理を確認
- `buildPatch` の added/modified file read 失敗時の分類を確認
- TC-006、TC-037、TC-038 が test suite に存在するか grep で確認 → 不在を確認

## 検証できなかった項目

- 実際の agent subprocess（Claude Code CLI）との配線動作（縦断は fake seam で代替、実 agent は CI に credential がないため）
- `docs/artifact-output-profile.md` の内容（README との --no-worktree 記述差分確認は guide.ts 側のみ実施）
- Windows / symlink 異なる挙動（CI は Linux）

## Findings 詳細

### F1: TC-006 not covered — source mutation detection end-to-end test 欠落（must）

**ファイル**: `tests/artifact-output-vertical.test.ts`

TC-006「run 中に source が変更されると検出される」は priority:must だが、vertical test suite に存在しない。
`assertSourceUnchanged` は `source-guard.ts` に実装されており、`run.ts` の `checkSourceUnchanged` から呼ばれているが、
「agent 実行中に外部プロセスが source を変更した場合に run.json が source-mutated を記録する」というシナリオは一切テストされていない。

AC「元 source directory が成功時・失敗時とも変更されない」を「観測でも示す」（D6）ためのテストが欠落している。

### F2: `checkSourceUnchanged` が `unverifiable` を fail-open で処理（correctness gap）

**ファイル**: `src/core/artifact-output/run.ts`（`checkSourceUnchanged` 関数）

```typescript
async function checkSourceUnchanged(...): Promise<void> {
  try {
    const guardResult = await assertSourceUnchanged(...);
    if (guardResult.kind === "mutated") {
      // エラー記録
    }
    // "unverifiable" の場合は何もしない — fail-open
  } catch {
    // best-effort
  }
}
```

`assertSourceUnchanged` が `{ kind: "unverifiable", reason }` を返した場合（source が I/O 不能になった等）、
`run.json` にはエラーも警告も記録されず、`completed` run がそのまま "completed" になる。
D6 は「不一致なら fail-closed で記録する」を要求しており、`source-guard.ts` 自体は "unverifiable" を
fail-closed で返すが、その消費者（run.ts）が fail-open になっている。

### F3: TC-038（must）不在 + guide topic に `--no-worktree` との差分説明が欠落

**ファイル**: `src/core/command/guide.ts`（artifact-output topic body）

TC-038「guide topic が profile と --no-worktree の違いを区別して説明する」は priority:must だが、
guide topic に `--no-worktree` の記述が一切ない。
D15: "(i) `--no-worktree` との違い" が guide topic の必須要件として挙げられており、
AC:「CLI / README で `--no-worktree` との違い、保証、unsupported operation が説明される」にも明示されている。

TC-075 のテストも `--no-worktree` の記述を assert していないため、drift guard として機能しない。

### F4: TC-037（must）不在 + guide unsupported 一覧が capability テーブルから生成されていない

**ファイル**: `src/core/command/guide.ts`（artifact-output topic body）

D15:「unsupported 一覧は D12 の capability テーブルから文字列生成し、テーブルと doc の drift をテストで禁止する」が要求だが、
現実装は guide body に手書きの Markdown テーブルを埋め込んでいる。

`execution-profile.ts` の `UNSUPPORTED_OPERATIONS`（6 項目）と guide の hardcoded テーブルは粒度が異なり、
「Commit OID-bound operations」が guide テーブルに明示的に登場しない等の乖離がある。
drift を防ぐテストも存在しない（TC-037 は guide test suite に不在）。

### F5: `buildPatch` が unreadable added/modified entry を `not-applicable` に分類 → payload から除外

**ファイル**: `src/core/artifact-output/patch.ts`（`classifyAndDiff` 関数）

```typescript
if (changeKind === "added") {
  const bytes = await readFile(candPath);
  if (!bytes) {
    return { path, classification: "not-applicable", diffContribution: "" }; // ← drop
  }
  ...
}
// modified も同様
if (!baseBytes || !candBytes) {
  return { path, classification: "not-applicable", diffContribution: "" }; // ← drop
}
```

`readFile` が null を返した場合（ファイルが読めない）、added/modified エントリが `not-applicable` に分類される。
`artifact-writer.ts` の `writePayload` は `omitted:binary` と `omitted:size` のみ payload に書き出すため、
`not-applicable` なエントリは patch にも payload にも含まれない。

理論的には「agent が書いた直後のファイルが読めない」は稀だが、
AC「text patch で表現できない変更が manifest / payload から欠落しない」に対して
payload から欠落する経路が生まれており、D8 の `not-applicable` の意味（symlink/dir/mode-only）とも不一致。

### F6: `buildPatch` が deleted file の read 失敗・大容量を `omitted:size` に分類（D8 軽微不整合）

**ファイル**: `src/core/artifact-output/patch.ts`（`classifyAndDiff` 内 `deleted` 分岐）

D8 は `omitted:size` を「change=added/modified かつ size 上限超過」と定義しているが、
deleted 分岐の size 超過・read 不能も `omitted:size` を返す。
deleted の場合、D8 には size 超過の分類が未定義であり、
spec 外の意味で `omitted:size` が使われている。

実害は少ない（baseline は snapshot 収集済みで通常 readable）が、manifest consumer が
patch 分類から「deleted + size 超過」を正しく推定できない（D8 の「1:1 対応」契約が崩れる）。
