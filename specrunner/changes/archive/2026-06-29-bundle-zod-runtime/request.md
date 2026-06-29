# zod を dist にバンドルして実行時の外部解決依存を断つ

## Meta

- **type**: bug-fix
- **slug**: bundle-zod-runtime
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->
<!-- ビルド設定（bundling）と依存区分の調整のみ。port/adapter 追加や設計選択は無いため false -->

## 背景

公開物 `dist/specrunner.js`（tsup バンドル）は zod を external のまま残すため、`import "zod/v4-mini"` が bare import として残り、実行時に **consumer 側の zod install 実体**へ解決を委ねる。この解決が壊れた状態（例: bunx 展開キャッシュの部分破損）になると、Node の ESM resolver が zod の `exports` を `./v4-mini` に当てられずディレクトリ解決へフォールバックし、`ERR_UNSUPPORTED_DIR_IMPORT: zod/v4-mini` で **全コマンドが起動時にクラッシュ**する（実運用で観測済み。キャッシュ purge でのみ復旧する一過性故障）。

zod を dist にバンドル（inline）すれば、実行時に外部の zod を解決しなくなり、この故障クラスを根絶できる。あわせて zod を runtime dependency から外せるため、依存極小（consumer の必須 runtime 依存をゼロ化）にも資する。

## 現状コードの前提

<!-- 書く直前に grep / ファイル確認で再検証する。 -->

- tsup.config.ts — `external: ['@anthropic-ai/sdk', '@anthropic-ai/claude-agent-sdk', '@openai/codex-sdk']` のみ。`noExternal` 指定は無い。tsup の既定で `dependencies` の `zod` は external 扱いとなり、バンドルされない
- package.json `dependencies` — `@anthropic-ai/sdk` と `zod ^4.0.0` の 2 つのみ。`optionalDependencies` は 2 つの SDK（dynamic import 済み）
- package.json には `zod-to-json-schema` / `zod-validation-error` 等、**top-level の zod を実行時に解決する外部パッケージは存在しない**（zod は自コード専用）
- 自コードの zod 参照はすべて静的 subpath import（`zod/v4-mini`, `zod/v4`）であり、main エントリ `from "zod"` の import は src 内に存在しない。例: src/core/step/report-tool.ts:11 / src/config/schema.ts:26 / src/adapter/codex/agent-runner.ts:22
- node_modules の zod は 4.4.3 で `exports` に `./v4-mini` を含む（バンドル時の esbuild 解決は通る）

## 要件

<!-- 実装の最重量部を名指しする。 -->

1. **zod を dist にバンドルする**: tsup.config.ts の `noExternal` に `'zod'` を追加し、zod（`zod/v4-mini` 等の subpath を含む）を `dist/specrunner.js` に inline する
2. **runtime 依存から外す**: package.json の `zod` を `dependencies` から `devDependencies` へ移す。これにより consumer は zod を install しなくなる（バンドル済みのため実行時に不要）
3. **外部 import の残存が無いことを保証する**: ビルド後の `dist/specrunner.js` に zod への bare/外部 import（`from "zod"` / `from "zod/..."` / `require("zod...")`）が残らないこと
4. zod の static/dynamic import がすべてバンドルに取り込まれ、`zod` を `devDependencies` に置いた状態で実行が成立すること（dynamic import の見落としがあれば build/test が落ちて検出される）

## スコープ外

- `@anthropic-ai/sdk` および optionalDependencies（2 SDK）のバンドル方針（external のまま据え置く。SDK は重量・dynamic import 前提）
- zod のメジャー/マイナー更新
- `zod-to-json-schema` 等の新規導入
- バンドルツール（tsup/esbuild）自体の差し替え

## 受け入れ基準

<!-- 機械検証できる文にする。 -->

- [ ] `bun run build` 後、`dist/specrunner.js` に zod への外部 import（`from "zod"` / `from "zod/` / `require("zod`）が含まれないことを検証する（grep で 0 件）
- [ ] `zod` が package.json の `dependencies` に無く、`devDependencies` にあることを確認する
- [ ] node_modules から zod を除いた状態（または zod を `dependencies` から外した公開物相当）で `dist/specrunner.js` が `--help` 等を起動できることを確認する（外部 zod 解決に依存しない）
- [ ] 既存テスト無変更で `bun test` green、`typecheck` green、`bun run build` 成功

## architect 評価済みの設計判断

<!-- 採用した判断＋却下した代替案とその理由。 -->

1. **採用: zod を `noExternal` でバンドル＋`devDependencies` 化** — 故障の根は「実行時に consumer の zod を解決すること」。バンドルすれば解決自体が消える。zod は自コードの静的 subpath import 専用で、top-level zod を実行時に要する外部 sub-dep が無いと確認済みのため、`devDependencies` 化は安全。依存極小の方針にも合致する。
2. **却下: zod のバージョン pin（`4.4.3` 固定）のみで対処** — consumer 側の install 破損（キャッシュ部分展開）には効かない。pin はバージョン不一致を防ぐだけで、`exports` 解決失敗の故障クラスを消せない。
3. **却下: `zod/v4-mini` を `zod/mini` 等の別 subpath へ書き換え** — 入口の import 文を変えても external のままなら解決の脆弱性は残る。バンドル化が本質的対処。
4. **据え置き: SDK 群は external のまま** — 重量が大きく dynamic import 前提（optionalDependencies 化済み）。バンドル対象に含めない。
