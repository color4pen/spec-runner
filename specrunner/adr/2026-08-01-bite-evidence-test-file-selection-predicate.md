# bite-evidence テストファイル選別述語の導入 — 非テストファイルの誤実行・誤 tamper 判定の解消

## Status

Accepted (2026-08-01)

## Context

bite-evidence gate は forward type（bug-fix / new-feature）の job で、test-materialize コミット（base OID）のテストが「実装前 red → 実装後 green」になることを隔離 worktree で実測し、hollow test を検出する。archive の floor 判定（`achieved-assurance`）も同じ集合を用いて、materialize されたテストファイルの blob freeze（tamper 検査）と base-red / HEAD-green チェックを行う。

### 発覚した欠陥

「materialize されたテストファイル」の選別が pipeline artifact の除外のみで、**テストファイルかどうかの判定が存在しなかった**。

- **Gate 側 (`gate.ts:154-157`)**: `changedFilesResult.files.filter((f) => !isExcludedPath(f))` のみ。fixture JSON・package.json・実装補助ファイル（`index.ts`）・別言語ファイル（`.rs`）まで per-file で test runner に渡される。これらは base でも candidate でも非ゼロ終了 → `red → red` → gate は **`failed`**（hollow test 判定）。実測ゲートのため resume を繰り返しても決定的に同じ結果 — job が回復不能になる。0.4.7 利用プロジェクト（TypeScript + Rust 構成）で実際に発生。
- **Floor 側 (`achieved-assurance.ts:265`)**: 同一 `!isExcludedPath(f)` filter を共用。materialize コミットに実装ファイルが混入していた場合、実装フェーズの正当な編集が blob freeze diff に引っかかり **tamper** と誤検出 → `biteEvidence` / `testDerivation` が absent。
- **doc/impl 乖離**: `gate.ts:13` の doc comment はすでに「no test files → `strategy-deferred`」と正しく記述していたが、実装 (`gate.ts:159-165`) は空集合を `failed` で返していた（`:76` コメントも `failed` と記述）。

### 解決の方向

単一のテストファイル選別述語（「artifact 除外 AND テストパターン一致」）を導入し、gate と floor の両方に共用させる。これにより:

1. 非テストファイルが per-file 実行の対象にならない
2. 空集合は `failed` ではなく `strategy-deferred` になる（「計測不能」と「計測して不成立」を区別）
3. テストでない materialize ファイルへの実装フェーズ編集が tamper と誤検出されない

## Decision

### D1: 選別の所在は「runner と対の config 宣言 + 安全な default」

`verification.scopedTestPatterns?: string[]`（glob 配列）を `scopedTestCommand` に隣接して追加する。未設定時の default は `["**/*.test.*", "**/*.spec.*", "**/*_test.*"]`。これにより zero-config の JS/TS repo は設定不要で動作し、非標準命名規約や polyglot の repo は `scopedTestPatterns` で override できる。

**採用理由**: per-file 実行できるファイルの形は runner（`scopedTestCommand`）側の性質であり、repo が宣言する置き場として適切。設定値は config load 時に機械的に検証されるため、agent が実行中に宣言を操作して gate を迂回する fail-open が生まれない。

**却下案**:
- *test-materialize が選択済みファイル一覧を宣言して gate が消費する* — agent の自己申告が gate の入力になる。宣言を絞れば検査を素通りできる fail-open を生む。機械導出より信頼できない。
- *パターンをハードコードして config 不要にする* — 命名規約は repo ごとに異なる。polyglot・非標準規約の repo で同じ欠陥が再発する。

### D2: 選別述語は単一の leaf モジュールで実装し、両消費者が import する

`src/core/step/bite-evidence/test-file-selection.ts` を新規作成し、関数 `selectMaterializedTestFiles(files, config)` を export する。`gate.ts` と `achieved-assurance.ts` の両方がこのモジュールを import する。`isExcludedPath` の定義をこのモジュールへ移し、`gate.ts` は後方互換のために re-export のみ行う。`FORWARD_TYPES` は gate に固有の策略関心事であるため `gate.ts` に残す。

**採用理由**: 単一 import が「gate と floor が同一集合を選ぶ」という受け入れ基準の strongest な形での保証。leaf モジュールにすることで `gate.ts` との循環依存を避けられる。

**却下案**:
- *述語を `gate.ts` に定義し、achieved-assurance が `gate.ts` から import する* — gate が述語を定義しつつ述語が gate を import する循環が起きる。leaf モジュールで回避できる。
- *両ファイルに述語を重複実装する* — 欠陥の原因が「二箇所のフィルタが偶然一致」であったのと同型の問題を残す。

### D3: glob 照合は bounded regex 変換で実装し、新規 runtime 依存を追加しない

`matchesGlob(path, pattern)` 関数が glob パターンを `RegExp` に変換して照合する。変換規則:

- `**/` → `(?:.*/)?`（先頭の任意ディレクトリセグメント）
- `**`（`/` なし）→ `.*`（`/` を越える）
- `*` → `[^/]*`（単一セグメント内）
- `.` → `[._]`（ドット記法とアンダースコア記法の両方をカバー。例: `*.test.*` は `foo.test.ts` / `foo_test_ts` にもマッチ）
- その他文字 → regex エスケープ（リテラル）
- パターン全体を `^…$` でアンカー

**採用理由**: 本 request が必要とする照合（`**/` prefix・`*` 中間一致）を完全かつテスト可能な形で実装できる。フル glob 仕様の再実装にはならない。依存極小の North Star に従い runtime dependency を追加しない。

**却下案**:
- *picomatch / minimatch を追加する* — 依存極小の方針に反する。必要な照合範囲は限定的で自前実装で足りる。
- *`endsWith` のみの接尾辞チェック* — `**/*_test.*`（basename 接尾辞 + 任意拡張子）やディレクトリスコープ付きカスタムパターンを表現できない。

### D4: 選別後の空集合は `failed` でなく `strategy-deferred` にする

選別結果が空集合（テストファイルが存在しない）の場合、gate は `strategy-deferred` を返す。`failed` は実測で bite 不成立（`red→red`）または tamper mismatch の場合のみとする。`gate.ts:13` の doc comment が正典であり、実装をその向きに修正する。`strategy-deferred` をアーカイブで許容するか否かは既存の `minimumAssurance.biteEvidence` floor が引き続き決める。

**採用理由**: pipeline の routing では `strategy-deferred → verification`（pass-through）、`failed → escalation` となっており、空集合 = `failed` は polyglot job を決定的な回復不能状態に追い込む。「計測できない」と「計測して不成立」は DU（Distinction Under Study）として区別すべき別の事象であり、`strategy-deferred` の存在理由と整合する。

**却下案**:
- *空集合を引き続き `failed` にする* — 「測定可能なテストがない」と「測定して hollow だった」を同一の verdict にし、polyglot repo では仕様上回復不能な dead-end を作る。

### D5: floor の tamper 検査スコープもテストファイルのみに絞る

`achieved-assurance.ts:265` のフィルタを `selectMaterializedTestFiles` に置き換える。blob freeze diff の対象集合がテストファイルのみになるため、materialize コミット内の非テストファイルへの実装フェーズ編集が tamper と見なされなくなる。テストファイルの編集は従来どおり tamper として検出される。

**採用理由**: D2 の共有述語の直接的帰結として、floor 側特有の追加ロジックなしに正しい動作になる。

### D6: `scopedTestPatterns` の validation は非空配列 + 非空文字列要素で行う

zod schema で `optional(array(nonEmptyString(...)).check(minLength(1, ...)))` とする。空配列（`[]`）は `minLength(1)` で、非文字列要素は `nonEmptyString` で、それぞれ `CONFIG_INVALID` に変換する。

**採用理由**: `coverage.include` で既に使われている同パターンに準拠し一貫性を保つ。`[]` を通すと「何にもマッチしない」という実行時の無音サプライズになるため、config load 時に失敗させる。

## Alternatives Considered

### Alternative 1: test-materialize が選択済みテストファイル一覧を宣言し、gate が消費する

test-materialize ステップの出力に「これがテストファイルです」というファイルリストを追加し、gate がその一覧を信頼して per-file 実行する。

- **Pros**: materialize ステップが自身の出力を最もよく知っているので宣言の置き場として直感的。gate 側でのパターン照合実装が不要になる
- **Cons**: agent の自己申告が gate 自体の入力になる fail-open 構造を生む。宣言リストを意図的または誤って絞れば hollow test が検査を素通りできる。gate の目的（hollow test の独立実測）と矛盾する
- **Why not**: 機械導出（パターン照合）は agent が実行中に変更できない。宣言方式は gate の独立性を根本から崩す

### Alternative 2: テストファイルパターンをハードコードして設定を不要にする

`["**/*.test.*", "**/*.spec.*", "**/*_test.*"]` をコードに直書きし、`verification.scopedTestPatterns` 設定を追加しない。

- **Pros**: 設定 API が増えない。zero-config repo では動作する
- **Cons**: 命名規約は repo ごとに異なる。非標準命名（例: `__tests__/*.ts` の単一 `*.ts`）や polyglot（例: Go の `*_test.go` を JS runner で実行したくない等）で同じ欠陥が再発する。escape hatch がない
- **Why not**: `scopedTestCommand` と対に置くことで「per-file runner で実行できるファイルの形」という知識が一箇所に集まる。zero-config は safe default で実現できるため API コスト対効果が高い

### Alternative 3: picomatch / minimatch を追加して glob 照合を委譲する

npm の glob ライブラリを runtime 依存として追加し、フル glob セマンティクスを利用する。

- **Pros**: brace expansion・`?`・文字クラス等の完全な glob 仕様をカバーできる。実装コストが低く、エッジケースを自前でテストしなくてよい
- **Cons**: 依存極小（install してすぐ使える）の North Star に反する。必要な照合は `**/` prefix と `*` の単純組み合わせに限定されており、フル仕様が必要な根拠がない
- **Why not**: bounded regex 変換で必要な照合を完全に実装できる。依存を増やすコストに見合わない

### Alternative 4: 空集合 verdict を `failed` のまま維持する

テストファイルが0件の場合も引き続き `failed` を返し、既存の routing を変えない。

- **Pros**: 既存の routing 変更を避けられる。「テスト無し = 問題あり」という保守的な立場
- **Cons**: `strategy-deferred` の存在理由（「計測不能」と「計測して不成立」を DU で区別する）と矛盾する。polyglot job では別言語テストのみがある場合に `failed → escalation` routing で決定的に回復不能になる。`gate.ts:13` の doc comment と実装が引き続き乖離する
- **Why not**: `gate.ts:13` の doc comment が正典であり、実装をその向きに揃えるのが正しい修正方向。deferred の許容判断は既存の `minimumAssurance.biteEvidence` floor に委譲済みであり、floor の意味は変えない

### Alternative 5: `isExcludedPath` を `utils/` 等の共通モジュールへ移す

`isExcludedPath` を bite-evidence 外の共通ホームに置き、gate と achieved-assurance が共通モジュールから import する構造。

- **Pros**: 述語の置き場が bite-evidence 固有でなくなり、将来の横断利用がしやすくなる
- **Cons**: `test-file-selection.ts` の実体は `isExcludedPath` + パターン照合の AND 合成であり、分割すると呼び出し側で合成が必要になる。`isExcludedPath` の消費者は現状 gate と achieved-assurance の2箇所のみで横断利用の実績がない
- **Why not**: `test-file-selection.ts` を bite-evidence 配下に置くことで「bite-evidence の選別ロジック」という関心の所在が明確になる。共通化の必要が生じたときに移設すれば足りる

### Alternative 6: `runTestsAtCommit` の内部でファイルをスキップする

実行側（runner）でテストでないファイルを実行前にスキップする制御を追加する。

- **Pros**: gate 側の変更が最小限になる
- **Cons**: 選別の責任が runner 側にあると、floor の tamper 検査は別途独立に修正が必要になる。二箇所を独立に修正すると「偶然一致」という元の欠陥の型を再現する
- **Why not**: 選別は「何を扱うか」という問いへの答えであり、実行側でなく列挙側に置くのが意味的に正しい。D2 の共有述語がこの責任を一箇所に集約する

## Consequences

### Positive

- TypeScript + Rust 構成等の polyglot repo で test-materialize コミットに非テストファイルが混入しても、bite-evidence gate が decision 不能状態（回復不能 failed）に落ちなくなる
- `scopedTestPatterns` 設定により非標準命名規約の repo も zero-config 以外の選択肢を持てる
- gate と floor で同一集合を選ぶ構造的保証（import が単一ソース）が生まれる
- doc comment（`gate.ts:13`）と実装の乖離が解消され、`strategy-deferred` の分類が実際の routing に反映される
- 新規 runtime 依存なし（minimal-deps North Star を維持）

### Negative / Trade-offs

- `matchesGlob` の `.` → `[._]` 変換は「ドットはリテラル」という直感と異なる。意図はドット記法とアンダースコア記法の両方をカバーすることだが、`.` がリテラルではないことを把握せずにパターンを書くと意図と異なる範囲にマッチする可能性がある（例: `**/*.test.*` は `foo_test_ts` にもマッチする）
- 空集合 = `strategy-deferred` への変更は、「base commit にテストファイルが存在しない job」の verdict を変える。旧動作（`failed`）に依存していたテストの期待値変更が必要（本 change で対応済み、理由は D4 に帰属）

### Known Gaps / Future Work

- polyglot の複数 runner 対応（cargo 等、言語別の per-file 実行）はスコープ外。パターン不一致ファイルを対象外にするまでが本 change であり、別言語テストの bite 実測は将来 request
- `matchesGlob` は brace expansion・`?`・文字クラスをサポートしない。これらを必要とする repo は `scopedTestPatterns` を設定してパターンを分割指定することで対応する

## References

- Request: `specrunner/changes/bite-evidence-test-file-selection/request.md`
- Design: `specrunner/changes/bite-evidence-test-file-selection/design.md`
- Spec: `specrunner/changes/bite-evidence-test-file-selection/spec.md`
- Implementation: `src/core/step/bite-evidence/test-file-selection.ts`
- Related（依存極小方針）: `specrunner/adr/2026-04-27-cli-first-architecture.md`
- Related（strategy-deferred 分類）: `specrunner/adr/2026-06-01-runtime-strategy-artifact-lifecycle.md`
