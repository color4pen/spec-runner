# Proposal: finish コマンドの Phase 0 で feature branch に checkout してから validate を実行する

## 問題の本質

`specrunner finish <slug>` の Phase 0 check 6 で `openspec validate <slug> --strict` を実行するが、local mode では change folder (`openspec/changes/<slug>/`) は feature branch にのみコミットされている。main ブランチの cwd で validate を実行すると change folder が認識されず `Unknown item` で escalation する。

Phase 1 では `checkoutFeatureBranch()` で feature branch に checkout する設計だが、Phase 0 は pre-flight check であり、git 操作を一切行わない前提で設計されている。この前提が local mode で破綻している。

## 根本原因

`src/core/finish/preflight.ts` の Check 5（change folder existence）と Check 6（openspec validate）は `cwd`（現在のブランチ）のファイルシステムを参照する。local mode では change folder は feature branch にのみ存在するため、main にいる状態では Check 5 で `false` → Check 6 スキップ、または Check 5 で `true`（稀に main にも残っている場合）→ Check 6 で validate 失敗、のいずれかが発生する。

## 提案する修正

### Phase 0 に branch checkout を追加

Check 5+6 の実行前に `target.branch` に checkout し、完了後（成功/失敗問わず）に元の branch に戻る。

```
Phase 0 flow (修正後):
  Check 1-4: (既存、git 操作なし)
  ↓
  git rev-parse --abbrev-ref HEAD  → originalBranch を記録
  git fetch origin <target.branch>
  git checkout <target.branch>
  ↓
  Check 5: change folder existence
  Check 6: openspec validate
  ↓
  git checkout <originalBranch>  (finally: 成功/失敗問わず)
  ↓
  Check 8: unpushed commits
```

### 設計判断

1. **checkout 範囲の最小化**: Check 5+6 のみを checkout 下で実行。Check 7（binary check）、Check 8（unpushed commits）は checkout 不要
2. **finally パターン**: checkout 失敗時も元の branch に戻る。戻れない場合は escalation
3. **managed mode 対応**: remote にのみ branch がある場合は `git fetch origin <branch>` を先行実行
4. **Phase 1 との二重 checkout**: Phase 1 の `checkoutFeatureBranch()` は `git checkout -B <branch> origin/<branch>` で冪等なので問題なし

## 影響範囲

- **変更ファイル**:
  - `src/core/finish/preflight.ts`: Check 5+6 を branch checkout で囲む
  - `tests/unit/core/finish/preflight.test.ts`: checkout/restore の spawn mock 追加

- **既存機能への影響**:
  - Phase 1 の `checkoutFeatureBranch()` は冪等（`-B` フラグ）なので、Phase 0 で checkout 済みでも問題なし
  - dry-run モード: Phase 0 のみ実行されるため、checkout→validate→restore が dry-run でも発生する（仕様の一部）

- **後方互換性**: 破壊的変更なし。main 上に change folder がある場合は従来通り動作する

## 受け入れ基準

- [ ] local mode で `specrunner finish` が Phase 0 check 6 を通過する
- [ ] finish 完了後に元の branch に戻っている
- [ ] `bun run typecheck && bun run test` が green
