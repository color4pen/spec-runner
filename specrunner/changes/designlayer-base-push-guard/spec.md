# Spec: designLayer 有効時に未 push の設計コミットを run 前に警告する

## Requirements

### Requirement: designLayer 有効かつ local base が origin base より ahead のとき run 前に未 push 警告を出す

`designLayer.enabled` が `true` で、かつ local `<baseBranch>` が `origin/<baseBranch>` より ahead（`git rev-list origin/<baseBranch>..<baseBranch> --count` が正）のとき、システムは worktree 作成（run path）の前に非ブロッキングの warning を出さなければならない（MUST）。warning は、worktree が `origin/<baseBranch>` から作られるため request が引用する設計要素を欠く可能性があることと、`origin/<baseBranch>` へ push してから run する対処（push コマンド）を含まなければならない（MUST）。この warning は run を中断してはならない（MUST NOT）。

#### Scenario: 有効 + ahead > 0 で警告が出る

**Given** `designLayer.enabled: true` の config と、local `main` が `origin/main` より 2 commit ahead の状態
**When** `setupWorkspace` の run path が `git fetch origin` 後に ahead 判定を行う
**Then** stderr に `ahead of origin/main` と push 手順を含む warning が出力され、worktree 作成は継続する

### Requirement: designLayer 無効のときは未 push 警告を出さない

`designLayer.enabled` が `true` でない（不在・`designLayerEnabled` 未注入を含む）とき、システムは ahead 判定のための追加コマンドを spawn してはならず（MUST NOT）、未 push 警告を出してはならない（MUST NOT）。

#### Scenario: 無効なら ahead > 0 でも警告なし

**Given** `designLayer.enabled` 未設定（`designLayerEnabled` 未注入）の run path で、local `main` が `origin/main` より ahead の状態
**When** `setupWorkspace` の run path が実行される
**Then** ahead 判定用の `git rev-list origin/main..main` は spawn されず、未 push 警告は出力されない

### Requirement: ahead が 0 のときは未 push 警告を出さない

`designLayer.enabled` が `true` でも、local `<baseBranch>` が `origin/<baseBranch>` より ahead でない（ahead 数が 0、または判定コマンドが非 0 で終了）とき、システムは未 push 警告を出してはならない（MUST NOT）。

#### Scenario: 有効 + ahead == 0 で警告なし

**Given** `designLayer.enabled: true` で、local `main` が `origin/main` と同一（ahead 0）の状態
**When** `setupWorkspace` の run path が ahead 判定を行う
**Then** 未 push 警告は出力されず、worktree 作成は継続する

### Requirement: 既存の behind 警告の挙動を保存する

システムは、既存の behind-warning（local `<baseBranch>` が `origin/<baseBranch>` より behind のときの informational warning）の判定・出力・出力条件を変更してはならない（MUST NOT）。ahead 検出の追加は behind 検出の戻り値・呼び出し・出力に影響を与えてはならない（MUST NOT）。

#### Scenario: behind 警告は不変

**Given** local `main` が `origin/main` より behind の状態（designLayer 有無に依らず）
**When** `setupWorkspace` の run path が実行される
**Then** 既存どおり `behind origin/main` を含む warning が出力され、その内容・条件は変わらない

### Requirement: docs に worktree base と push 順序を明文化する

ドキュメントは、job worktree の base が `origin/<baseBranch>` であることと、designLayer 連携時は request が引用する設計要素を含むコミットを `origin/<baseBranch>` へ push してから run すべきことを、明示的に記述しなければならない（MUST）。

#### Scenario: docs に記述が存在する

**Given** designLayer を導入したプロジェクトの利用者が authoring ドキュメントを参照する
**When** designLayer と設計要素引用の節を読む
**Then** 「worktree の base = `origin/<baseBranch>`」と「設計コミットを push してから run」の記述を確認できる
