# Test Cases: ADR Alternatives Considered follow-prompt

Source: request.md + design.md + tasks.md

---

## Category: AdrGenStep.getFollowUpPrompt — adr flag gate

### TC-01: adr: true のとき follow-prompt 文字列を返す
- **Priority**: must
- **Source**: request.md 受け入れ基準 1, tasks.md Task 3

GIVEN `AdrGenStep` の `getFollowUpPrompt` を呼び出す  
WHEN `deps.request.adr === true`  
THEN `string` 型の値が返される（undefined でない）

---

### TC-02: adr: false のとき undefined を返す
- **Priority**: must
- **Source**: request.md 受け入れ基準 3, design.md D4

GIVEN `AdrGenStep` の `getFollowUpPrompt` を呼び出す  
WHEN `deps.request.adr === false`  
THEN `undefined` が返される

---

### TC-03: follow-prompt に「Alternatives Considered」が含まれる
- **Priority**: must
- **Source**: request.md 要件 1, tasks.md Task 4

GIVEN `adr: true` で `getFollowUpPrompt` を呼び出す  
WHEN 返却値の文字列を検査する  
THEN 文字列に `"Alternatives Considered"` が含まれる

---

### TC-04: follow-prompt が修正専用であり判定指示を含まない
- **Priority**: must
- **Source**: request.md 受け入れ基準 2, design.md D3

GIVEN `adr: true` で `getFollowUpPrompt` を呼び出す  
WHEN 返却値の文字列を検査する  
THEN 「判定せよ」「存在するか確認せよ」等の判定指示が含まれない  
AND 「追記せよ」「不足があれば〜」等の修正指示が含まれる

---

### TC-05: adr が undefined/未設定のとき undefined を返す（falsy guard）
- **Priority**: should
- **Source**: design.md D4（adr: false と同等扱い）

GIVEN `AdrGenStep` の `getFollowUpPrompt` を呼び出す  
WHEN `deps.request.adr` が `undefined` または未設定  
THEN `undefined` が返される

---

## Category: executor — followUpPrompt 解決ロジック

### TC-06: getFollowUpPrompt が定義されている場合、静的 followUpPrompt より優先される
- **Priority**: must
- **Source**: design.md D2, tasks.md Task 2

GIVEN step に `getFollowUpPrompt` method と静的 `followUpPrompt` の両方が定義されている  
WHEN executor が ctx を構築する  
THEN `followUpPrompt` には `getFollowUpPrompt()` の戻り値が採用される  
AND 静的 `followUpPrompt` の値は無視される

---

### TC-07: getFollowUpPrompt が undefined を返した場合、静的 followUpPrompt にフォールバックする
- **Priority**: must
- **Source**: design.md D2（`??` 演算子により `getFollowUpPrompt` が undefined を返すと静的値にフォールバックする）

GIVEN step に `getFollowUpPrompt` method が定義され、`undefined` を返す  
AND 静的 `followUpPrompt` にも値が設定されている  
WHEN executor が ctx を構築する  
THEN `followUpPrompt` は `"static-value"` である（静的値にフォールバックする）

> 注: 実装 `step.getFollowUpPrompt?.(state, deps) ?? step.followUpPrompt` では、`getFollowUpPrompt` が `undefined` を返すと `??` により静的 `followUpPrompt` にフォールバックする。AdrGenStep は静的 `followUpPrompt` を持たないため、このパスでは最終的に `undefined` になる。

---

### TC-08: getFollowUpPrompt が未定義の場合、静的 followUpPrompt にフォールバックする
- **Priority**: must
- **Source**: design.md D2

GIVEN step に `getFollowUpPrompt` method が定義されていない  
AND 静的 `followUpPrompt` に値が設定されている  
WHEN executor が ctx を構築する  
THEN `followUpPrompt` には静的 `followUpPrompt` の値が採用される

---

### TC-09: getFollowUpPrompt も静的 followUpPrompt も未定義の場合、undefined になる
- **Priority**: should
- **Source**: design.md D2

GIVEN step に `getFollowUpPrompt` も静的 `followUpPrompt` も定義されていない  
WHEN executor が ctx を構築する  
THEN `followUpPrompt` は `undefined` である  
AND shouldRunFollowUp は false を返す（follow turn は実行されない）

---

## Category: AgentStep インターフェース — 型定義

### TC-10: AgentStep に getFollowUpPrompt の optional method が追加されている
- **Priority**: must
- **Source**: tasks.md Task 1

GIVEN `src/core/step/types.ts` の `AgentStep` interface を検査する  
WHEN 型定義を確認する  
THEN `getFollowUpPrompt?(state: JobState, deps: StepDeps): string | undefined` が存在する  
AND optional (?) であることが確認できる

---

### TC-11: getFollowUpPrompt は getMaxTurns と同型の optional method である
- **Priority**: should
- **Source**: design.md D1, tasks.md Task 1

GIVEN `AgentStep` interface の `getMaxTurns` と `getFollowUpPrompt` の型シグネチャを比較する  
WHEN シグネチャを検査する  
THEN どちらも `(state: JobState, deps: StepDeps)` を引数に取る optional method である

---

## Category: スコープ外の機構が追加されていないことの確認

### TC-12: 機械的 ADR validator が追加されていない
- **Priority**: must
- **Source**: request.md 受け入れ基準 5

GIVEN 変更されたファイル一覧を確認する  
WHEN `src/core/adr/rules/` 以下または validator 関連のファイルを検索する  
THEN 新規 validator ファイルが存在しない

---

### TC-13: 専用 adr-fixer step が追加されていない
- **Priority**: must
- **Source**: request.md 受け入れ基準 5

GIVEN 変更されたファイル一覧を確認する  
WHEN `adr-fixer` を含むファイル名または step 定義を検索する  
THEN adr-fixer step が存在しない

---

## Category: 既存挙動の維持

### TC-14: adr: false の request では adr-gen が no-op で終わる
- **Priority**: must
- **Source**: request.md 受け入れ基準 4

GIVEN `adr: false` の request で adr-gen step が実行される  
WHEN step が完了する  
THEN ADR ファイルが生成されない  
AND follow-prompt が送信されない（executor に渡る followUpPrompt が undefined）

---

### TC-15: DesignStep の静的 followUpPrompt は引き続き動作する（後方互換）
- **Priority**: must
- **Source**: design.md D1（「DesignStep は静的 followUpPrompt を維持（後方互換）」）

GIVEN `DesignStep` が静的 `followUpPrompt` を持ち、`getFollowUpPrompt` を持たない  
WHEN executor が ctx を構築する  
THEN `followUpPrompt` には静的 `followUpPrompt` の値が採用される  
AND 既存の DesignStep follow-turn 動作が変わらない

---

## Category: ビルド・型チェック

### TC-16: bun run typecheck が green
- **Priority**: must
- **Source**: request.md 受け入れ基準 6, tasks.md Task 5

GIVEN 全変更ファイルを含む状態で  
WHEN `bun run typecheck` を実行する  
THEN 型エラーが 0 件である

---

### TC-17: bun run test が green
- **Priority**: must
- **Source**: request.md 受け入れ基準 6, tasks.md Task 5

GIVEN 全変更ファイルとテストファイルを含む状態で  
WHEN `bun run test` を実行する  
THEN テストが全件 pass する
