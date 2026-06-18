# config 書き込み経路がグローバル config を不必要に書き換える + stale strip が GHES host 設定を消す

## Meta

- **type**: bug-fix
- **slug**: config-write-hygiene
- **base-branch**: main
- **adr**: false

## 背景

`saveConfig` はグローバル config（`~/.config/specrunner/config.json`）の唯一の writer。この関数が #248 (2026-05-16) で追加した `delete toSave["github"]` は、当時 `github` フィールドが secret（token）を保持していたため正しかった。しかし #502 (2026-06-02) で `github` は `GitHubHostConfig`（host / apiBaseUrl、非 secret、B-10 の host↔token 束縛）に転用され、strip 側は追随しなかった。

加えて、`init` と `login` はグローバル config が既に存在していても load→save の round-trip を行い、`saveConfig` の strip を毎回適用する。

## 現状コードの前提

- `src/config/store.ts:213` — `delete toSave["github"]` が無条件で GHES host 設定を消す。コメントは `// removed in github-credential-env-separation (secrets moved to credentials.json)` のまま stale
- `src/cli/init.ts:34-61` — グローバル config が存在しても `loadConfig()` → merge → `saveConfig()` で round-trip する
- `src/cli/login.ts:77-87` — token は `credentials.json` に保存するのに、config も `loadConfig()` → `saveConfig()` で round-trip する（config が無い場合の scaffold 生成が目的だが、ある場合も走る）
- `src/cli/init.ts:58-59` — `delete runtime` / `delete anthropic` で `runtime: "managed"` 設定も消える
- `src/config/store.ts:226` — `saveProjectConfig` は存在するが呼び出し元がゼロ

## 要件

1. `saveConfig` の `github` strip を除去する（`agent` / `timeout` / `anthropic` は旧 schema で現行に対応物が無いため strip は正当。`github` だけ stale）
2. `init` — グローバル config が既に存在する場合は書き換えない。存在しない場合のみ scaffold を生成する。プロジェクト scaffold（`.gitignore` / ディレクトリ）は常に冪等で実行
3. `login` — グローバル config が既に存在する場合は書き換えない。存在しない場合のみ scaffold を生成する
4. `login.ts:86` の stale コメント `// Save config scaffold (without github field — secrets go to credentials file)` を修正

## スコープ外

- `managed setup` / `managed reset` の save は managed 固有フィールドの永続化が目的であり正当。変更しない
- `saveProjectConfig` の活用（CLI から project-local config を書き出す経路の追加）は別 issue
- `init` の `delete runtime` は要件2（config が存在すれば触らない）で解消されるため個別修正しない

## 受け入れ基準

- [ ] GHES host 設定（`github: { host, apiBaseUrl }`）がグローバル config にある状態で `init` / `login` を実行しても消えない
- [ ] グローバル config が存在する状態で `init` を実行してもファイルが書き換わらない
- [ ] グローバル config が存在する状態で `login` を実行しても config ファイルが書き換わらない（token は `credentials.json` のみ）
- [ ] グローバル config が存在しない状態で `init` / `login` を実行すると scaffold が生成される
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **`init` / `login` を「config が無ければ作る、あれば触らない」にする**: round-trip を止めるだけで strip 副作用も init の `delete runtime` も解消される。config の migration や正規化は `loadConfig`（read 側）が担うので、write 時の strip と二重になっている必要がない
- **却下: saveConfig の strip を全廃する**: `agent` / `timeout` / `anthropic` の strip は旧 schema のフィールドが永続化されないための防御であり正当。`github` だけが転用後に追随していない