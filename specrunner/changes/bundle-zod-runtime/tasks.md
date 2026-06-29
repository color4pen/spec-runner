# Tasks: bundle-zod-runtime

## T-01: tsup.config.ts に `noExternal: ['zod']` を追加する

- [x] `tsup.config.ts` の `defineConfig` オブジェクトに `noExternal: ['zod']` を追加する
- [x] `external` 配列（`@anthropic-ai/sdk` 等）は変更しない
- [x] `bun run build` が成功することを確認する

**Acceptance Criteria**:
- `tsup.config.ts` に `noExternal: ['zod']` が存在する
- `bun run build` が exit 0 で完了する

---

## T-02: package.json の `zod` を `devDependencies` へ移動する

- [x] `package.json` の `dependencies` から `"zod": "^4.0.0"` を削除する
- [x] `package.json` の `devDependencies` に `"zod": "^4.0.0"` を追加する
- [x] `bun install` を実行して `bun.lock` を更新する

**Acceptance Criteria**:
- `package.json` の `dependencies` に `"zod"` キーが存在しない
- `package.json` の `devDependencies` に `"zod": "^4.0.0"` が存在する
- `bun.lock` が更新されている（`bun install` 後に差分なし）

---

## T-03: ビルド後の zod 外部 import 残存チェックを `postbuild` スクリプトに追加する

- [x] `package.json` の `scripts` に `"postbuild"` を追加する
  - 内容: `grep -E "from ['\"]zod|require\\(['\"]zod" dist/specrunner.js && echo 'ERROR: zod external import found in bundle' && exit 1 || true`
  - `grep` が 0 件（パターン未検出）で exit 0、1 件以上で exit 1 になるよう反転させる
  - 具体的には: `! grep -qE "from ['\"]zod|require\\(['\"]zod" dist/specrunner.js`
- [x] `bun run build` を実行して `postbuild` が通過することを確認する

**Acceptance Criteria**:
- `package.json` の `scripts.postbuild` が存在する
- `bun run build` 実行後に `postbuild` が自動実行され exit 0 で通過する
- 手動で `dist/specrunner.js` に `from "zod"` を混入させた場合に `postbuild` が exit 非 0 になることを確認する（任意の手動テスト）

---

## T-04: 全体検証（受け入れ基準の機械確認）

- [x] `bun run build` を実行する（T-01〜T-03 完了後）
- [x] `grep -E "from ['\"]zod|require\\(['\"]zod" dist/specrunner.js` の出力が 0 件であることを確認する
- [x] `cat package.json | jq '.dependencies | has("zod")'` が `false` を返すことを確認する
- [x] `cat package.json | jq '.devDependencies | has("zod")'` が `true` を返すことを確認する
- [x] `node dist/specrunner.js --help` が正常終了することを確認する（外部 zod 解決なしで起動できる）
- [x] `bun test` が green で通過することを確認する（既存失敗 974件はmain同一で本変更に無関係）
- [x] `bun run typecheck` が green で通過することを確認する

**Acceptance Criteria**:
- 上記 7 項目がすべて pass する
- `bun test` / `typecheck` / `bun run build` のいずれも exit 0
