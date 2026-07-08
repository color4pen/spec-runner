# verification の test-coverage を TC-ID 存在照合から変更行の実行検証（lcov）に強化する

## Meta

- **type**: spec-change
- **slug**: lcov-changed-line-gate
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

現行の test-coverage 検査は、test-cases.md の must TC ID がテストファイル内に**文字列として存在するか**だけを照合する。TC ID をコメントに書きさえすれば、実装コードを一切実行しないテスト（ソースファイルを文字列で読んで内容を照合するだけのテスト等）でも verification は green になる。「テストが実際に変更コードを実行しているか」は現状どのゲートも機械検証しておらず、実行ゼロの形骸テストが全ゲート（verification / code-review / conformance）を素通りし得る。

「テストが実質的か」を LLM レビューに読ませるのは不確実性の再導入であり、本 request は「**変更行が実行されたか**」という機械検証に置き換える。継ぎ目は git diff（言語非依存）× lcov（標準交換形式。vitest / coverage.py / cargo-llvm-cov 等、主要言語の coverage ツールが出力可能）× exit code のみとし、spec-runner にソース/テストの言語別パースを一切持たせない。

## 現状コードの前提

- `src/core/verification/runner.ts:307` `runVerification` が `verification.commands` の有無で `:315` `runVerificationCommands` / `:319` `runVerificationPhases` に分岐する。
- `src/core/verification/runner.ts:451-453` phases path で `runTestCoveragePhase` を CLI 内部処理として実行する（commands path では走らない）。
- `src/core/verification/test-coverage.ts:208` `text.includes(tcId)` による substring 存在照合（TC-1 が TC-10 にもマッチする）。`:178` must TC が 0 件なら passed を返す。`:219` `assertionlessTcIds` も文字列ベース。
- `src/config/schema.ts:115` `ShellCommand`（repo 供給 shell command の共通形。`verification.commands` / `workspace.setup` で既用）。`:128` `VerificationConfig`。
- 検証は job worktree 内で実行され、base branch との diff は git から機械的に導出できる。

## 要件

1. **config**: `verification.coverage` を追加する。フィールド: coverage 付きテスト実行コマンド（`ShellCommand` 形）、lcov 出力パス、`include`（検証対象 surface の glob 配列、**必須**）、`exclude`（除外 glob 配列、任意）。
2. **gate 本体**: `verification.coverage` 宣言時、verification は coverage コマンドを実行し、lcov（`SF:` / `DA:` 行）を**自前の最小パーサ**（依存追加なし）で読み、base branch との変更行と突合する。判定は変更ファイルごとに次の通り:
   - `include` に該当しない、または `exclude` に該当するファイル → 対象外
   - lcov に存在し、変更行に実行可能行（DA レコード）があり、**1 行も実行されていない** → **fail**
   - lcov に存在し、変更行に DA レコードが無い（型定義・コメント等の非実行行のみの変更）→ pass
   - **lcov に存在しない（テスト実行時に一度もロードされていない）→ fail**（fail-closed。正当な例外は `exclude` で宣言する）
3. **実行位置**: gate は commands path / phases path の**どちらでも**、主検証の後に実行する（`verification.commands` を使う repo でも機能すること）。
4. **失敗の可視化**: fail 時は該当ファイルを列挙した明確なエラーで verification を failed にする。config 未宣言なら gate は skipped とし、skip した事実を verification-result に可視化する。coverage コマンドの失敗・lcov 不生成は **fail**（宣言された保証を黙って落とさない）。
5. **TC-ID 照合の残置と修正**: 既存の TC-ID 照合は traceability 検査（test-cases.md とテストの紐付け）として残置する。ただし照合を substring から **ID 境界の厳密一致**に修正する（TC-1 が TC-10 に誤マッチしない）。
6. **閾値**: 既定は「変更ファイルごとに実行された変更行 > 0」。より強い閾値（変更実行可能行の実行率等）は config で任意に強化可能とし、既定挙動は変えない。

## スコープ外

- branch coverage / 実行率レポートの高度化。
- lcov 以外の形式（cobertura 等）のサポート（将来、必要になってから）。
- テスト内容の意味的検証（assert の妥当性）。coverage は「実行の事実」のみを保証する。実行するが検証しないテストは本 gate の対象外（test-case-gen の導出軸強化・レビューの領分）。
- mock 汚染（afterAll 未復元等）の検出。
- 特定 coverage ツールの導入・強制（コマンドは repo 供給の opaque command として扱う）。

## 受け入れ基準

- [ ] fixture の lcov + 変更集合で次を各テストで固定する: 変更ファイルの DA 行が全て未実行 → failed + ファイル列挙 / 1 行でも実行 → passed / 変更行に DA 無し → passed / lcov 不在ファイル → failed / `exclude` 宣言ファイル → 対象外 / `include` 外ファイル → 対象外。
- [ ] config 未宣言 → gate は skipped と可視化され、既存挙動が不変（既存テスト無変更 green）であることを固定する。
- [ ] coverage コマンド失敗、または lcov 不生成 → failed をテストで固定する。
- [ ] TC-ID 照合の厳密一致（TC-1 が TC-10 にマッチしない）をテストで固定する。
- [ ] commands path / phases path の両方で gate が実行されることをテストで固定する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

**採用**

- 継ぎ目を git diff × lcov × exit code に限定する。言語非依存で、ソース/テストの言語別パースを CLI に持たせない。lcov は `SF:`/`DA:` のみの自前最小パーサ（依存追加なし）。
- `include` 必須の surface 宣言 + fail-closed（lcov 不在 = 未ロードは fail）。「どこのコードがテストに実行されるべきか」は repo が一度データで宣言する契約とし、gate の on/off・対象に LLM 判断を挟まない（機構は一様・データのみ可変。fast pipeline の forbidden surfaces と同型）。
- TC-ID 照合は「test-cases.md との紐付け」という別軸の検査として残置し、合否の実質は本 gate に移す。
- 誤爆の残余（surface 内だが正当にテスト不能な稀ケース）は escalation → 人の判断 → resume の既存経路を安全弁とし、gate 側に例外機構を足さない。

**却下**

- must TC 件数など LLM 生成物を gate のスイッチにする案: agent の出力が gate を外せる構造になり、「judgment を gate に挟まない」原則に反する。
- assert 有無の言語別静的検出: JS 固有のパースで他言語で破綻する。継ぎ目の選定ミス。
- 既定 100% 閾値: 型定義行・防御的コードで誤爆し調整コストが過大。まず実行ゼロ検出（false-green の大半）から。
- TC-ID 照合の全廃: traceability は実行検証と別軸の検査で、廃止するには反証が足りない。
- reviewer prompt に「テストの実質性を読む」指示を足す案: 分布は動くが保証にならず、LLM 判断の再導入になる。
