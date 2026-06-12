# Spec: archive-branch-delete-idempotent

## Requirements

### Requirement: remote branch 削除は冪等である

`git push origin --delete <branch>` が `remote ref does not exist` を stderr に含んで失敗した場合、システムは warning を出力せず正常処理を継続しなければならない（SHALL）。

#### Scenario: auto-delete 済み branch を archive する

**Given** GitHub の merge 時自動削除により remote branch が既に存在しない  
**When** `job archive --with-merge` の Phase 2 が `git push origin --delete <branch>` を実行する  
**Then** warning は出力されず、archive は exitCode 0 で完了する

#### Scenario: auto-delete 済み branch を cancel する

**Given** remote branch が既に存在しない  
**When** `job cancel` の cleanup フェーズが `git push origin --delete <branch>` を実行する  
**Then** warnings 配列に当該 branch に関する warning は追加されない

---

### Requirement: 不存在以外の remote branch 削除失敗は warning を出す

`git push origin --delete <branch>` が失敗し、かつ stderr が `remote ref does not exist` を含まない場合、システムは warning を出力しなければならない（SHALL）。

#### Scenario: 認証エラーで削除失敗（archive 経路）

**Given** remote branch が存在するが認証トークンが無効  
**When** `job archive --with-merge` の Phase 2 が `git push origin --delete <branch>` を実行し非 0 で終了する（stderr に `remote ref does not exist` を含まない）  
**Then** `Warning: failed to delete remote branch <branch>.` が stderr に出力される

#### Scenario: 認証エラーで削除失敗（cancel 経路）

**Given** remote branch が存在するが認証トークンが無効  
**When** `job cancel` の cleanup フェーズが `git push origin --delete <branch>` を実行し非 0 で終了する（stderr に `remote ref does not exist` を含まない）  
**Then** warnings 配列に warning メッセージが追加される

---

### Requirement: remote branch 削除成功は silent に処理される

`git push origin --delete <branch>` が exitCode 0 で完了した場合、warning は出力されない（SHALL）。

#### Scenario: 正常削除（archive 経路）

**Given** remote branch が存在する  
**When** `job archive --with-merge` の Phase 2 が `git push origin --delete <branch>` を実行し exitCode 0 で完了する  
**Then** remote branch 削除に関する warning は出力されない
