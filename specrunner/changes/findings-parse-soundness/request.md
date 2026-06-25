# judge の findings/scores パース健全性を回復し、verdict 導出の取りこぼし・誤りをなくす

## Meta

- **type**: bug-fix
- **slug**: findings-parse-soundness
- **base-branch**: main
- **adr**: false

## 背景

pipeline の中核不変条件は「verdict は CLI が agent の findings から機械導出する（agent は自己判定しない）」。この導出が正しく働くには、CLI が agent の構造化出力（findings / scores / file:line 参照）を忠実にパースできることが前提になる。

現在この verdict-bearing channel のパース経路が複数箇所で不健全であり、次の問題が起きている:

- (a) 正常な agent 出力を reject して findings 配列全体を捨てる。CLI は「agent が何も報告しなかった」と解釈し、retry → escalation に落ちて、真の findings と導出 verdict が消失する。
- (b) 同一の agent 出力が runtime によってパース結果が割れる（codex は通るが local / managed は落ちる）。
- (c) dead な scores 経路が緩い数値パースのまま残存している。
- (d) managed の file:line 参照検証が、正当なファイルを指す finding を誤って「存在しない」と棄却しうる。

本 request はこれらを runtime 非依存に塞ぎ、findings の正規化を単一の場所へ集約する。

## 現状コードの前提

- `src/core/port/report-result.ts:162` — `parseFindings` は `if ("line" in f && f["line"] !== undefined && typeof f["line"] !== "number") return { ok: false }` で、いずれかの finding に `line: null` があると findings 配列**全体**を `{ ok: false }` で reject する。
- `src/core/port/report-result.ts:232` — `parseObservations` は `o["line"] !== null` のガードを持ち `line: null` を許容する（同一フィールドで parseFindings と非対称）。
- `src/adapter/codex/strict-schema.ts` の `stripNullDeep` が parse 前に null を再帰除去するため、codex runtime では `line: null` 問題が顕在化しない。この除去は local / managed runtime のパス（`src/core/port/report-result.ts` 経由）には適用されない。
- `src/core/parser/review-scores.ts:24` の `parseReviewScores()` には本番呼び出しが存在しない。verdict は `src/core/step/judge-verdict.ts` の findings 集計で導出され、scores は使われない。`ParsedStepResult.scores`（`src/core/port/step-types.ts`）も populate / consume されない dead フィールドである。
- `src/core/runtime/managed.ts:347-369` — `verifyFindingRefs` は取得したファイル内容を `JSON.parse` し、`Array.isArray` が真なら directory と判定する。内容がトップレベル JSON 配列である正規ファイルを行参照付きで指す finding は `nonExistent` に誤分類される。

## 要件

1. `line: null` を「line 未指定」と同義に正規化し、`parseFindings` が `line: null` を含む finding／配列を捨てないようにする。`parseFindings` と `parseObservations` の `line` 許容を対称にする。
2. 上記正規化を **kernel parser（`src/core/port/report-result.ts`）に一元化**し、runtime 非依存にする。codex adapter の `stripNullDeep` は parser 統合後に削除する（重複と runtime 非対称の解消）。
3. dead な review-scores 経路を削除する: `parseReviewScores`、`ParsedStepResult.scores`、および `src/core/parser/review-findings.ts` / `src/kernel/review-scores.ts` 等の関連重複のうち、削除しても verdict 導出（findings 集計）に影響しないもの。緩い数値パース（total 正規表現 / parseFloat）の厳格化は行わない（経路ごと削除するため）。
4. managed `verifyFindingRefs` の「トップレベル JSON 配列ファイル = directory」誤判定を修正し、行参照付き finding が正当なファイルを指す場合に `nonExistent` へ落とさないようにする。

## スコープ外

- credential 封じ込め（B-6 の subprocess/SDK env、別 request）。
- verdict 導出ロジック自体（`judge-verdict.ts` の集計規則）の変更。本 request は findings の**読み取り／正規化**のみを直す。
- runtime 間のその他の非対称（managed signal handler の interruption journal 等）。
- `report-tool` の findingSchema（zod）定義変更。`line` は `optional(number())` のまま。

## 受け入れ基準

- [ ] `line: null` を含む findings 配列が local / managed / codex の全 runtime で正しくパースされ、findings が保持されることをテストで固定する。
- [ ] `parseFindings` と `parseObservations` の `line` 許容が対称であることをテストで固定する。
- [ ] codex の `stripNullDeep` 削除後も codex runtime で findings が保持されることをテストで固定する。
- [ ] review-scores 経路の削除後、judge / review step の verdict 導出が findings 集計のみで不変であることを既存テストで担保する（削除による退行なし）。
- [ ] managed `verifyFindingRefs` がトップレベル JSON 配列ファイルへの行参照付き finding を `nonExistent` に落とさないことをテストで固定する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- findings の null 正規化は adapter でなく **kernel parser に置く（single source of truth）**。却下案: 各 adapter で個別正規化（現状の codex `stripNullDeep`）。runtime ごとに正規化が散り、同一 agent 出力が runtime 依存で割れる非対称バグの再発源になるため却下。
- `line: null` は reject でなく **「line 欠落」と同一視**して finding を保持する。却下案: 厳格に reject（現状）。LLM が optional numeric field に `null` を出すのは正常な JSON 出力であり、それで findings 全体を落とすと verdict 導出の入力が失われるため却下。
- 緩い review-scores パースは厳格化でなく **経路削除**で解消する。却下案: 厳格化。経路自体が dead（本番 reader 無し）で verdict は findings 集計から導出されるため、保守対象を残すより削除が適切。
- 外部制約: `line` は `report-tool` の findingSchema で `optional(number())`。LLM の JSON 出力は optional numeric に `null` を含めることが一般的なため、parser は `null` を欠落と同一視する必要がある。
