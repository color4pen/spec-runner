# register-branch-tool

## MODIFIED Requirements

### Requirement: ハンドラは last-write-wins で冪等に動作する

`register_branch` のハンドラは MUST 同一 session 内で複数回呼ばれた場合、毎回 state.branch を入力値で上書きする。slug が input に含まれている場合は同時に MUST `state.request.slug` も入力値で上書きする。slug が省略された場合は handler 側で `branch` から prefix（`feat/` `fix/` `change/` `refactor/` `chore/`）を strip し、さらに末尾の jobId suffix（`/-[0-9a-f]{8}$/` にマッチする部分）を strip した結果を slug として SHALL 導出し、`state.request.slug` に設定する。strip 結果が空文字列の場合は `state.request.slug` を `null` のまま残す。

Agent には SHALL 常に `{ ok: true, branch: <input>, slug: <resolved-slug> }` を返す。

#### Scenario: 1 回呼び出し（slug 省略・jobId-suffixed branch から導出）

- **WHEN** ハンドラが `{ branch: "feat/my-feature-abcd1234" }` のみで呼ばれる
- **THEN** handler が prefix `feat/` を strip し、さらに jobId suffix `-abcd1234` を strip して `my-feature` を導出し state.request.slug に設定、戻り値が `{ ok: true, branch: "feat/my-feature-abcd1234", slug: "my-feature" }` になる

#### Scenario: 1 回呼び出し（slug 省略・suffix なし branch — 後方互換）

- **WHEN** ハンドラが `{ branch: "feat/readme-status-section" }` のみで呼ばれる（後方互換）
- **THEN** state.branch が `feat/readme-status-section`、handler が prefix `feat/` を strip、jobId suffix strip が no-op、`readme-status-section` を導出し state.request.slug に設定、戻り値が `{ ok: true, branch: "feat/readme-status-section", slug: "readme-status-section" }` になる
