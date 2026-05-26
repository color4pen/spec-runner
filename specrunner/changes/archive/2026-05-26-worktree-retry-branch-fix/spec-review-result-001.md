# Spec Review Result: worktree-retry-branch-fix

- **verdict**: approved

## Summary

設計・タスク・テスト戦略すべてにわたって整合性が取れており、実装上の障害となる問題は見当たらない。

---

## Findings

### [OK] bug の root cause 診断が正確

`git worktree add -b` の内部順序（branch 作成 → worktree dir 作成）と git のロールバック欠如は既知の git 仕様で、request.md の再現経路は正確に記述されている。

### [OK] branch 存在チェックの方法論

`git rev-parse --verify refs/heads/<branch>` の exit code ベース判定を採用している。stderr 文言パースと比較して git バージョン非依存であり、正しい設計判断。

### [OK] 既存テスト (TC-WTM-010/011/012) への regression なし

既存ロック競合テストはすべて `branchName` 引数なし（`--detach` モード）で呼び出している。新設計で追加される `rev-parse` / `branch -D` の spawn 呼び出しは `branchName` が undefined のとき全スキップされるため、これらテストの spawn response 配列は修正不要。regression ゼロ。

### [OK] cleanup (branch -D) のスコープ

cleanup はロック競合に限定せず `!isLockContention || attempt === MAX_RETRIES` の全 throw 経路で実行される。これは正しい。ロック競合以外でも branch が部分作成されるケースは理論上ありえるため、全 failure 時に cleanup する実装の方が安全。cleanup 自体はべき等（branch がなければ `git branch -D` は exit 非 0 → 握りつぶし）。

### [OK] `git worktree add <path> <branchName>` の有効性

既存 branch を使って worktree を追加する標準形式。この時点で branch は存在するが worktree dir は未作成のため `--force` 不要。

### [OK] セキュリティ

`branchName` と `worktreePath` は `spawn()` に配列引数で渡されており、シェル文字列結合を行わない。外部ネットワーク入力が直接流入する経路もない。injection リスクなし。

### [OK] TC-WTM-013〜016 のカバレッジ

- TC-WTM-013: ロック競合 → branch 存在 → `-b` なし retry → 成功
- TC-WTM-014: ロック競合 → branch 未存在 → `-b` 付き retry → 成功
- TC-WTM-015: 全 retry 失敗 → `git branch -D` 呼び出し確認
- TC-WTM-016: `--detach` モードで全 retry 失敗 → `git branch -D` が呼ばれないこと確認

受け入れ基準の 4 つのテスト要件をすべてカバーしている。

### [OK] インターフェース変更なし

`WorktreeManager` 公開インターフェース・`createWorktreeManager` シグネチャともに変更なし。呼び出し元への影響なし。

### [軽微] tasks.md は TC-WTM-015 の spawn response 数を "3 回 lock contention fail + 各 rev-parse → 最後に branch -D" と記述

実際には attempt 3（MAX_RETRIES）では rev-parse をスキップして即 throw するため、spawn 呼び出し数は 6 回（worktree-add×3 + rev-parse×2 + branch-D×1）となる。記述は「各 rev-parse」と曖昧だが、実装上は問題なく解釈できる範囲。blocking ではない。
