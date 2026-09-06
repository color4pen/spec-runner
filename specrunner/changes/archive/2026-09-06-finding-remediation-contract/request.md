# feat: reviewer finding に修正方針（remediation）契約を追加し fixer / regression-gate へ渡す

## Meta

- **type**: new-feature
- **slug**: finding-remediation-contract
- **base-branch**: main
- **adr**: true

## 背景

custom reviewer（例: cross-boundary-invariants）が needs-fix を出してから approved に至るまで、同じ job で 5〜6 イテレーションを要する事例が繰り返し発生している。

- `specrunner/changes/archive/2026-08-29-exclusion-aware-publish-prediction/`: cross-boundary-invariants-result-001〜005（needs-fix ×4 → approved）
- `specrunner/changes/archive/2026-08-23-push-capability-preflight/`: cross-boundary-invariants-result-001〜006（escalation 1、needs-fix ×4 → approved）

evidence file を通読すると、各イテレーションの finding は前回と同じ指摘の再掲ではなく、**前回の修正が同じ不変条件を共有する隣接経路を直していないために露出した同型の欠陥**である。reviewer 自身が「iteration-2 fix correctly exempts `protectedCanonPaths` but the unchanged write-scope invariant is broader than that list」「iteration-3 fix … introduces a cross-step ownership transition」と記述している。

原因は reviewer と fixer の受け渡し契約にある。

### reviewer が書いた修正方針は fixer に届いていない

- reviewer は evidence file（`<reviewer>-result-NNN.md`）に再現手順と修正方針を書いている。exclusion-aware-publish-prediction iter 2 では「変更 path 全体に対して先に write-scope 検査を走らせるか、禁止 canon と除外対象を分離せよ」と不変条件レベルの推奨がある。
- しかし fixer のプロンプトに入るのは typed finding のみである。`src/core/step/fixer-helpers.ts` の `buildFindingsBlock` は severity / title / file:line / resolution / rationale / source の 6 行を出力し、evidence file の内容も path も含めない。
- `src/core/step/code-fixer.ts` の `buildMessage` は、structured findings が 1 件以上ある限り evidence file の path をプロンプトに書かない。path が渡るのは findings が空の fallback 経路だけである。continuation prompt（`buildContinuationMessage`）も同様。
- `code-fixer.ts` の `reads()` は reviewer result file を宣言しているが、これは executor の入力存在検証（`validateRequiredInputs`）と descriptor 完全性検査にのみ使われ、プロンプトへの注入や読取指示ではない。
- `src/prompts/code-fixer-system.ts` は Method 1 で「指定された review-feedback-NNN.md を読み込む」と述べるが、user prompt 側で file が指定されないため指示は成立していない。

### typed finding の rationale は症状に圧縮される

- `Finding` 型（`src/kernel/report-result.ts`）と tool schema（`src/core/step/report-tool.ts` の `findingSchema`）は `severity / resolution / file / line? / title / rationale / options? / origin? / fileMissing? / ledgerRef?` を持ち、修正方針や関連 site を表すフィールドがない。
- 上記 iter 2 の persisted rationale は「除外対象の protected canon 変更は filteredResidualPaths から除去され、未 stage のため stagedOnly 検査にも現れません。parallel-review coordinator にも同じ順序問題があり、write-scope enforcement を迂回できます。」の 2 文であり、evidence file にある「不変条件は protected canon より広い」「除外 filter より前に write-scope 検査」は失われている。
- fixer はこの rationale に忠実に `protectedCanonPaths` のみを例外化し、次イテレーションで judge artifact、さらに次で宣言済み result の所有権移転が指摘された。

### fixer は最小修正を命じられている

- `code-fixer-system.ts` は役割を「指摘事項の最小限修正のみ」、Method 3 を「各 finding を最小限の機械的修正で解消する」と定義している。不変条件を共有する隣接経路まで直す動作は指示されていない。
- 結果として、reviewer が方針を出していても、fixer は file:line の症状を最小限に塞ぎ、欠陥が隣のレイヤへ移動する。

### regression-gate も site 単位の情報を持たない

- `src/core/pipeline/findings-ledger.ts` の ledger は finding を `file|line|title` で識別し（`findingFingerprint` / `computeLedgerRef`）、regression-gate はこの一覧に対して「まだ直っているか」を検証する。同じ不変条件を共有する他の site は ledger に存在しないため、片側だけ直った状態を検出できない。

## 目的

reviewer が finding を報告する時点で「破れた不変条件」「その不変条件を共有する全 site」「推奨する修正の方向」を typed contract として持たせ、fixer と regression-gate がそれを機械的に受け取れるようにする。

verdict は引き続き typed findings から CLI が導出する。evidence file は証拠として維持し、機械解釈の対象にしない。

## 設計要求

### 1. Finding contract の拡張

`Finding` に remediation 契約を追加する。最小の形は次の 3 要素とする。

```
remediation: {
  invariant: string;                    // 破れた不変条件を 1 文で
  sites: { file: string; line?: number }[];  // 同じ不変条件を共有する全経路（finding の file:line を含む）
  approach: string;                     // 推奨する修正の方向
}
```

- `resolution: "fixable"` のとき必須とする。`decision-needed` では任意
- `sites` は 1 件以上。`file` / `line` の意味は既存 finding と同じ worktree-relative path
- フィールド名・必須条件は ADR で確定する。上記は最小要件であり、名称は設計で変えてよい
- `src/kernel/report-result.ts` の型、`src/core/step/report-tool.ts` の tool schema、`src/core/port/report-result.ts` の parse / validation、`src/state/schema/types.ts` の persisted 型を同時に更新する

### 2. reviewer 側の要件

- judge rules（`src/prompts/judge-rules.ts`）の finding 形式に remediation を追加し、「finding を 1 つ構成したら、同じ不変条件を共有する隣接関数・並列経路を走査し、sites に列挙する」ことを要求する
- custom reviewer 共通の system prompt（`src/prompts/custom-reviewer-system.ts`）側で扱い、reviewer 定義（`specrunner/reviewers/*.md`）ごとの重複記述を要求しない
- remediation 欠落の fixable finding は parse 時に fail-closed とする。ただし fail-closed によって finding 自体が消える（needs-fix が approved に化ける）経路を作らない。欠落は escalation または typed error として表面化させる

### 3. fixer 側の要件

- `buildFindingsBlock` が remediation を展開する。少なくとも invariant、sites の全列挙、approach を finding ごとに出力する
- code-fixer / spec-fixer のプロンプトで「列挙された全 site を同一イテレーションで修正する。approach より狭い修正を選ぶ場合は理由を出力に残す」ことを指示する
- `code-fixer-system.ts` の「最小限の機械的修正」は「finding が名指しした不変条件を、列挙された全 site で成立させる最小の修正」に改める。finding に無関係な変更を禁じる意味は維持する
- code-fixer は structured findings がある場合も evidence file の path をプロンプトに含める（参照用。機械解釈はしない）。spec-fixer の通常経路は既に path を含めており、この点は code-fixer 固有の欠落である
- Method 1「指定された review-feedback-NNN.md を読み込む」と実際の prompt 内容の不一致を解消する

### 4. regression-gate / ledger 側の要件

- ledger entry が remediation.sites を保持し、regression-gate が「全 site で不変条件が成立しているか」を検証対象にできる
- `findingFingerprint`（`file|line|title`）による identity と `ledgerRef` の互換性を維持する。既存の persisted finding（remediation なし）を読み込んでも ledger 生成・dedupe・wontfix provenance が壊れない

### 5. 互換性

- persisted state / events に remediation のない finding が存在する。読取は additive に扱い、migration を要求しない
- `AgentRunResult` や verdict 導出（`judge-verdict.ts`）の意味を変更しない
- managed runtime（`src/adapter/managed-agent/`）でも同じ schema が通る

## 検証方法

- schema / parse: remediation あり・なし・sites 空・fixable で欠落、の各ケースで parse 結果と fail-closed 経路を unit test で固定する
- prompt: `buildFindingsBlock` と code-fixer / spec-fixer の `buildMessage` について、remediation が展開されること、evidence file path が含まれることを snapshot ではなく assertion で検証する
- ledger: sites を持つ finding が ledger に載り、`computeLedgerRef` が既存 finding と同じ値を返すこと
- 既存 prompt skeleton / fragment coverage テスト（`src/prompts/__tests__/`）を通す
- 再現確認として、exclusion-aware-publish-prediction iter 2 の finding を remediation 付きで表現した fixture を作り、fixer プロンプトに `commit-push.ts` と `parallel-review-round.ts` の両 site が同時に現れることを確認する

## Non-goals

- evidence file（`*-result-NNN.md`）の形式標準化や機械 parse
- verdict 導出規則の変更
- fixer の model 変更や turn budget の変更
- reviewer の paths / criteria の見直し（cross-boundary-invariants が `src/cli/**` を対象外にしている件は別 Issue）
- 修正の自動適用や fixer の自己レビュー loop の追加
- R4 provider lifecycle refactoring との同時実施

## Acceptance Criteria

- [ ] ADR で remediation 契約のフィールド、必須条件、fail-closed 経路、互換性方針が定義される
- [ ] `Finding` 型 / tool schema / parse / persisted 型に remediation が追加され、fixable で欠落した場合の挙動が typed error または escalation として固定される
- [ ] judge rules と custom reviewer 共通 fragment が remediation の記述を要求する
- [ ] code-fixer / spec-fixer のプロンプトに invariant、sites 全列挙、approach、evidence file path が含まれる
- [ ] code-fixer system prompt の「最小限」の定義が「全 site で不変条件を成立させる最小の修正」に改められる
- [ ] regression-gate の ledger が sites を保持し、既存 `ledgerRef` と互換である
- [ ] remediation のない既存 persisted finding を読み込んでも既存テストが green
- [ ] verdict 導出、`AgentRunResult`、既存 Git / PR profile の挙動が変わらない
- [ ] SpecRunner verification が green（PR 上の既存証跡を正本とし、レビュー側で同一の test / lint / typecheck を重複実行しない）

## PR 本文に載せる実測値

- 変更した schema / parse / prompt / ledger のファイル数と行数
- remediation を要求する reviewer（judge rules 経由）の数
- fixer プロンプトに追加された行数（finding 1 件あたり）
- 追加・変更したテスト数
- 既存 persisted finding fixture（remediation なし）の読込テスト数

## Stop Conditions

以下が必要になった時点で実装を止め、観測事実・影響・選択肢を Issue へ報告する。

- remediation を必須にすると reviewer が finding を報告しなくなる、または fail-closed が needs-fix を approved に変える経路を塞げない
- persisted state の additive 読取では済まず、migration や schema version 更新が必要になる
- `ledgerRef` / `findingFingerprint` の identity を変えないと sites を ledger に載せられない
- verdict 導出規則の変更が必要になる
- managed runtime の tool schema 制約により同じ contract を通せない