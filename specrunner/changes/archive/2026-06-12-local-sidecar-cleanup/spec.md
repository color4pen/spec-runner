# Spec:

## Requirements

### Requirement: archive 完了時に sidecar ディレクトリを削除する

`job archive` の Phase 2 完了時に、当該 slug の `.specrunner/local/<slug>/` を
`fs.rm(..., { recursive: true, force: true })` で削除 SHALL する。
削除失敗（権限エラー等）は archive の成否に影響させてはならない（MUST NOT）。

#### Scenario: archive 後にディレクトリが存在しない

**Given** `.specrunner/local/<slug>/` が存在する状態で archive を実行する
**When** archive Phase 2 が完了する
**Then** `.specrunner/local/<slug>/` が削除されている

#### Scenario: sidecar ディレクトリ削除の失敗が archive を失敗させない

**Given** `.specrunner/local/<slug>/` の削除が EACCES で失敗する
**When** archive Phase 2 が実行される
**Then** archive の終了コードは 0 であり stderrWrite に警告が出力される

---

### Requirement: doctor が orphan sidecar を検出・列挙する

`specrunner doctor` は `.specrunner/local/` 配下のすべてのディレクトリを走査し、
対応する job state が archived もしくは不存在のものを orphan として列挙 SHALL する。
orphan が存在する場合は件数と削除手順（`rm -rf` コマンド）を提示する。

#### Scenario: orphan なし — pass

**Given** `.specrunner/local/` が存在しない、またはすべての sidecar に active な job state がある
**When** doctor を実行する
**Then** orphan-sidecars チェックが status: "pass" を返す

#### Scenario: orphan あり — warn

**Given** `.specrunner/local/<slug>/` が存在し、`specrunner/changes/<slug>/state.json` が
存在しない（または status: "archived"）
**When** doctor を実行する
**Then** orphan-sidecars チェックが status: "warn" を返し、orphan のパスと `rm -rf` 手順を提示する

#### Scenario: active job の sidecar は orphan とみなさない

**Given** `.specrunner/local/<slug>/` が存在し、対応する job state が "running" または "awaiting-*"
**When** doctor を実行する
**Then** その sidecar は orphan リストに含まれない

---

### Requirement: doctor check は read-only — sidecar を削除しない

`orphan-sidecars` チェックは読み取りのみを行い、
いかなる sidecar ディレクトリも削除 MUST NOT する。

#### Scenario: doctor check が fs.rm / fs.unlink を呼ばない

**Given** orphan sidecar が複数存在する状態で doctor を実行する
**When** orphan-sidecars チェックが完了する
**Then** `fs.rm` / `fs.unlink` は一切呼ばれず、sidecar ディレクトリはすべて残存している
