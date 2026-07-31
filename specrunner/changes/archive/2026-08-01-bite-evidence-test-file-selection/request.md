# bite-evidence のテストファイル選別 — 非テストファイルの誤実行と誤 tamper 判定を解消する

## Meta

- **type**: spec-change
- **slug**: bite-evidence-test-file-selection
- **base-branch**: main
- **adr**: true

## 背景

bite-evidence gate は forward type（bug-fix / new-feature）の job で、test-materialize コミット（base OID）のテストが「実装前 red → 実装後 green」になることを隔離 worktree で実測し、hollow test を検出する。

現状、「materialize されたテストファイル」の選別が pipeline artifact の除外のみで、**テストファイルかどうかの判定が存在しない**。test-materialize コミットに含まれた fixture JSON・package.json・実装補助ファイル（index.ts 等）・別言語ファイル（.rs 等）まで 1 ファイルずつテスト runner で実行され、base でも candidate でも red → 「red→red = hollow」と誤判定して gate が failed になる。実測ゲートのため resume を繰り返しても決定的に同じ結果となり、job が回復不能になる。0.4.7 利用プロジェクト（TypeScript + Rust 構成）で実際に発生した。

同じ選別述語は archive の floor 判定（achieved-assurance）の列挙にも共用されており、materialize コミットに実装ファイルが混ざった場合、実装フェーズの正当な編集が blob freeze 検査で「tamper」と誤検出され assurance が absent になる。

## 現状コードの前提

- `src/core/step/bite-evidence/gate.ts:154-157` — 選別は `changedFilesResult.files.filter((f) => !isExcludedPath(f))` のみ。`isExcludedPath`（同 :36-38）は `specrunner/changes/` と `.specrunner/` の除外だけで、テストファイル判定を持たない
- `src/core/step/bite-evidence/gate.ts:13` — doc comment は「no test files → strategy-deferred」と記すが、実装 :159-165 は空集合を **failed** で返す（:76 の comment は failed と記す。doc 内でも矛盾）
- `src/core/runtime/local.ts:1032` — `runTestsAtCommit` はファイル単位実行: scopedTestCommand 設定時は `sh -c '<cmd> <file>'`（:1064 付近）、未設定かつ custom commands 無しの default 経路は `bun test <file>`（:1114 付近）。custom commands ありで scopedTestCommand 無しは unavailable
- `src/core/archive/achieved-assurance.ts:265` — floor 判定の列挙も `!isExcludedPath(f)` のみの同一 filter。この集合が blob freeze 検査（:92-94、`diffPathsBetweenCommits(baseOid, finalHeadOid, materializedTestFiles)`）の対象になる
- `src/config/schema/types.ts` — `verification.scopedTestCommand` は既存。テストファイルパターンの設定は存在しない

## 要件

1. **テストファイル選別述語を導入する**。設定 `verification.scopedTestPatterns?: string[]`（glob）を追加し、未設定時の default は `["**/*.test.*", "**/*.spec.*", "**/*_test.*"]` とする。glob 照合は**新規依存を追加せず**簡易実装する（`**/` prefix と `*` の suffix/中間一致で足りる範囲。フル glob 仕様の再実装はしない）
2. **bite-evidence gate の選別に適用する**。materializedTestFiles = 「artifact 除外」AND「テストファイルパターン一致」。fixture・設定ファイル・実装ファイル・パターン不一致の別言語ファイルは per-file 実行の対象にしない
3. **選別後の空集合は failed でなく strategy-deferred にする**。「計測できない」（対象テストが無い）と「計測して噛まなかった」（red→red）は別の結末である。gate.ts:13 の doc と実装の乖離をこの向きで解消し、:76 の comment も追随させる。failed は実測で bite 不成立の場合のみとする。deferred を archive で許容するか否かは既存の `minimumAssurance.biteEvidence` floor が引き続き決める（floor の意味は変えない）
4. **achieved-assurance の列挙にも同一述語を適用する**。blob freeze / tamper 検査の対象がテストファイルのみになり、materialize コミット内の非テストファイルへの実装フェーズ編集が tamper 誤検出にならない。選別述語は gate と floor で単一実装を共有する（二重定義を残さない）
5. **config validation と docs を追随させる**。`scopedTestPatterns` は非空文字列の配列のみ許容（違反は CONFIG_INVALID）。`docs/configuration.md` に既定値・用途（scopedTestCommand と対で per-file bite 実行の対象を定める）を記載する

## スコープ外

- polyglot の複数 runner 対応（cargo 等、言語別の per-file 実行）— パターン不一致ファイルを対象外にするまでが本 request。別言語テストの bite 実測は将来 request
- test-materialize の prompt / 出力契約の変更（materialize 側にテストファイル宣言をさせる案は不採用。下記設計判断参照）
- `minimumAssurance` floor の意味・水準の変更
- `runTestsAtCommit` の実行方式（worktree 隔離・per-file 実行）の変更

## 受け入れ基準

- [ ] 選別述語の単体テスト: fixture JSON / package.json / `.rs` / 実装 `index.ts` が対象外になり、`*.test.ts` / `*.spec.ts` / `*_test.ts` が対象になることをテストで固定する。`scopedTestPatterns` 設定時は設定が default を置換することを固定する
- [ ] gate の verdict テスト: 選別後空集合 → **strategy-deferred**（failed でない）、実測 red→green → passed、実測 red→red → failed、をテストで固定する
- [ ] floor 側テスト: materialize コミットに非テストファイルが含まれ、それが finalHead までに編集されていても tamper 判定にならない（テストファイルの編集は従来どおり tamper になる）ことをテストで固定する
- [ ] 選別述語が gate と achieved-assurance で単一実装を共有していることを import 構造で保証する
- [ ] config validation: `scopedTestPatterns: []` および非文字列要素が CONFIG_INVALID になることをテストで固定する
- [ ] 新規 runtime 依存（glob ライブラリ等）が package.json に追加されていない
- [ ] 既存テストは無変更で green（gate.ts:163 の従来挙動「空集合 = failed」を固定していたテストの期待値変更のみ許容し、変更理由を要件 3 に帰属させる）
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: 選別の所在は「runner と対の config 宣言 + 安全な default」。per-file 実行できるファイルの形は scopedTestCommand（runner）側の性質であり、repo が宣言するのが正しい置き場。default により zero-config の JS/TS repo は設定不要
- **採用**: 空集合 = strategy-deferred。「計測不能」と「計測して不成立」を DU で区別する既存設計（strategy-deferred の存在理由）に整合し、doc comment :13 とも一致する。deferred の許容判断は floor に委譲済み
- **却下**: test-materialize にテストファイル一覧を宣言させ gate が消費する案 — agent の自己申告が gate の入力になり、宣言を絞れば検査を素通りできる fail-open を作る。機械導出（パターン照合)より信頼できない
- **却下**: パターンのハードコードのみ（config なし）— 命名規約は repo ごとに異なり、polyglot・非標準規約の repo で再発する
- **却下**: glob ライブラリ（picomatch 等）の追加 — 依存極小の方針に反する。必要な照合は限定的で簡易実装で足りる
