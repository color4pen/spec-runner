# Design: 公開 CLI の体裁 — `--version` と bin パス正規化

## Context

npm 公開（0.3.1）で判明した公開 CLI としての体裁 2 件を扱う。

- `specrunner --version` は registry dispatch に到達して「未知 command」扱いになり、
  `Unknown command: --version` + USAGE を stderr に出して exit 2 で終わる
  （`bin/specrunner.ts` main() は `--help` / `-h` のみを registry lookup 前に特別扱いし、
  未知 command は line 34-38 で stderr + USAGE + exit 2）。
  インストール済みバージョンを確認する手段がない。
- `package.json` の bin 値は `"./dist/specrunner.js"`。npm 11.17 は publish 時に
  `./` prefix を「invalid and removed」として warning を出す（npm 10 では出ない）。
  registry には正規化された bin が残るため実害はないが、publish ログに毎回誤解を招く警告が出る。

配布は tsup の単一 ESM バンドル（`dist/specrunner.js`）。`dist/` と `bin/` はいずれも
package root のちょうど 1 階層下にある。dispatch は `src/cli/command-registry.ts` の
COMMANDS registry 駆動で、version エントリは存在しない。

## Goals / Non-Goals

**Goals**:

- `specrunner --version` が package version を stdout に出力し exit 0 で終わる。
- version 文字列がリポジトリ内ソース実行と npm install 済みバンドル実行の両方で正しく解決される。
- `package.json` の bin 値が `dist/specrunner.js`（`./` なし）になり、publish 警告が消える。

**Non-Goals**:

- `--help` / USAGE の再構成（USAGE への `version` 行追加や、文書化された `version` command の追加はしない）。
- doctor コマンドへの統合。
- `-v` / `-V` 短縮 alias の追加（`-v` は既に `verbose`。version へ転用するのは破壊的変更で対象外）。
- `--version` を command 途中の flag として機能させること（例: `specrunner run --version`）。
  対象は top-level の `specrunner --version` のみで、`--help` / `-h` が top-level でのみ
  特別扱いされるのと同じ扱いとする。

## Decisions

### D1: `--version` は registry エントリではなく `bin/specrunner.ts` main() の top-level intercept で扱う

`--version` は args[0]（command スロット）に入るため、registry に委ねると未知 command になる。
query 風の top-level flag を扱う既存パターンは main() 冒頭の `--help` / `-h` ブロックであり、
これを踏襲する。これにより dispatch モデルを保ったまま、対象外である USAGE への変更を避けられる。

- Rationale: registry に `version` を足すと、USAGE 編集（Non-Goal）が必要になるか、
  未文書化 command を出荷することになり一貫性を欠く。main() 冒頭での intercept が最小かつ既存流儀に沿う。
- Alternatives considered:
  - registry の COMMANDS に `version` command を登録 — 却下。USAGE 編集（Non-Goal）を誘発するか、
    未文書化 command になる。
  - flag-parser に global な `--version` flag を追加 — 却下。flag-parser は dispatch 後に
    command 単位で動くため、`specrunner --version`（args[0] が command スロット）では到達しない。

### D2: version は runtime に「最寄りの先祖 package.json」を読んで解決し、テスト可能な専用 helper に置く

`src/cli/version.ts` に、開始ディレクトリを受け取り、先祖方向へ最寄りの package.json を探索し
その `version` を返す純関数を置く。production 用に import.meta.url から開始ディレクトリを
算出する薄い wrapper を併設する。

- Rationale: npm はインストール済みパッケージに package.json を必ず同梱する。両実行コンテキストとも、
  実行中モジュールのディレクトリの最寄り先祖が正しい package.json になる
  （バンドル: `dist/` → package root、ソース helper `src/cli/` → repo root）。
  最寄り先祖探索はファイルの深さやバンドル有無に依存せず正しいため、リファクタやバンドル/ソース分裂に耐える。
  helper が開始ディレクトリを引数で受け取ることで、両コンテキストを temp ディレクトリで決定的に
  ユニットテストできる。解決元が常に実際の package.json なので version がずれない（single source of truth）。
- Alternatives considered:
  - tsup `define` / JSON inline によるビルド時埋め込み — 却下。define はソース実行時に適用されず
    結局 runtime fallback が要る（runtime 経路を消せず build 結合だけ増える）。JSON inline は version を
    ビルド時に凍結し package.json 全体をバンドルへ取り込む。さらにバンドル解決経路は vitest
    （ソース実行）では発火せず「両コンテキスト」要件のテスト網羅が弱まる。最寄り先祖 helper なら
    `dist/` レイアウトをユニットテストで直接シミュレートできる。
  - 固定の `new URL("../package.json", import.meta.url)` — 却下。解決コードが entry ファイル
    （bin またはバンドル＝root の 1 階層下）に物理的に存在する場合のみ正しい。logic を src/ helper
    （root の 2 階層以上下）へ抽出するとソース実行で壊れる。最寄り先祖探索はこの脆さを除去する。

### D3: `package.json` の bin を `"specrunner": "dist/specrunner.js"` に正規化する

`./` prefix を外す。npm 11.17 は prefix を invalid とみなして除去し warning を出すが、prefix を
外せば解決結果は同一で warning が出ない。bin パスは仕様上 package-root 相対なので prefix は冗長。

- Rationale: warning の trigger を根本除去し、解決挙動は不変。
- Note: `exports` も `"./dist/specrunner.js"` を使うが、`exports` は subpath の key/target として
  `./` prefix が**必須**のため変更しない。正規化対象は `bin` のみ（`exports` から `./` を外すと壊れる）。

## Risks / Trade-offs

- [Risk] import.meta.url 起点の探索が、`dist/` や `src/` 配下に紛れた package.json を誤検出する
  → Mitigation: `dist/` も `src/cli/` も package.json を含まず、最初に見つかる先祖は常にパッケージ自身。
  helper は parse 結果に string の `version` があることを検証してよい。
- [Risk] `--version` を空 arg / registry チェックより前に置くと将来の `version` command を覆う
  → Mitigation: 明示的 Non-Goal。intercept するのは厳密に `--version` トークンのみ。
- [Trade-off] `--version` 実行ごとに 1 回 fs read が発生する
  → version 経路のみで、全 command にはかからないため無視できる。

## Open Questions

- なし。
