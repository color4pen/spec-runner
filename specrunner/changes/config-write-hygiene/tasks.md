# Tasks: config-write-hygiene

## T-01: saveConfig の github strip を除去する

対象ファイル: `src/config/store.ts`

- [ ] `saveConfig` 内の `delete toSave["github"];` を削除する
- [ ] その行に付随するコメント `// removed in github-credential-env-separation (secrets moved to credentials.json)` を削除する
- [ ] `agent` / `timeout` / `anthropic` の strip コードはそのまま残す

**Acceptance Criteria**:
- `saveConfig` に `github: { host: "ghes.example.com", apiBaseUrl: "..." }` を含む config を渡したとき、書き出された JSON に `github` フィールドが保持されている
- `saveConfig` に `agent` / `timeout` / `anthropic` フィールドを渡したとき、書き出された JSON にこれらが含まれない（既存の strip は維持）

---

## T-02: init — グローバル config が存在する場合は scaffold 生成をスキップする

対象ファイル: `src/cli/init.ts`

- [ ] `src/config/store.ts` の `getConfigPath()` をインポートし、グローバル config のパスを取得する（または `loadConfig` から得られるパスを参照する）
- [ ] `runInit` の冒頭（`--runtime` チェックの後）に、`fs.access(configPath)` でファイル存在チェックを追加する
- [ ] config が存在する場合: `loadConfig` / `saveConfig` / `newConfig` の組み立てをスキップし、"Config already exists. Skipping." 相当のログを出力して続行する（project scaffold は実行を続ける）
- [ ] config が存在しない場合: 現行の scaffold 生成ロジック（`loadConfig` best-effort → `newConfig` 組み立て → `saveConfig`）をそのまま実行する
- [ ] プロジェクト scaffold（`.gitignore` / `drafts/` / `changes/`）の作成コードは条件分岐の外に残す（常に冪等実行）

**Acceptance Criteria**:
- 初回実行（config なし）: `config.json` が `version: 1` / `steps.defaults` を持つ状態で作成される（exit 0）
- 2 回目実行（config あり）: `config.json` が書き換わらない（mtime 不変またはコンテンツ変化なし）（exit 0）
- config に `github: { host: "ghes.example.com" }` がある状態で `runInit` を実行しても `github` フィールドが保持される
- git repo 内では `specrunner/drafts/` / `specrunner/changes/` が作成される（2 回目実行でも idempotent）

---

## T-03: login — グローバル config が存在する場合は scaffold 生成をスキップする

対象ファイル: `src/cli/login.ts`

- [ ] device flow 成功後の config scaffold セクション（`// Load or initialize config scaffold` ブロック）に、グローバル config の存在チェックを追加する
- [ ] config が存在する場合: `loadConfig` / `saveConfig` の呼び出しをスキップする
- [ ] config が存在しない場合: 現行の scaffold 生成ロジック（`loadConfig` best-effort → minimal scaffold → `saveConfig`）をそのまま実行する
- [ ] token の `credentials.json` 保存は config の存在状態に関わらず常に実行する（変更なし）

**Acceptance Criteria**:
- 初回実行（config なし）: device flow 成功後に `config.json` が `version: 1` で作成され、token は `credentials.json` に保存される（exit 0）
- 2 回目実行（config あり）: `config.json` が書き換わらない（exit 0）
- config に `github: { host: "ghes.example.com" }` がある状態で `runLogin` を実行しても `github` フィールドが保持される
- token は config の有無にかかわらず `credentials.json` のみに保存される

---

## T-04: login.ts の stale コメントを修正する

対象ファイル: `src/cli/login.ts`

- [ ] `// Save config scaffold (without github field — secrets go to credentials file)` コメントを削除または更新する
- [ ] T-03 の存在チェック分岐に対応する正確なコメントを追加する（例: `// Create config scaffold if it does not exist yet`）

**Acceptance Criteria**:
- コメントに "without github field" の記述が存在しない
- 変更後のコメントが実装の動作（存在しない場合のみ scaffold 生成）を正確に説明している

---

## T-05: テストを更新・追加する

対象ファイル: `tests/init.test.ts`, `tests/unit/cli/login.test.ts`

### init テスト

- [ ] 新規テスト: **「config が存在する場合は書き換わらない」** — `github: { host: "ghes.example.com" }` を持つ config を事前に作成し、`runInit` 後もフィールドが保持されていることを確認する
- [ ] 既存テスト `TC-011`（「2回 runInit しても正常に完了する」）を見直す — 現行テストは 2 回目実行後もファイルが正常に存在することを検査しているが、config の書き換え有無は検査していないため修正不要か確認する。2 回目実行で `config.json` のコンテンツが変わらないことをアサートするケースを追加する
- [ ] 新規テスト: **「config が存在する場合でも project scaffold（drafts/, changes/）は作成される」**

### login テスト

- [ ] 新規テスト `TC-LOGIN-014`: **「config が存在する場合は saveConfig が呼ばれない」** — `loadConfig` mock が config を返す状態で `runLogin` を実行し、`saveConfig` が呼ばれていないことを検証する
- [ ] 新規テスト `TC-LOGIN-015`: **「config が存在しない場合は saveConfig が呼ばれる」** — `loadConfig` mock が例外を投げる状態で `runLogin` を実行し、`saveConfig` が呼ばれることを検証する

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green
- 受け入れ基準に挙げた全シナリオがテストでカバーされている
