# Spec: archive-change-folder の親ディレクトリ実行時保証

## Requirements

### Requirement: archive-change-folder shall ensure the archive parent directory before moving

`archive-change-folder` step は change folder を `git mv` で移動する前に、移動先の親ディレクトリ
`specrunner/changes/archive/` が存在することを保証 (SHALL) する。保証は step 実行時に行い、
ディレクトリが既に存在する場合は冪等な no-op として扱う MUST。

#### Scenario: archive ディレクトリ不在時は作成してから移動が成功する

**Given** change folder `specrunner/changes/<slug>/` が存在し、`specrunner/changes/archive/` がまだ存在しない
**When** `archive-change-folder` step が実行される
**Then** `specrunner/changes/archive/` が作成された後に `git mv` が実行され、移動が成功し、結果が ok（skipped: false）になる

#### Scenario: archive ディレクトリ既存時は挙動が変わらない

**Given** change folder `specrunner/changes/<slug>/` と `specrunner/changes/archive/` の両方が存在する
**When** `archive-change-folder` step が実行される
**Then** 親ディレクトリ保証は冪等な no-op となり、`git mv` による移動が従来どおり成功する

#### Scenario: change folder 不在時は親ディレクトリを作らずに skip する

**Given** change folder `specrunner/changes/<slug>/` が存在しない
**When** `archive-change-folder` step が実行される
**Then** step は skip（ok: true, skipped: true）を返し、親ディレクトリ作成も `git mv` も行わない
