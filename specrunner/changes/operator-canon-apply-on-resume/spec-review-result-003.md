# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 1. operator 適用 commit 557f49671 の解消確認（前回 F3）

`git diff HEAD~1 HEAD -- specrunner/changes/operator-canon-apply-on-resume/tasks.md` で diff を確認:

- T-01 Acceptance Criteria (line 30):
  - **変更前**: `detectCanonDirtyPaths` returns `[]` (not throws) when `git status` fails.
  - **変更後**: `detectCanonDirtyPaths` throws when `git status` fails（fail-closed — spec-review F2。caller は resume 不開始 + 案内表示として扱う）.
  - → **F3 解消** ✓

- T-07 TC-U4 (line 174):
  - **変更前**: `detectCanonDirtyPaths` returns `[]` (not throws) when `git status` exits non-zero.
  - **変更後**: `detectCanonDirtyPaths` throws when `git status` exits non-zero（fail-closed — R2 を無条件保証にする。DESTROY: [] 縮退へ戻すと本 TC が fail）.
  - → **F3 解消** ✓

### 2. fail-open 残存の全掃確認

`grep -n "not throws|returns \[\].*fail|fail-open"` で tasks.md を検索 → マッチなし。  
`git status` 失敗を `[]` で縮退させる記述はすべて消去されており、fail-closed への統一を確認。

### 3. 前回 F1・F2 の持続確認

- **F1（hint 文字列）**: T-04 の新 hint は「手動の git 操作 (commit / push) は不要です。」で固定済み。  
  部分文字列 `git push` / `git commit` を含まないことを文字列解析で確認（前回 Python 検証の継続）。
  spec.md の negative assertion `state.error.hint does NOT contain git push or git commit` と整合。

- **F2（throw on git failure）**: T-01 本文に「Throw on any git failure」記載済み、design.md D3 に同旨記載済み、T-01 AC・TC-U4 も throw 仕様に統一済みを確認。

### 4. 要件 → spec → design → tasks の縦断トレース

**R1（--apply-canon モード）**:
- spec.md: 2 シナリオ（apply-canon 成功 / clean worktree no-op）✓
- design.md: D1（explicit flag）D3（apply-canon.ts）D4（OID in synthesizedCommits）D5（commit message）✓
- tasks.md: T-01 / T-02 / T-03、TC-R1 / TC-R2 ✓

**R2（flag なし fail-closed）**:
- spec.md: 2 シナリオ（dirty → halt with guidance / clean → normal）✓
- design.md: D2（fail-closed, exit 1, actionable guidance）✓
- tasks.md: T-03 PrepareError(1) throw、TC-R3 ✓

**R3（hint / escalation 文言更新）**:
- spec.md: 2 シナリオ（hint contains --apply-canon / buildCanonEscalationReason contains --apply-canon）✓
- tasks.md: T-04 / T-05、TC-R5 ✓

**R4（帰属の健全性）**:
- design.md: D1（attribution laundering rejection documented）✓
- tasks.md: T-03 の apply-canon ゲートは `applyCanon` フラグが true の場合のみ commit を実行 ✓

### 5. request.md 受け入れ基準 vs テストカバレッジ

| 受け入れ基準 | 対応テスト |
|---|---|
| 統合テスト(実 store + 実 git): mado-os 実発現の封鎖 | TC-R1 ✓ |
| --apply-canon の取り込み対象が保護正典パスのみ | TC-R2 ✓ |
| flag なし resume + dirty → 停止・案内 | TC-R3 ✓ |
| OID が synthesizedCommits に永続化、egress 照合を通る | TC-R4 ✓ |
| hint / escalation reason が新手順を案内 | TC-R5 ✓ |
| 修正前の挙動に戻すと封鎖テストが fail | TC-R6 ✓（+ TC-U4 DESTROY annotation）|
| typecheck && test green | T-08 ✓ |

### 6. セキュリティ確認

- **git コマンド injection**: `commitOperatorCanon` の commit message に slug を展開するが、`runSubprocess` は引数配列でコマンドを実行するためシェルメタ文字の injection 不可。
- **path traversal**: `detectCanonDirtyPaths` が返すパスは `protectedCanonPaths(slug)` との積集合に限定。`--apply-canon` が staging する pathspec も同集合のみ。
- **帰属洗浄防止**: crash 残留の agent 編集が explicit flag なしで synthesizedCommits に取り込まれないことを D1 で明示。フラグ不在時は PrepareError で停止。

---

## 検証できなかった項目

- `src/core/resume/` 既存ファイル（`safety.ts` 等）との循環依存チェック。design.md が "architecture-compliant" と明示しており、architect 評価済みとして採用。
- `git commit` 実行時の git user config がテスト環境で担保されているか（T-06 の実 git リポジトリ設定）。実装細目でありスペックレベルの確認対象外。

---

## Findings 詳細

None（typing findings なし）。

### 観察事項（ブロックではない・継続）

**OB-1: TC-R5 が spec.md の negative assertion を未カバー（継続）**  
TC-R5 は `assert(hint.includes("--apply-canon"))` を検査するが、
spec.md の `state.error.hint does NOT contain git push or git commit` に対応する
`assert(!hint.includes("git push"))` がない。実際の hint 文字列は両語を含まないため低リスクだが、
実装段階で hint 文言が変更された際に回帰を見逃す可能性がある。

**OB-2: `--no-worktree` + `--apply-canon` の組み合わせが spec に未記載（継続）**  
design.md D6 および T-03 の acceptance criteria に記述はあるが、spec.md のシナリオと
統合テストにカバーがない。graceful degradation パスであり機能リスクは低い。

**OB-3: R2 fail-closed 停止時のジョブ状態が "running" になる（継続）**  
apply-canon ゲートは "transition to running" ブロック後に実行されるため、
flag なし + dirty で PrepareError(1) を throw するとジョブが "running" のまま残る。
stale-detection が次回 resume で自動復旧するため機能的問題はない。
design.md の Risks に明示はないが既知パターンと同一。
