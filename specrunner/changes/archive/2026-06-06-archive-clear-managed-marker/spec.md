# Spec: archive 後に managed marker が残り幽霊 job が表示される

## Requirements

### Requirement: archive SHALL delete marker.json on success

`archive` コマンドが成功した場合、`.specrunner/local/<slug>/marker.json` を削除しなければならない（SHALL）。

#### Scenario: managed job を archive すると marker.json が削除される

**Given** `.specrunner/local/<slug>/marker.json` が存在する managed job
**When** `specrunner job archive <slug>` を実行し Phase 1 が成功する
**Then** `.specrunner/local/<slug>/marker.json` が存在しない

### Requirement: archive SHALL delete liveness.json on success

`archive` コマンドが成功した場合、`.specrunner/local/<slug>/liveness.json` を削除しなければならない（SHALL）。

#### Scenario: local job を archive すると liveness.json が削除される

**Given** `.specrunner/local/<slug>/liveness.json` が存在する local job
**When** `specrunner job archive <slug>` を実行し Phase 1 が成功する
**Then** `.specrunner/local/<slug>/liveness.json` が存在しない

### Requirement: deletion failure SHALL NOT fail the archive

`marker.json` または `liveness.json` の削除が失敗した場合、archive 全体を失敗させてはならない（SHALL NOT）。削除失敗は stderr に warning として出力される。

#### Scenario: marker.json が存在しない場合も archive は成功する

**Given** `.specrunner/local/<slug>/marker.json` が存在しない（local runtime）
**When** `specrunner job archive <slug>` を実行し Phase 1 が成功する
**Then** archive は exitCode 0 で完了し、stderr には marker 削除の warning が出ない

#### Scenario: liveness.json の unlink が失敗した場合も archive は成功する

**Given** `.specrunner/local/<slug>/liveness.json` の unlink が ENOENT 以外のエラーで失敗する
**When** `specrunner job archive <slug>` を実行し Phase 1 が成功する
**Then** archive は exitCode 0 で完了する
