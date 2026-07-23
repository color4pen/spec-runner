# Code Review Feedback — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 差分スコープ確認

`git diff main...HEAD --stat` で 28 ファイル・3576 行追加を確認。主要変更:
- `src/core/resume/apply-canon.ts`（新規）
- `src/core/command/resume.ts`（apply-canon gate 追加・runStore 変数リファクタ）
- `src/cli/command-registry.ts`（`--apply-canon` フラグ追加）
- `src/cli/resume.ts`（`applyCanon` オプション追加）
- `src/core/step/canon-escalation.ts`（buildCanonEscalationReason 更新）
- `src/core/step/commit-orchestrator.ts`（hint 文言更新）
- テスト 4 ファイル

### 仕様照合

`spec.md`・`design.md`・`tasks.md`・`test-cases.md` を通読し、要件 R1–R4 → 設計 D1–D7 → タスク T-01–T-08 → TC-001–TC-018 の縦断トレースを実施。

### apply-canon.ts 実装検証

`detectCanonDirtyPaths`:
- `git status --porcelain -z --no-renames -- <protectedCanonPaths>` を明示 pathspec で呼び出している ✓
- NUL 区切りパース・XY 状態コード判定・canonSet による intersect ✓
- exit != 0 で throw（fail-closed spec F2）✓
- `??` 未追跡ファイルを isUntracked ルートで保護正典のみ取り込む ✓

`commitOperatorCanon`:
- `git add -A` を使う設計を確認。`git add -- <paths>` で代替できないか精査:
  - 未追跡ディレクトリ (`specrunner/changes/<slug>/`) の直下ファイルを `git commit -- <path>` のみで取り込む場合、untracked ファイルは scoped-mode 残余検査 (`getWorktreeChangedPaths worktreeOnly=true`) の `paths` に露出し `findScopedCommitViolations` が WRITE_SCOPE_VIOLATION を発火する。
  - `git add -A` でステージすれば staged-only (Y==' ') となり `worktreeOnly` フィルタで除外 → 正典以外の未追跡ファイルが scoped ステップで残余違反を起こさない。
  - guarded ステップでは staged/untracked どちらも `changedPaths` に含まれコミットされるが、これは本変更前から存在する pipeline の挙動であり、本変更が新たな劣化を導入していない。
  - `git add -A` は設計上の意図的選択として妥当と判断した。

### resume.ts apply-canon gate 検証

- `runStore` を try-block 外で宣言・非 noWorktree 時にのみ代入するリファクタ ✓
- dirty → applyCanon=true: `commitOperatorCanon` → `appendSynthesizedCommit` → `runStore.persist` → step 開始 ✓
- dirty → applyCanon=false: `logError` + `stderrWrite(hint)` + `PrepareError(1)` ✓
- clean → どちらのフラグでも通常起動 ✓
- `resolvedWorktreePath === null` + `applyCanon=true`: `stderrWrite` 警告 → step 継続 ✓
- **F-001 の根拠**: exit 128 のみ catch してスルーする分岐を確認（詳細は F-001 参照）

### CLI 層検証

`command-registry.ts`: `"apply-canon": { type: "boolean" }` の追加・`applyCanon: !!parsed.flags["apply-canon"]` の受け渡しを確認 ✓  
`resume.ts`: `ResumeOptions.applyCanon?: boolean` 追加・`ResumeCommand` コンストラクタへの転送を確認 ✓

### hint / escalation 文言確認

`commit-orchestrator.ts` hint:
> `"…job resume <slug> --apply-canon で operator 適用 commit として取り込んでから再開してください。手動の git 操作 (commit / push) は不要です。"`

- `--apply-canon` を含む ✓
- 部分文字列 `git push` / `git commit`（単語連結）を含まない ✓（`(commit / push)` は別の文脈）

`buildCanonEscalationReason` 末尾行:
> `"…job resume <slug> --apply-canon で operator 適用 commit として取り込んでから再開してください。"`

`--apply-canon` を含む ✓

### テスト検証

**apply-canon.test.ts (TC-009〜TC-014)**:
- TC-012 sabotage variant (`threw === true` / `result === undefined`) で fail-closed が load-bearing であることを確認 ✓
- TC-013 の実 git repo を用いた commit message / OID / diff-tree / 残余確認 ✓

**resume-apply-canon.test.ts (TC-004, TC-005, TC-016, TC-018)**:
- TC-004: `mockDetectCanonDirtyPaths` が `[DIRTY_CANON_PATH]` を返す → prepare() が throw することを複数軸で確認 ✓
- TC-018: TC-004 と同一条件で threw=true を assert → guard が load-bearing の記録 ✓
- **F-002 の根拠**: TC-016 の両ケースで `applyCanon: true` が options に存在しない → `else if (this.options.applyCanon)` 分岐が未テスト（詳細は F-002 参照）

**e2e test (TC-001〜TC-008)**:
- TC-001: 実 git repo + bare remote で canon commit → OID 追加 → egress check pass を通し検証 ✓
- TC-003: `diff-tree` でコミット対象がキャノンパスのみであることを確認 ✓
- TC-006: OID を ledger に含めない場合に `EGRESS_UNKNOWN_COMMIT` が発生することを確認（破壊確認） ✓

**command-registry-apply-canon.test.ts (TC-015, TC-017)**:
- `applyCanon: true` が `runResume` の options として到達することを確認 ✓

### verification-result.md 確認

`build / typecheck / test / lint / changed-line-coverage` 全 phase passed（test: 9315 passed） ✓

## 検証できなかった項目

- 実 pipeline step を実行したうえで「判定 step が修正済み正典で再評価される」ことの end-to-end 確認（TC-001 はコミット・台帳・egress までを検証するが、実際の review step の実行はスコープ外）。設計上 clean worktree で step が開始されれば自明に成立する不変として許容範囲と判断。

## Findings 詳細

### F-001（medium）— exit-128 carve-out が fail-closed 保証を統合レベルで無テスト

**ファイル**: `src/core/command/resume.ts` 275–283 行

```typescript
try {
  dirtyCanonPaths = await detectCanonDirtyPaths(resolvedSlug, resolvedWorktreePath, defaultSpawnFn);
} catch (err) {
  const msg = (err as Error).message ?? "";
  if (msg.includes("exit 128")) {
    // worktreePath is not inside a git repository — treat as clean and continue.
  } else {
    logError(`Failed to detect dirty canon paths: ${msg}`);
    stderrWrite("Hint: ...");
    throw new PrepareError(1, "Failed to detect dirty canon paths (fail-closed)");
  }
}
```

`detectCanonDirtyPaths` は spec F2・tasks T-01 で「git status 失敗は throw（fail-closed）」と定義されており、TC-012 はこれを unit レベルで確認している。しかし `prepare()` は exit 128 を catch してスルーするため、統合レベルでは fail-closed の保証が条件付きになっている（worktree が git repo でない場合のみ例外）。

- 本番では `resolvedWorktreePath` は常に有効な git worktree を指すため運用リスクは低い
- ただし TC-012 だけを読むと「exit 128 は常に throw する」と解釈でき、`prepare()` の例外的挙動が不可視

**推奨対応**: 以下のいずれかで解消:
1. `resume-apply-canon.test.ts` に「`detectCanonDirtyPaths` が exit-128 エラーを throw する場合、`prepare()` は成功する（clean 扱い）」というテストケースを追加し、挙動を明文化する
2. `design.md` D3 または `spec.md` に「git status exit 128 は非 git ディレクトリを意味し clean として扱う」旨の注記を追加する

---

### F-002（low）— TC-016 に `applyCanon: true` が欠落・warning パスが未テスト

**ファイル**: `src/core/command/__tests__/resume-apply-canon.test.ts` 417–459 行

```typescript
// Note: applyCanon: true will be added by T-02; use type assertion for RED tests
} as Record<string, unknown> as never,
```

`test-cases.md` TC-016 の仕様は「--apply-canon フラグが指定されている状態で warning が stderr に出力される」ことを THEN に含む。しかし実際の test options に `applyCanon: true` が含まれていないため:

- `this.options.applyCanon` は falsy
- `else if (this.options.applyCanon) { stderrWrite("Warning: --apply-canon has no effect without a worktree...") }` 分岐が到達しない
- warning メッセージのアサーションも存在しない

T-02 完了後に残ったコメント（"will be added by T-02"）は削除すべき。

**推奨対応**:
```typescript
const cmd = new ResumeCommand(
  {} as never, {} as never, "test-slug",
  { cwd: "/repo", noWorktree: true, applyCanon: true },
);
// THEN: stderrWrite が warning を出力する
const stderrCalls = vi.mocked(stderrWrite).mock.calls.map(([m]) => String(m));
expect(stderrCalls.some(m => m.includes("--apply-canon") && m.includes("no effect"))).toBe(true);
```

---

## ポジティブ観察（参考）

- `git add -A` の選択: scoped ステップの `findScopedCommitViolations` が `worktreeOnly=true` で untracked ファイル（Y='?'）を `paths` に含めるため、`git add -- <canon-paths>` のみでは非正典の未追跡ファイルが WRITE_SCOPE_VIOLATION を発火する。`git add -A` でステージしておくことで staged-only (Y=' ') となりフィルタされる。設計通りの実装。
- 三層テスト構造（unit mock / integration mock / e2e 実 git）が責務を明確に分離している。
- TC-018 の sabotage record（インラインコメント + assert）が guard の load-bearing を機械的に証明している。
- `appendSynthesizedCommit` が `synthesizedCommits ?? []` でフォールバックするため、`synthesizedCommits` が未定義の初期状態でも安全に動作する。
