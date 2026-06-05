# Design: request review を構造化 JSON 一本にして truncation 偽装を消す

## Context

`specrunner request review` は architect reviewer（one-shot agent）を実行し、その出力を
`parseReviewOutput`（`src/core/request/reviewer.ts:49`）でパースして
`formatHumanReadable`（`reviewer.ts:105`）で表示する。

現状の出力経路には二重出力がある:

- system prompt（`src/prompts/request-review-system.ts:94–163`、`## Output Format` ＋ `## Constraints`）が
  **人間可読 Markdown**（`## Findings Summary` 表・`## Verdict:` 見出し・要約）**と** 末尾の ```json ブロックの
  **両方**を要求し、両者の一致を強制している。
- 一方 CLI は Markdown を一切使わない。`parseReviewOutput` は **最後の ```json ブロックだけ** を読み、
  `formatHumanReadable` が JSON から人間可読表示を再生成する（`src/core/command/request-review.ts:104–113`）。

つまり手書き Markdown は捨てられる無駄出力であり、JSON より **先に** 出るため、出力が truncation すると
末尾の ```json が最初の犠牲になる。JSON が欠落／不完全だと `parseReviewOutput` は fallback
（`reviewer.ts:82–93`）に落ち、`verdict: "needs-discussion"` ＋ parse-error finding ＋
`summary: text.slice(0, 500)` を返す。fallback の summary が raw Markdown の echo なので、
**parse 失敗が「verdict と表つきの本物のレビュー」に偽装** され、利用者が確定結果と誤認する。
長い findings ほど Markdown が膨らみ JSON が truncation で落ちやすく、verdict が回ごとに揺れる。

### 現状の既存資産（重要）

request.md は「`parseReviewOutput` と fallback path に現状テスト無し」と述べているが、これは**不正確**。
以下の 2 ファイルに `parseReviewOutput` / fallback / `formatHumanReadable` の決定的ユニットテストが既に存在する:

- `tests/unit/core/request/reviewer.test.ts`（TC-RVR-001〜018）
- `tests/unit/command/request-review.test.ts`（TC-RR-001〜018）

両ファイルとも **現状の fallback echo 挙動**（`expect(result.summary).toBe(text.slice(0, 500))`、
それぞれ L76 / L75）を assert している。本変更で fallback summary を固定診断文に変えるため、
これらの assertion は **必ず更新が必要**。テストは新規作成ではなく **更新＋truncation ケース追加** となる。

## Goals / Non-Goals

**Goals**:

- reviewer の出力を構造化 JSON 一本にする。system prompt から人間可読 Markdown（`## Findings Summary` 表・
  `## Verdict:` 見出し・要約の二重記述）の要求と両者一致強制を外し、JSON のみを必須出力にする。
- 構造化 JSON を出力の主成分にし、冗長な前置きで truncation の崖の向こうへ押し出されないようにする。
- parse 失敗時の fallback が「本物のレビュー」に偽装しないようにする（raw text を echo しない、
  parse 失敗と判別できる固定表現、verdict を確定扱いにしない）。
- `verdictToExitCode` のマッピングと `formatHumanReadable` の表示形式を不変に保つ。
- `parseReviewOutput` / fallback path のユニットテストを更新し、正常末尾 JSON・JSON 欠落・
  truncation した JSON の各入力で決定的に検証する（LLM 不要）。

**Non-Goals**:

- review 以外の step（code-review / spec-review）の出力形式への変更。
- 構造化出力を forced tool（StructuredOutput）化する大改修。本修正は prompt 契約の単純化に留める。
- reviewer の model 選択・`maxTurns`・`timeoutMs` 等の調整。
- `RequestReviewVerdict` union への新 verdict 値追加。

## Decisions

### D1: JSON-only の prompt 契約に単純化する

`src/prompts/request-review-system.ts` の `## Output Format` 節を書き換え、唯一の必須出力 artifact を
末尾の ```json ブロックにする。`### 1. Findings Summary Table` と `### 2. Verdict` の各サブ節（Markdown 表・
`## Verdict:` 見出し）を削除し、```json ブロックを単一の REQUIRED 出力とする。
`## Constraints` から二重出力の一致強制を外す（具体的には現状 L160「verdict in JSON block MUST match the
`## Verdict:` heading」・L161「findings array … correspond to the Findings Summary table」・
L162「summary in JSON should be the same … from the Verdict section」）。

保持するもの: categories の列挙、JSON の field semantics（`number` は 1-indexed、`location`/`recommendation`
は optional で省略可、`summary` は `#N` 参照を使う）、「JSON block MUST be the last block」、
Review Process（Step 1–5）・Severity Scope・Exclusion・Verdict Derivation Rules の各節。

- **Rationale**: root cause は「使われない Markdown を JSON より先に出させていること」。Markdown 要求を外せば
  二重出力と truncation 犠牲の両方が消える。parse（最後の ```json を読む）と表示（`formatHumanReadable`）は
  不変で、変更面が最小。
- **Alternatives considered**:
  - (a) JSON を出力の先頭に置く — 無駄 Markdown 自体は残り、truncation リスクを減らすだけで根絶しない。
  - (b) forced 構造化出力 tool（StructuredOutput）にして fence の regex parse をやめる — 最も堅牢だが改修が
    大きく本 bug-fix のスコープ外。

### D2: 構造化 JSON を出力の主成分にする

Review Process（Step 1–5）は reviewer の内部推論ガイドとして残すが、**最終的な出力 artifact は JSON のみ**で
あることを prompt に明示する。JSON ブロック手前の散文（前置き）は最小限に抑えるよう指示し、JSON が生成出力の
早い位置に来て truncation の崖の手前に収まるようにする。

- **Rationale**: 要件 2。前置きを削ることで、長い findings でも JSON 本体が truncation 境界の手前に残る。
- **Alternatives considered**: 出力長そのものの上限指示 — model 依存で決定性が低く、prompt 契約の単純化という
  本修正の方針からも外れるため不採用。

### D3: fallback を「parse 失敗と判別できる」表現にする

`parseReviewOutput` の fallback 分岐（`reviewer.ts:82–93`）を次のように変更する:

- `summary` を **固定の診断文**にする（入力長・内容に依存しない定数文字列。例として「reviewer の出力を
  構造化 JSON としてパースできなかった。これは確定 verdict ではない」旨）。`text.slice(0, 500)` の raw echo を廃止する。
- parse-error finding（`category: "parse-error"`、`severity: "HIGH"`）は必ず含める（現状維持）。
- raw reviewer text は summary にも finding の各 field にも一切埋め込まない。

verdict は `"needs-discussion"` のまま据え置く（**新 verdict 値を作らない**）。判別性は「固定診断 summary ＋
必須 parse-error finding」で担保し、verdict 値の変更には依存しない。

- **Rationale**: 要件 3 / 受け入れ基準。raw text を summary・findings として echo しないことが偽装防止の核心。
  verdict 据え置きで `verdictToExitCode` のマッピング（受け入れ基準 4）を保つ。
- **Alternatives considered**: `"error"` / `"indeterminate"` 等の verdict を追加 — `RequestReviewVerdict` union と
  `verdictToExitCode` のマッピングを変えてしまい受け入れ基準 4 に違反、かつスコープ外のため不採用。

### D4: 既存テストを更新し truncation ケースを追加する

- 2 ファイル（`tests/unit/core/request/reviewer.test.ts` / `tests/unit/command/request-review.test.ts`）の
  「JSON 欠落 fallback」テストの assertion `summary === text.slice(0, 500)` を、固定診断 summary と
  「summary が raw 入力を含まないこと」の assertion に更新する。
- **truncation / 不完全 JSON** の決定的テストを追加する（```json fence が開いたまま本体が途中で切れ、
  閉じ波括弧・閉じ fence が無い入力）→ fallback path に落ち、verdict が確定扱いされず、parse-error finding を
  含み、raw echo が無いことを検証する。
- fallback 入力（JSON 欠落・malformed・truncation）すべてで parse-error finding が必ず存在することを assert する。
- すべて決定的・LLM 不要。

- **Rationale**: 受け入れ基準 2・3・5。既存テストが旧 echo 挙動を assert しているため、更新しないと
  `bun run test` が red になる。
- **Alternatives considered**: テストを新規ファイルで追加し旧 assertion を残す — 旧 assertion が新挙動と矛盾して
  red になるため不可。既存ファイルの更新が必須。

## Risks / Trade-offs

- [Risk] prompt から Markdown 表を外すと reviewer の自己整合性ガイドが減る
  → Mitigation: JSON schema 自体が findings/verdict/summary を構造として強制し、Review Process（Step 1–5）と
  Verdict Derivation Rules が推論の足場として残る。

- [Risk] 既存テストが旧 echo 挙動を assert しており、更新漏れで `bun run test` が red になる
  → Mitigation: D4 で 2 ファイルの該当 assertion 更新を明示。T-03 / T-04 で `bun run test` 実行を必須にする。

- [Risk] prompt 内容を assert するテストが `## Findings Summary` / `## Verdict:` 見出しの存在を要求している可能性
  → 確認済み: prompt 内容を assert するテスト（TC-RR-015〜018）は complexity 評価観点のみを検査し、Markdown 表・
  見出しの存在は要求していない。`request-review.test.ts` 内の `## Findings Summary` / `## Verdict:` は
  `parseReviewOutput` への **入力サンプル**、`reviewer.test.ts` の `## Verdict:` は `formatHumanReadable` の
  **出力**であり、いずれも prompt 契約とは独立。`formatHumanReadable` は `## Verdict:` を出力し続ける（不変）。

- [Risk] truncation した JSON が偶然 valid JSON としてパースできてしまうケース
  → 本修正の保証範囲外。決定性を保証するのは `JSON.parse` が失敗するか verdict が invalid な場合の fallback path。
  部分一致で誤った verdict を確定する問題は forced structured output（スコープ外）の領域。

## Open Questions

なし（ブロッキングなし）。fallback の固定診断文の文言は implementer が決定してよい。唯一の制約は
**raw reviewer text を含めないこと**。
