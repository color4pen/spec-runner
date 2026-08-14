# Spec: archive の draft 削除を repo 本体側・両形式に直す

## Requirements

### Requirement: archive はフラット形式 draft を repo 本体から削除する

archive 完了時、`runArchiveOrchestrator` は repo 本体(cwd)の `specrunner/drafts/<slug>.md`(フラット形式) が存在する場合、それを削除しなければならない(SHALL)。draft が git 管理外(untracked)であっても削除は実行される。

#### Scenario: フラット形式 draft が untracked で存在する場合

**Given** repo 本体の `specrunner/drafts/<slug>.md` が存在し、`git ls-files` の結果が空(untracked)である  
**When** archive が実行される  
**Then** `fs.rm` が `<cwd>/specrunner/drafts/<slug>.md` を引数に呼ばれ、archive は exitCode 0 で完了する

---

### Requirement: archive はディレクトリ形式 draft を repo 本体から削除する

archive 完了時、`runArchiveOrchestrator` は repo 本体(cwd)の `specrunner/drafts/<slug>/`(ディレクトリ形式) が存在する場合、それを再帰的に削除しなければならない(SHALL)。draft が git 管理外(untracked)であっても削除は実行される。

#### Scenario: ディレクトリ形式 draft が untracked で存在する場合

**Given** repo 本体の `specrunner/drafts/<slug>/` が存在し、`git ls-files` の結果が空(untracked)である  
**When** archive が実行される  
**Then** `fs.rm` が `<cwd>/specrunner/drafts/<slug>/` を引数に `{ recursive: true, force: true }` で呼ばれ、archive は exitCode 0 で完了する

---

### Requirement: 両形式とも存在しない場合 archive は無音で続行する

`specrunner/drafts/<slug>.md` も `specrunner/drafts/<slug>/` も存在しない場合、`runArchiveOrchestrator` は draft 削除に関する警告を出さず(MUST)、archive を正常完了させなければならない(SHALL)。

#### Scenario: draft が一切存在しない場合

**Given** repo 本体に `specrunner/drafts/<slug>.md` も `specrunner/drafts/<slug>/` も存在しない  
**When** archive が実行される  
**Then** draft に関する `stderrWrite` 呼び出しがなく、archive は exitCode 0 で完了する

---

### Requirement: tracked な draft は削除せず警告を出す

archive 完了時に削除対象の draft が `git ls-files` で追跡されていると判明した場合、`runArchiveOrchestrator` は `fs.rm` を呼ばず(MUST)、`stderrWrite` 経由で警告を出さなければならない(SHALL)。

#### Scenario: tracked なフラット形式 draft が存在する場合

**Given** repo 本体の `specrunner/drafts/<slug>.md` が存在し、`git ls-files` の stdout が非空(tracked)である  
**When** archive が実行される  
**Then** `fs.rm` はそのパスに対して呼ばれず、`stderrWrite` に警告が出力され、archive は exitCode 0 で完了する

#### Scenario: tracked なディレクトリ形式 draft が存在する場合

**Given** repo 本体の `specrunner/drafts/<slug>/` が存在し、`git ls-files` の stdout が非空(tracked)である  
**When** archive が実行される  
**Then** `fs.rm` はそのパスに対して呼ばれず、`stderrWrite` に警告が出力され、archive は exitCode 0 で完了する

---

### Requirement: フラット形式とディレクトリ形式が同時に存在する場合、両方を削除する

フラット形式とディレクトリ形式の両方が存在する場合、`runArchiveOrchestrator` はフラット形式を先に、ディレクトリ形式を後に(SHALL)処理し、両方を削除しなければならない(SHALL)。どちらも untracked であることを前提とする。

#### Scenario: フラット形式とディレクトリ形式が同時に存在する場合

**Given** repo 本体の `specrunner/drafts/<slug>.md` と `specrunner/drafts/<slug>/` の両方が存在し、いずれも `git ls-files` の結果が空(untracked)である  
**When** archive が実行される  
**Then** `fs.rm` がフラットパス(`<cwd>/specrunner/drafts/<slug>.md`)とディレクトリパス(`<cwd>/specrunner/drafts/<slug>/`)の両方に対して呼ばれ、archive は exitCode 0 で完了する
