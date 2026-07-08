# Spec: fast pipeline のガード構成データを自己保護する

## Requirements

### Requirement: config 自身を fast pipeline の forbidden surface として宣言する

`.specrunner/config.json` の `pipeline.fast.forbiddenSurfaces` は、config ファイル自身
（repo-relative path `.specrunner/config.json`）を保護する surface（id `guard-config`）を
宣言 SHALL する。これにより fast pipeline の job が config を変更した場合、conformance
checkpoint が既存の scope-breach 検出経路で breach を検出する。

surface 宣言はガードの構成データ（forbidden surfaces / verification coverage）を含む config
全体を対象とし、agent が run 内で surface 宣言を削除・改変しても、その変更自体が breach
として検出される。

#### Scenario: fast job が config を変更すると breach が検出される

**Given** fast pipeline の permissionScope が config から解決され、`guard-config` surface
（path `.specrunner/config.json`）を含む
**When** conformance checkpoint で changed files に `.specrunner/config.json` が含まれる
**Then** scope breach が導出され、decision-needed の scope finding（origin `scope`）が 1 件
合成され、conformance の verdict は escalation になる

#### Scenario: config を変更しない fast job は breach にならない

**Given** fast pipeline の permissionScope が `guard-config` surface を含む
**When** conformance checkpoint で changed files に `.specrunner/config.json` が含まれない
**Then** `guard-config` に起因する scope finding は合成されず、verdict は不変（approved）

### Requirement: worktree 内 cwd からの resume を config 読み込み前に拒否する

`job resume` は、起動 cwd の実パスが specrunner の job worktree
（`.git/specrunner-worktrees/` 配下）である場合、config を読み込む前に非 0 exit で
拒否 SHALL する。エラー出力には main checkout 側から再実行する案内を含める。

判定は cwd の実パスに `.git/specrunner-worktrees/` の path segment が含まれるかという
機械的な条件のみで行い、agent や運用者の判断を要しない。

#### Scenario: worktree 内 cwd からの resume は拒否される

**Given** 起動 cwd の実パスが `<repoRoot>/.git/specrunner-worktrees/<slug>-<id>` 配下にある
**When** `job resume <slug>` が起動される
**Then** config を読み込む前・job state を解決する前に非 0 exit で終了し、
エラー出力に main checkout から再実行する案内が含まれる

#### Scenario: main checkout からの resume は従来どおり動作する

**Given** 起動 cwd の実パスが `.git/specrunner-worktrees/` 配下でない（main checkout）
**When** `job resume <slug>` が起動される
**Then** worktree ガードは no-op として素通りし、resume は従来どおり config を解決して継続する
