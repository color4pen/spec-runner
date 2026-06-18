# Design: config-write-hygiene

## Context

`saveConfig` は `~/.config/specrunner/config.json` への唯一の writer。
PR #248 で追加した `delete toSave["github"]` は、当時 `github` フィールドが OAuth token を保持していたため正当だった。
PR #502 で `github` は `GitHubHostConfig`（`host` / `apiBaseUrl`）に転用されたが、strip は追随しなかった。

結果として:

1. **GHES host 設定の消失**: `saveConfig` を呼ぶたびに `github` フィールドが削除される。
2. **不要な round-trip**: `init` と `login` はグローバル config が存在する場合でも load→save を行うため、strip が毎回適用される。
3. **stale コメント**: `login.ts:86` のコメントが旧 token-in-config の文脈のままで残存。

`init.ts:58-59` の `delete runtime` / `delete anthropic` は、要件2（config が存在すれば触らない）で副作用ごと解消されるため個別修正しない。

## Goals / Non-Goals

**Goals**:
- `saveConfig` から `github` フィールドの strip を除去する
- `init` / `login` を「グローバル config が存在しない場合のみ scaffold を生成する」に変更し、round-trip を停止する
- stale コメントを修正する

**Non-Goals**:
- `managed setup` / `managed reset` の save ロジックは変更しない（managed 固有フィールドの永続化が目的であり正当）
- `saveProjectConfig` の活用（プロジェクト local config の書き出し経路追加）は別 issue
- `saveConfig` の `agent` / `timeout` / `anthropic` strip は正当なため維持する（旧 schema フィールドの防御的 strip）

## Decisions

### D1: `saveConfig` の `github` strip を除去する

`delete toSave["github"]` を削除し、隣接コメントも除去する。

**Rationale**: `github` フィールドは #502 以降 `GitHubHostConfig`（非 secret）を保持している。secret（token）は `credentials.json` に移動済みであり、config 側には保存を防ぐ理由がない。`agent` / `timeout` / `anthropic` は旧 schema のフィールドであり strip が正当であるが、`github` は転用後に追随が漏れた点が異なる。

**Alternatives considered**:
- `saveConfig` の strip を全廃する: `agent` / `timeout` / `anthropic` の strip は旧 schema 防御として正当なため却下（request.md に architect 評価済み）。

### D2: `init` — config 存在チェックを追加し、存在する場合は scaffold 生成をスキップする

グローバル config ファイルの存在を `fs.access` で確認し、存在する場合は `loadConfig` / `saveConfig` の round-trip を行わない。プロジェクト scaffold（`.gitignore` / ディレクトリ作成）は常に冪等で実行を継続する。

**Rationale**: round-trip を止めることで strip 副作用（`github` 消去、`runtime` 消去）が根本から解消される。config の migration や正規化は `loadConfig`（read 側）の責務であり、write 側での strip と二重になる必要がない。存在しない初回のみ scaffold を生成する「create-only」セマンティクスが適切。

**Alternatives considered**:
- 既存 config をロードして必要フィールドのみ上書きする: `init` の責務（scaffold 生成）を超えた merge ロジックになる。存在チェックで十分。

### D3: `login` — config 存在チェックを追加し、存在する場合は scaffold 生成をスキップする

グローバル config ファイルの存在を確認し、存在する場合は config の load/save を行わない。token は引き続き `credentials.json` のみに保存する。

**Rationale**: `login` が config を書く唯一の目的は「config.json が存在しない場合の scaffold 生成」。存在チェックでこれを制御できる。

**Alternatives considered**:
- `saveConfig` 呼び出し自体を削除する: config が存在しない場合の scaffold 生成の目的が失われる。

### D4: `login.ts:86` の stale コメントを修正する

`// Save config scaffold (without github field — secrets go to credentials file)` を、現在の動作を正確に表すコメントへ置き換える。

**Rationale**: コメントが `github` の strip を前提とした旧実装の文脈を引きずっており、読者に誤解を与える。D3 の変更後はコメントも整合させる。

## Risks / Trade-offs

- [Risk] D2/D3 の変更後、`init` / `login` を再実行しても既存 config が上書きされなくなる。これはバグ修正の意図通りだが、config を意図的に再生成したいユーザーは手動削除が必要になる。→ 冪等性の観点では従来の「毎回書き換える」挙動がむしろ問題であり、breaking change ではなくバグ修正と見なせる。
- [Risk] 既存テスト `TC-011`（「2回 runInit しても正常」）は config の書き換えを検査しており、変更後の「2回目は書かない」挙動と乖離する可能性がある。→ テストを精査・更新する（tasks.md T-04 参照）。

## Open Questions

なし（architect 評価済みの設計判断で方針確定）。
