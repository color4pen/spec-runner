# Design: test-dir-detection

## Context

test-coverage phase（`src/core/verification/test-coverage.ts`）は must TC ID が test code 内に
grep で出現するかを機械的に検証するゲートである。現状 3 箇所が test 配置先を `tests/` ルート直下に
ハードコードしている:

1. `src/core/verification/test-coverage.ts:159` — TC ID grep の収集対象が `path.join(cwd, "tests")` 固定。
   さらに収集ロジック（`getTestFiles`）は `tests/` 配下の **全 `.ts`** を集める。
2. `src/prompts/implementer-system.ts:52` — 「verification step が `tests/` 配下に対する grep で
   TC ID の存在を検証する」と implementer を `tests/` へ誘導している。
3. `src/prompts/test-case-gen-system.ts:132` — 「the verification step (which greps `tests/` ...)」と
   同様に `tests/` 固定を前提にしている。

spec-runner 自身の dogfooding では test が `tests/` ルートにあるため問題が顕在化しないが、
collocated test 規約のプロジェクト（vitest の include が `tests/` を含まない構成）では、
生成された test が一度も実行されない死んだファイルになり、TC ID 検証も常に「`tests/` に無い＝missing」
となって機能しない（#565）。

implementer は LLM agent であり、既存 test の import パス・ディレクトリ構造を見て適切な配置を選べる。
`tests/` への誘導を外し、grep 収集をプロジェクトの実態（実在する test ファイル）に合わせれば、
implementer が自律的に正しい配置を選び、検証もその配置に追従する。

制約:
- minimal-deps North Star — glob ライブラリ等の新規依存を追加しない。
- `test-coverage.ts` は `bun:*` / `Bun.*` を使わず `node:fs/promises` / `node:path` のみ使用する（既存規律）。
- spec-runner 自身の `tests/` 配下 dogfooding test の TC ID 検証が壊れない（後方互換）。

## Goals / Non-Goals

**Goals**:

- test-coverage の TC ID grep 対象を `tests/` 固定から、プロジェクト全体に実在する
  `*.test.ts` / `*.spec.ts` ファイルの収集に変更する。
- implementer / test-case-gen プロンプトから `tests/` 固定パスの記述を除去し、
  「プロジェクトの既存 test 配置に従う」旨へ変更する。
- 後方互換: `tests/` 配下に test を置くプロジェクト（spec-runner 自身を含む）で検証が引き続き動作する。

**Non-Goals**:

- vitest config（include パターン）の parse — 実在ファイル収集で十分。
- `.specrunner/config.json` への test ディレクトリ設定追加 — 実在ファイル検出で不要。
- implementer の test 品質改善 — 配置先の問題のみ扱う。
- `.test.tsx` / `.spec.tsx` / `.test.js` 等、TS 以外・拡張子バリエーションへの対応（本変更は `*.test.ts` / `*.spec.ts` に限定）。
- `phases.ts` / `runner.ts` の変更 — 収集ロジックは `test-coverage.ts` 内部に閉じる。

## Decisions

### D1: 収集を「プロジェクトルートからの再帰走査 + 拡張子フィルタ」で行い、新規依存を追加しない

`test-coverage.ts` 既存の `getTestFiles` は既に `node:fs/promises` の `readdir({ withFileTypes: true })`
による再帰走査を実装している。これを「ルート = `cwd`（プロジェクトルート）から走査し、
ファイル名が `.test.ts` または `.spec.ts` で終わるものを収集する」collector に作り替える。

- **Rationale**: minimal-deps North Star。既存の再帰走査を流用すれば追加コードは僅少で、依存ゼロを維持できる。
  「実在ファイルが真実」という architect 評価済みの方針とも一致する。
- **Alternatives considered**:
  - `fast-glob` / `globby` 等の glob ライブラリ導入 → 棄却。minimal-deps に反する。
  - `child_process` で `find` を spawn → 棄却。Windows に POSIX `find` が無く非可搬。子プロセス起動は
    純 file I/O より重く、`node:fs` のみ使う既存規律にも反する。
  - vitest config の include glob を parse → 棄却（Non-Goal）。config 形式が多様で脆く、過剰。

### D2: 収集対象を `*.test.ts` / `*.spec.ts` に限定する（全 `.ts` を集めない）

ルートから走査するため、フィルタを掛けないと `src/**/*.ts` 等の非 test ファイルまで収集してしまう。
ファイル名が `.test.ts` / `.spec.ts` で終わるものだけに限定する。

- **Rationale**: source ファイルのコメントに TC ID 文字列が出現した場合の **false "found"** を防ぐ。
  test ファイル命名規約（vitest / jest 標準）に絞ることで、要件（`*.test.ts` / `*.spec.ts` 収集）を満たしつつ
  grep 対象を「実際に test が書かれる場所」に限定できる。
- **Alternatives considered**:
  - ルート配下の全 `.ts` を収集 → 棄却。source コメント等で TC ID が誤検出される。
- **Trade-off**: TC ID を test ファイル以外（helper `.ts` 等）にのみ書いた場合は検出されなくなる。
  許容する — TC ID は test 関数名 / コメント（= test ファイル内）に書く規律であり、この前提は本変更が強化する方向。

### D3: 走査時に `node_modules` / `dist` / `.git` ディレクトリを名前で枝刈りする

再帰走査中、ディレクトリ名が `node_modules` / `dist` / `.git` のものは降りずに skip する。

- **Rationale**: 性能（`node_modules` は巨大）と正当性（vendored / 生成物中の `.test.ts` による false "found" 防止、
  `.git` の blob 走査回避）。ディレクトリ単位で枝刈りすることで巨大ツリーへ一切降りない。
- **Alternatives considered**:
  - 収集後にパス部分文字列で post-filter → 棄却。`node_modules` を一度走査するコストを払ってしまう。
- 枝刈りは **完全一致**のディレクトリ名のみ。`dist-tests` のような名前は枝刈り対象外（正規の test を誤って除外しない）。

### D4: 後方互換は「ルート走査が `tests/` 走査の上位集合」であることで担保する

`cwd` ルートからの走査は旧 `tests/` 走査の superset である。`tests/**/*.test.ts` は引き続き収集される。
spec-runner 自身の dogfooding（TC ID が `tests/**/*.test.ts` にある）は変更ゼロで検証が通り続ける。
既存 unit test 群（fixture を `tests/...` に `*.test.ts` で書く）も無改変で green を維持する。

- **Rationale**: 破壊的でない拡張であることを設計レベルで保証する。`runTestCoveragePhase(slug, cwd)` の
  scan ルートはテストでは隔離された tempDir であり、実リポジトリと干渉しない。

### D5: プロンプトは配置判断を implementer の裁量に委ねる

`implementer-system.ts` / `test-case-gen-system.ts` から `tests/` 固定の記述を除去する。

- implementer-system.ts: verification step の説明を「プロジェクト内の `*.test.ts` / `*.spec.ts` に対する grep」へ
  一般化し、test 配置は「プロジェクトの既存 test の配置パターンに従う（具体ディレクトリは指定しない。
  既存 test の import パス・ディレクトリ構造を見て判断する）」と明示する。
- test-case-gen-system.ts: TC ID downstream 参照の注記から `tests/` を除き、「verification step が
  プロジェクトの test ファイルを grep する」一般表現へ変更する。
- **Rationale**: agent に既存規約を観察させる方が、固定ディレクトリ指定より移植性が高い（architect 評価済み）。

## Risks / Trade-offs

- [Risk: collocated な `.test.ts` が TC ID 文字列のみ含み assertion を欠く] → Mitigation: 既存の
  assertion 存在ゲート（`ASSERTION_RE = /expect\(|assert\(|assert\./`）が faithfulness を担保する。本変更で挙動不変。
- [Risk: 巨大 monorepo での走査コスト] → Mitigation: `node_modules` / `dist` / `.git` をディレクトリ単位で枝刈りし、
  読み込むのは `*.test.ts` / `*.spec.ts` のみ。verification は元々 full build / test を spawn しており相対的に軽微。
- [Trade-off: TC ID を test ファイル外に書いた場合の非検出] → D2 の通り許容（TC ID は test 内に書く規律）。
- [Risk: プロンプト文字列の content test が脆くなる] → Mitigation: 「特定の旧固定パス表現の不在」と
  「新ガイダンスの存在」を最小限のアンカーで検証し、`tests` という語全般を禁止しない。

## Open Questions

- `.test.tsx` / `.spec.tsx` / `.test.js` / `.spec.js` 等、TS 以外・拡張子バリエーションへの将来拡張。
  本変更では Non-Goal（要件が `*.test.ts` / `*.spec.ts` に固定）。必要が生じた時点で拡張する。
