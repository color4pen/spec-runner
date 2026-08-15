# prompt/rules の新 pipeline 構造への追随: authority 表現統一・実行不能指示の撤去・session 例外・PIPELINE_MAP 更新

## Meta

- **type**: chore
- **slug**: prompt-rules-consistency
- **base-branch**: main
- **adr**: false

## 背景

#991〜#999 の一連の構造変更（test 時系列真実性の解体、Evidence Base 導入、build-fixer / test-materialize の implementer 統合、conformance 正典二層化）で pipeline の実体は更新されたが、agent が読む prompt / rules / PIPELINE_MAP の一部が旧世界の記述のまま残っている。これらは単なるドキュメントではなく agent の実行時入力なので、実体との矛盾は agent の判断を歪める。

具体的な矛盾は 4 点 + 互換穴 1 点:

1. **implementer の authority 表現の矛盾** — system prompt は `tasks.md — 正典（実装の唯一のインプット）` とし spec / design / test-cases を参照情報扱いにしているが、initial message は「test-cases.md と spec を canon(正)として」であり、conformance は既に request/spec = normative、design/tasks = plan の二層で検証している。system prompt だけが旧世界。
2. **実行不能な指示** — implementer prompt は「実装不可能な must TC は commit message に `test_cases_skipped: [TC-ID — 理由]` を記録する」と指示するが、同じ prompt に入る COMMIT_DISCIPLINE が agent の `git commit` を禁止し、executor の commit message format は `<step>: <slug>` 固定。production に `test_cases_skipped` を commit message へ橋渡しする機構は存在しない（参照は当該 prompt 行のみ）。
3. **rules の session 独立性の断言** — 「各 step は独立した agent session として実行される。前の session の文脈を持たない」は、#998 の verification 失敗 → implementer が直前 session を resume する continuation 経路と矛盾する。
4. **PIPELINE_MAP の drift** — bite-evidence 行が欠落。conformance 行は「4 成果物（request / design / tasks / spec）への適合性を検証する」のままで、二層化（request/spec = normative、design/tasks = plan）前の記述。implementer 行は #999 で更新済みなので残りはこの 2 行。
5. **legacy alias の互換穴** — `LEGACY_STEP_ALIASES`（build-fixer / test-materialize → implementer）は `--from` と `resumePoint.step` には適用されるが、hard crash で resumePoint が無く `state.step` にのみ旧 step 名が残る場合（resolve の path 4）には適用されず、`allowed.has()` 不成立で throw する。誤 routing はしないが、旧 job の crash recovery が分かりにくいエラーで止まる。

## 現状コードの前提

- `src/prompts/implementer-system.ts:21` — `\`specrunner/changes/<slug>/tasks.md\` — 正典（実装の唯一のインプット）`。同 59 行に `test_cases_skipped` の commit message 指示
- `src/core/step/implementer.ts:86` — initial message「test-cases.md と spec を canon(正)として、テストと実装の両方を整合させてください」
- `src/prompts/fragments.ts:16-19` — COMMIT_DISCIPLINE: agent の `git add` / `git commit` / `git push` を禁止、executor が `<step>: <slug>` format で一括 commit
- `src/prompts/rules.ts:23` — 「各 step は独立した agent session として実行される。前の session の文脈を持たない（各 step は新規セッションで実行される）」
- `src/prompts/pipeline-map.ts` — 14 行の表。bite-evidence 行なし。conformance 行は「4 成果物（request / design / tasks / spec）への適合性を検証する」
- `src/core/resume/resolve-step.ts` — `LEGACY_STEP_ALIASES` は `from`（path 1）と `resumePoint.step`（path 3）に適用。`stateStep`（path 4）は `allowed.has(stateStep)` を直接判定し alias を通さない
- prompt-skeleton-drift-guard.test.ts の PIPELINE_MAP 検証は全て `toContain(PIPELINE_MAP)` の参照埋め込み（行数・文言の個別 pin なし）。「唯一のインプット」「test_cases_skipped」「前の session の文脈」を pin する既存テストは存在しない
- conformance の正典二層は #992 で確立済み（request/spec = normative、design/tasks = plan）

## 要件

1. **implementer の authority 表現統一** — system prompt の入力ファイル列挙を、conformance の二層および initial message と整合する 4 層に置換する:
   - `request.md` / `spec.md` = 依頼意図の正典（normative）
   - `test-cases.md` = レビュー済みの検証契約
   - `tasks.md` = 実装の作業計画
   - `design.md` = 設計根拠・文脈
   「唯一のインプット」という旧表現を撤去する。authority の実質（テストと実装を test-cases.md / spec に整合させる責務）は変更しない。
2. **test_cases_skipped の実行可能化** — commit message への記録指示を撤去し、完了報告（completion report）への同形式（`test_cases_skipped: [TC-ID — 理由]`）の記録指示に置換する。COMMIT_DISCIPLINE と矛盾する指示を残さない。
3. **rules の session 記述更新** — 「原則: 各 step は独立した新規 session（前の session の文脈を持たない）。例外: verification 失敗後の implementer 再入は、直前の implementer session の continuation として実行される（session が無い場合は fresh session に fallback）」の形に更新する。
4. **PIPELINE_MAP の追随** — bite-evidence 行を追加する（責務例: 「Evidence Base（job 開始時点の実装 + candidate のテスト）上で red→green を機械実行し、テストが変更に噛むことを証明する（CLI step）」）。conformance 行を二層化後の記述（request / spec を normative、design / tasks を plan として適合性を検証する）に更新する。行の並びは実行順に整合させる。
5. **stateStep への legacy alias 適用** — resolve-step.ts の path 4（`stateStep`）にも `LEGACY_STEP_ALIASES` を適用し、resumePoint 無しで `state.step` が build-fixer / test-materialize の場合に implementer へ解決されるようにする。適用は既存の path 1 / path 3 と同じ「alias → member→coordinator 写像 → allowed 判定」の順序に揃える。

## スコープ外

- authority の実質変更（責務・write-scope・遷移の変更は含まない。既決事項への文言追随のみ）
- `test_cases_skipped` を機械で消費する仕組みの新設（記録の実行可能化のみ。消費は将来課題）
- code-fixer の統合判断、bite-evidence の file-set 変更
- issue の close / 整理（operator 作業として別途実施）

## 受け入れ基準

- [ ] implementer system prompt に 4 層の authority 表現が含まれ、「唯一のインプット」が含まれないことをテストで固定する
- [ ] implementer system prompt に commit message への `test_cases_skipped` 記録指示が含まれず、完了報告への記録指示が含まれることをテストで固定する
- [ ] rules 出力に verification 失敗 → implementer continuation の例外記述が含まれることをテストで固定する
- [ ] PIPELINE_MAP に bite-evidence 行が存在し、conformance 行に request / spec = normative の二層記述が含まれることをテストで固定する
- [ ] `state.step = "test-materialize"` / `"build-fixer"`、resumePoint = null、--from なしの resume が implementer に解決されることをテストで固定する（現行は throw）
- [ ] prompt-skeleton-drift-guard / tc-source-contract / resolve-step の既存テストは、design で列挙した更新対象を除き無改変で green
- [ ] `typecheck && test` が green
