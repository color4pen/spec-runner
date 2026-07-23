# Conformance Result — operator-canon-apply-on-resume — iter 1

## Identity

- **Change**: operator-canon-apply-on-resume
- **Iteration**: 1
- **Judgment against**: request.md × design.md (D1–D7) × spec.md (5 Requirements / 7 Scenarios) × tasks.md (T-01–T-08)

---

## 検証した項目

### J1: Task Completeness

T-01〜T-08 の全サブタスクが `[x]` であることを確認。

- T-01 `apply-canon.ts` モジュール（detectCanonDirtyPaths / commitOperatorCanon） ✓
- T-02 CLI フラグ登録（command-registry.ts / cli/resume.ts） ✓
- T-03 `ResumeCommand.prepare()` ロジック（gate / commit / persist） ✓
- T-04 `CANON_FINDING_ESCALATION` hint 文言 ✓
- T-05 `buildCanonEscalationReason` 文言 ✓
- T-06 E2E 統合テスト TC-R1〜TC-R6 ✓
- T-07 ユニットテスト TC-U1〜TC-U7 ✓
- T-08 `typecheck && test` green ✓

### J2: Design Decisions (D1–D7)

**D1** — `--apply-canon` フラグ: `command-registry.ts` に `"apply-canon": { type: "boolean" }` 追加、`runResumeCore` → `ResumeCommand` まで正しく伝播。

**D2** — flag なし fail-closed: `resume.ts` で `dirtyCanonPaths.length > 0 && !applyCanon` のとき `logError`（汚染パス一覧） + `stderrWrite`（--apply-canon ヒント） + `throw new PrepareError(1, …)`。両関数とも `process.stderr.write` に書く。

**D3** — `src/core/resume/apply-canon.ts` 新設: `detectCanonDirtyPaths`（git status NUL-delimited パース、protectedCanonPaths との集合積、失敗時 throw）・`commitOperatorCanon`（pathspec 限定 `git add -A -- <paths>`、`git commit -m "operator-apply: <slug>" -- <paths>`、`git rev-parse HEAD`）を export。defaultSpawnFn は import しない。

**D4** — OID 台帳記録 + state 再永続化（step 開始前）: `commitOperatorCanon` → `appendSynthesizedCommit` → `runStore.persist` → `logInfo` の順で実行。`return PrepareResult` より前に完了する。`appendSynthesizedCommit` は `../../state/schema.js` 経由（`schema/operations.js` の barrel re-export）。

**D5** — commit メッセージ `operator-apply: <slug>`、explicit pathspec: `apply-canon.ts` で `commitMessage = \`operator-apply: ${slug}\`` 使用。`git add` / `git commit` ともに `-- ...paths` を付与。

**D6** — worktree 不在時スキップ: `resolvedWorktreePath !== null && resolvedSlug !== null` ガードの else ブランチで警告のみ出力して継続。

**D7** — store 参照の保持: `let runStore: JobStateStore | null = null;` を try-block 外で宣言し、running 遷移ブロックで代入、apply-canon persist で再使用。`resolveStateStoreByJobId` 二重呼び出しなし。

**split-brain 軽減策**: `committedOid !== null` かつ persist 例外の場合、`git reset --mixed HEAD~1` でコミット巻き戻し → operator 編集が worktree dirty に戻る → 再 resume 可能。二重障害時のみ手動 push メッセージを表示。

### J3: Spec Requirements (SHALL/MUST)

**Req 1** (resume --apply-canon がステップ前に operator canon 変更を commit): 5 ステップ（列挙→stage→commit→OID 追記→clean worktree でステップ開始）全実装確認。TC-001（E2E real git）・TC-002 でシナリオ網羅。

**Req 2** (--apply-canon は保護正典パスのみ適用): pathspec 限定 add・commit で非 canon dirty が index にも commit にも混入しないことを確認。TC-003 で `git diff-tree` + `git diff --cached` 両アサーション（cross-boundary F2 fix 含む）が通ることを確認。

**Req 3** (flag なし resume の fail-closed): `PrepareError(1)` throw、step 未起動を TC-004 で、clean worktree での非退行を TC-005 で確認。

**Req 4** (OID が synthesizedCommits に永続化): TC-006 で `verifyEgressLedger` が OID あり→通過、OID なし→`EGRESS_UNKNOWN_COMMIT` を確認（破壊確認を兼ねる）。

**Req 5** (CANON_FINDING_ESCALATION hint が --apply-canon を案内): `commit-orchestrator.ts` line 369 の hint に `--apply-canon` を含み `` `git push` `` / `` `git commit` `` を含まないことを確認。`buildCanonEscalationReason` 出力に `--apply-canon` を含むことを TC-007/TC-008 で確認。

### J4: Request.md 受け入れ基準

| 基準 | テスト | 確認 |
|------|--------|------|
| 統合テスト (実 store + 実 git) で mado-os シナリオを封鎖 | TC-001 | ✓ |
| --apply-canon 取り込みが保護正典パスのみ | TC-003 | ✓ |
| flag なし + dirty → step 未開始・案内付き停止 | TC-004 | ✓ |
| OID が synthesizedCommits に永続化、egress 照合を通過 | TC-006 | ✓ |
| hint / escalation reason が新手順を案内 | TC-007/TC-008 | ✓ |
| 修正前挙動に戻すと封鎖テストが fail (破壊確認) | TC-018 (sabotage record) | ✓ |
| typecheck && test が green | verification-result.md (全フェーズ exit 0) | ✓ |

---

## 検証できなかった項目

None。すべての受け入れ基準・設計判断・Requirement・Scenario について実装コードまたはテストで証拠を確認できた。

---

## Findings 詳細

指摘なし（approved）。

**非ブロッキング観察（記録のみ）**:

1. split-brain catch ブランチのエラーメッセージ "Failed to create operator-apply commit" は、commit 成功 + persist 失敗のケースでも同じ文言を使う。機能的影響なし。
2. TC-004 の dirty path アサーションが `/tasks\.md|dirty|canon/i` という緩い正規表現を使用。実行時は `logError` が実際のパス名を stderr に出力しており実装は正しいが、テストは PrepareError メッセージ中の "dirty"/"canon" で通過する。精度の余地はあるが regression リスクはない。
