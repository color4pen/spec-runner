# ADR: verification に変更行実行検証（lcov changed-line gate）を追加する

- **Date**: 2026-07-08
- **Status**: Accepted
- **Slug**: lcov-changed-line-gate

## Context

`2026-05-19-verification-tc-coverage` で verification に TC-ID 存在照合（must TC ID がテストファイルに文字列として現れるか）が追加され、`2026-06-02-test-coverage-assertion-faithfulness-gate` で assertion 存在検査（faithfulness gate）が追加された。しかしこれら 2 段階の検査でも「テストが実際に変更コードを実行しているか」は機械保証されない。

TC-ID をコメントに書き、assertion を 1 行置くだけで、ソースファイルを文字列として読んで内容を照合するだけのテスト（実装コードを一切実行しない形骸テスト）でも verification が green になる。実行ゼロの形骸テストが verification / code-review / conformance の全ゲートを素通りし得る状態だった。

「テストが実質的か」を LLM レビューに読ませることは不確実性の再導入である。verification の保証水準を「テストが変更コードを実行している」という機械的事実に引き上げる必要があった。

加えて、TC-ID 照合に `text.includes(tcId)` の substring 一致を使っていたため、`TC-1` が `TC-10` にも誤マッチするバグが存在した。

## Decision

verification に **lcov changed-line gate** を追加し、変更行の実行を機械的に保証する。

核心的な設計選択:

1. **継ぎ目を git diff × lcov × exit code に限定する**（言語非依存）。CLI にソース/テストの言語別パースを一切持たせない。
2. **`verification.coverage` config を追加する**。`include`（必須・非空）で検証対象 surface を repo が一度 data で宣言し、gate の on/off に LLM 判断を挟まない。
3. **fail-closed**: lcov に存在しないファイル（テスト実行で一度もロードされていない）は fail。正当な例外は `exclude` で宣言する。
4. **TC-ID 照合を substring から ID 境界の厳密一致に修正する**（traceability 検査として残置）。

## Design Decisions

### D1: 継ぎ目を git diff × lcov × exit code に限定する（言語非依存）

ゲートが依存する外部情報は 3 点のみとし、ソース/テストの言語別パースを CLI に一切持たせない:

1. **git diff**: 変更ファイルと変更行番号（HEAD 側）。言語非依存。
2. **lcov**: coverage ツールが出力する `SF:`（ソースファイル）/ `DA:`（行番号,実行回数）のみ読む。他レコードは無視。
3. **exit code**: coverage コマンドの成否。

**採用理由**: 「どのコードがテストで実行されたか」を言語横断で機械導出できる最小集合。lcov は vitest / coverage.py / cargo-llvm-cov 等の主要 coverage ツールが出力できる標準交換形式であり、spec-runner 側でツールを強制しない。fast pipeline forbidden surfaces と同じ「機構は一様・data のみ可変」を貫く。

**却下案**:
- assert 有無の言語別静的検出 → JS 固有パースで他言語破綻（継ぎ目の選定ミス）。
- テスト実質性を LLM reviewer に読ませる → LLM 判断の再導入で保証にならない。
- mutation testing → 実行コストが高く、まず実行ゼロ検出から始めるべき。

### D2: `include` 必須の surface 宣言 + fail-closed

`verification.coverage` config:

```jsonc
{
  "verification": {
    "coverage": {
      "command": "vitest run --coverage",
      "lcovPath": "coverage/lcov.info",
      "include": ["src/**"],
      "exclude": ["src/generated/**"],
      "minChangedLineCoverage": 0.8
    }
  }
}
```

- `include` は**必須かつ非空**。「どこのコードがテストに実行されるべきか」を repo が一度 data で宣言する契約とし、空 include（ゲートを無害化する footgun）は validation で拒否する。
- `exclude` は任意。正当にテスト不能な surface 内ファイルを宣言する（gate 側に per-file 例外機構を足さない）。

**採用理由**: fast pipeline forbidden surfaces（`{ id, paths }` 配列 config）と同型。ゲートの on/off・対象に LLM 判断を挟まず、data のみ可変。

**却下案**:
- `include` 任意（無指定=全ソース）→ CLI が repo のソースツリー構造を推測することになり、暗黙判断が入る。
- must TC 件数など LLM 生成物をゲートのスイッチにする → agent 出力がゲートを外せる構造で「judgment をゲートに挟まない」原則違反。

### D3: 変更ファイルごとの決定表（fail-closed）

対象は base…HEAD の変更ファイル（削除除く）のうち `include` 一致・`exclude` 不一致のもの:

| 状態 | 判定 |
|------|------|
| lcov に存在しない（テスト実行で一度もロードされていない） | **fail**（fail-closed） |
| lcov に存在し、変更行に DA レコードが無い（型定義・コメント等の非実行行のみ） | pass |
| lcov に存在し、変更 DA 行があり 1 行も実行されていない（既定閾値） | **fail** |
| lcov に存在し、変更 DA 行の実行割合が閾値以上 | pass |
| `include` 不一致 または `exclude` 一致 | 対象外（判定しない） |

**採用理由**: 「lcov 不在 = 未ロード = 未実行」を fail に倒すことで、テストが surface を丸ごと素通りするケース（false-green の大半）を捕捉する。

**却下案**:
- lcov 不在をスキップ（fail-open）→ 「テストが一度も読み込んでいない」が最悪ケースなのに素通りし、動機を満たさない。
- 既定 100% 閾値 → 型定義行・防御的コードで誤爆し調整コスト過大。

### D4: 宣言時のみ phase を追加し、未宣言時は note のみ

- **宣言時**: `changed-line-coverage` phase を主検証の**後ろ**に追加する。先行 phase が failed なら fail-fast で skipped。
- **未宣言時**: phase を**追加しない**。verification-result.md に skip の事実を note として出す（既存「passed with skips」note と同じ verdict 直下領域）。

**採用理由**: 既存 runner テストは coverage 未設定で `phases.length` を厳密固定している。未宣言時に phase を足すと既存テストが一斉に破れる。未宣言時は phase を増やさず note で可視化し、宣言時のみ phase を足す。

**却下案**:
- 常に skipped phase を追加 → 既存の `phases.length` 固定テストを一斉に壊す。
- 未宣言時は完全無音 → 「skip した事実を可視化」の要件を満たさない。

### D5: coverage コマンド失敗・lcov 不生成は fail（宣言された保証を黙って落とさない）

ゲートが実行される（宣言あり・先行 passed）とき、coverage コマンドの非 0 exit・lcov 不在・空・パース不能はいずれも **failed**。

**採用理由**: 宣言した保証（変更行の実行検証）を、道具の失敗を理由に静かに無効化しない。

### D6: 変更行の導出は `git diff --unified=0 <base>...HEAD`。純粋パーサ + 直接 git spawn

hunk ヘッダ `@@ -a,b +c,d @@` から HEAD 側（`+c,d`）の行番号を収集。runner 内で git を直接 spawn（`checkPackageJsonScriptsIntegrity` と同じ前例）。純粋 hunk パーサ関数と薄い spawn ラッパに分離してテスト可能にする。

### D7: lcov は `SF:`/`DA:` のみの自前最小パーサ。SF パスを repo-root 相対に正規化

`parseLcov(text)` は `SF:`・`DA:`・`end_of_record` のみ解釈。他レコードは無視（依存追加なし）。SF は絶対パス / `./` 付き / cwd 相対等で出力されるため、cwd 起点の repo-root 相対 POSIX に正規化してから git diff path・glob と突合する。

**却下案**: 既存 lcov ライブラリ導入 → minimal-deps North Star に反する。`SF`/`DA` だけで足りる。

### D8: 判定コアは純関数。orchestration と分離

`evaluateChangedLineCoverage({ lcov, changedLinesByFile, include, exclude, minChangedLineCoverage })` を純関数とし、全分岐を fixture テストで決定的に固定する。orchestration は `runChangedLineCoverageGate` が担う（コマンド実行 → lcov 読取 → diff 導出 → 純関数呼び出し → `PhaseResult` 生成）。

### D9: TC-ID 照合は ID 境界の厳密一致に修正し、traceability 検査として残置

`text.includes(tcId)` から ID 境界の厳密一致（`(?<![A-Za-z0-9])${id}(?![0-9]|-[0-9])`）に変える。`TC-1` が `TC-10`・`TC-1-2` に誤マッチしない。found 判定・assertionless 判定の両方に適用。

**TC-ID 照合の全廃は却下**: traceability（test-cases.md とテストの紐付け）は実行検証と別軸の検査で、廃止するには反証が足りない。

### D10: 既定閾値は「実行された変更行 > 0」。`minChangedLineCoverage` で任意強化

- 未指定 → pass 条件は `executed >= 1`（実行ゼロ検出。既定挙動）。
- 指定時（>0〜1、例: 0.8）→ pass 条件は `executed / changedDa >= minChangedLineCoverage`。
- 変更 DA 行が空（非実行行のみの変更）→ 閾値に関わらず pass。

**却下案**: 既定 100% → 型定義行・防御的コードで誤爆過大。

### D11: commands path に baseBranch を通す

`runVerificationCommands` は従来 `baseBranch` を受けていなかった。要件「commands path でも機能すること」のため、`coverage` config と `baseBranch` の両方を commands/phases 両 path に引き渡す。外部 API（`runVerification` のシグネチャ）は不変で、内部引き回しのみ追加。

## Alternatives Considered

### Alternative 1: JS 固有の静的 assert 検出（テストファイルの AST 解析）

テストファイルを言語固有のパーサ（TypeScript AST 等）で解析し、TC-ID と対応する `it` ブロック内に `expect(` / `assert(` 呼び出しが存在するかを静的に検出する案。

- **Pros**: ファイル実行なしに assertion 対応を検査できる。CI コストが低い。
- **Cons**: TypeScript/JavaScript 固有の実装になり、他言語（Python, Rust 等）では破綻する。テストランナー（vitest/jest/mocha）によってブロック構造が異なり、AST 対応の継続コストが高い。「実行の事実」ではなく「静的構造」しか保証できない（実際に呼ばれるかは不明）。
- **Why not**: spec-runner は任意言語の repo を扱うツールであり、特定言語への依存は継ぎ目の選定ミスになる。「言語非依存で実行の事実を機械導出する」という要件を満たせない。

### Alternative 2: LLM reviewer にテスト実質性の判断を委ねる

code-review prompt に「テストが実際に変更コードを実行しているか確認せよ」という指示を追加し、LLM reviewer が形骸テストを検出する案。

- **Pros**: 実装コストがほぼゼロ。AST パースや coverage ツールの連携が不要。
- **Cons**: 判断が非決定的で同一 PR が通ったり落ちたりしうる。LLM は「テストが実質的か」を確認するために実際にコードを実行できないため、推測に基づく評価になる。「不確実性の再導入」になり、機械保証の水準に達しない。
- **Why not**: 本変更の動機は「LLM 判断を gate に挟まない」こと。reviewer prompt に頼ると、分布は動くが保証にならず、escalation が増えるだけで根本解決にならない。

### Alternative 3: mutation testing による実行保証

コードに微小変更（mutant）を加え、テストが落ちるかを確認することで「テストが実際に振る舞いを検証している」を機械保証する案。

- **Pros**: assertion 存在だけでなく、テストと実装の意味的対応を厳密に保証できる。空 stub だけでなく「アサートはあるが対象コードを検証していない」ケースも検出できる。
- **Cons**: 全テストを多数の mutant に対して繰り返し実行するため CI コストが非常に高い。target project のビルド/テスト環境の詳細把握が必要。実装複雑性が大幅に増す。
- **Why not**: 本変更の目的は「実行ゼロ（false-green の大半）」を最小コストで検出することにある。mutation testing の完全性は魅力的だが、コスト対効果が悪すぎる。まず「変更行が 1 行でも実行されているか」という緩い基準で底上げし、強化は将来の別 request に委ねる。

### Alternative 4: fail-open（lcov に存在しないファイルはスキップ）

`SF:` レコードが lcov に現れないファイルをエラーではなく「対象外」として扱う案。

- **Pros**: 誤爆（lcov 生成ツールが SF パスを意図しない形式で出す等）によるブロックを避けられる。導入の初期摩擦が低い。
- **Cons**: 「テストが一度もロードしていないファイル」という最悪ケースを素通りさせる。surface 内の全ファイルが lcov 不在でも gate は全 pass になり、ゲートとしての意味を失う。
- **Why not**: 「宣言した surface は必ずテストにロードされる」を保証するのがゲートの核心。lcov 不在 = 未ロード = 未実行であり、これを fail に倒すことが false-green の大半を捕捉するカギ。正当な例外は `exclude` で宣言する（fail-closed + data による例外宣言）。

### Alternative 5: `include` 任意（未指定時は全ソースを対象）

`verification.coverage` の `include` フィールドを省略可能とし、未指定時はリポジトリ内の全ソースファイルをゲート対象とする案。

- **Pros**: 設定が簡単になる。surface の明示的宣言が不要。
- **Cons**: CLI が「どこがソースで、どこがビルド成果物・設定ファイルか」を推測する必要が生じ、判断が CLI 内部に入る。リポジトリ構造が多様で誤爆が避けられない。generated ファイルや vendor 等を自動除外するロジックが必要になり複雑性が増す。
- **Why not**: 「機構は一様・data のみ可変」の原則に反する。fast pipeline forbidden surfaces と同様に、「どのコードがテストに実行されるべきか」は repo が一度 data で宣言する契約とする方が判断の所在が明確で誤爆が起きない。

## Consequences

- **additive 変更**: config キー新設 + 宣言時のみ発火する新 phase。既存 repo（coverage 未宣言）の挙動は不変（note が 1 行増えるのみ、phase 数・verdict は不変）。
- **rollback**: `verification.coverage` は optional。未指定なら発火しないため、revert は無害。
- **誤爆の残余**（surface 内だが正当にテスト不能な稀ケース）は `exclude` 宣言、または既存の escalation → 人の判断 → resume 経路を安全弁とする（gate 側に例外機構を足さない）。
- **二重実行コスト**: coverage 専用コマンドが主 test phase とテストを二重実行しうる。repo が opaque command として選ぶ設計上の許容コスト（ツール強制なし）。
- **spec-runner 自身の dogfooding は本 PR 対象外**: 本 PR の変更行が自 repo の coverage 閾値を満たさないと自身の verification が循環するため、ゲート安定後に別 request で宣言する。

## References

- Request: `specrunner/changes/lcov-changed-line-gate/request.md`
- Design: `specrunner/changes/lcov-changed-line-gate/design.md`
- Related ADR: `specrunner/adr/2026-05-19-verification-tc-coverage.md`（test-coverage phase 確立）
- Related ADR: `specrunner/adr/2026-06-02-test-coverage-assertion-faithfulness-gate.md`（assertion 存在検査）
