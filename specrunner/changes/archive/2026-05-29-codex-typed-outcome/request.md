# codex adapter を typed outcome 対応に解除する（contract 準拠 / frozen 解除）

## Meta

- **type**: spec-change
- **slug**: codex-typed-outcome
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

contract（R2 型 / R3 cutover）が main 済み。**codex adapter は frozen で `report_result` を無視し、`toolResult` を常に `null` にしている**（`src/adapter/codex/agent-runner.ts:11,180,206...`）。R3 後は codex の step が null-toolResult として degrade（judge→needs-fix / producer→completionVerdict）で進むだけ。

本 request は codex を claude-code / managed と同じく **typed outcome を返すよう frozen 解除**し、contract 準拠にする。R4 とは触る場所が disjoint（`codex/` 配下のみ）で **並行可能**。

**重要なリスク/前提**: codex SDK（`@openai/codex-sdk`）の custom tool 対応は agent-runner.ts:11 で **"Codex SDK custom tool support TBD"** と明記されている。実装可否が SDK 依存なので、**design 段でまず SDK の custom tool / structured output 機構を確認**し、**サポートが無ければ escalation**（無理な hack はしない）。

design authority は `contract/step-outcome.md`。なお frozen behavior は spec `specrunner/specs/tool-driven-step-completion/spec.md` の「Codex adapter の frozen behavior」MUST 要件（toolResult を常に null で返す）として明文化されているため、**その解除は spec-change** であり、要件を削除/置換する delta spec が必要（review #1/#2 反映）。

## 要件

1. **codex SDK の custom tool 対応を design で確認**: `report_result`（per-class typed outcome）を codex セッションで授受できるか。
2. **サポートあり → frozen 解除**: claude-code / managed と同様、report_result を登録し tool 呼び出しを捕捉、`step.reportTool.parseInput` で typed outcome（producer `status` / judge `approved` / code-review `fixableCount`）に parse して `toolResult` に載せる。`toolResult: null` 固定をやめる。**併せて tool-driven-step-completion の delta spec を生成し、「Codex adapter の frozen behavior」MUST 要件を削除/置換する**（delta path: `specrunner/changes/codex-typed-outcome/specs/tool-driven-step-completion/spec.md`）。
3. **サポート無し → escalation**: 報告し判断を仰ぐ。null degrade 据え置き or 代替経路を別途検討。**無理な実装はしない**（degrade は contract の「JSON 来ない→次へ」で安全側に倒れているため、放置しても壊れない）。
4. codex の既存テスト（`tests/adapter/codex/agent-runner.test.ts` 等）を更新。`bun run typecheck && bun run test` が green。

## スコープ外

- claude-code / managed adapter（claude-code は実装済み、managed は別途要否確認）。
- executor / transition / 契約本体（変更なし。codex を contract に寄せるだけ）。
- R4（prose 削除 / arch test）—— 別 request、disjoint で並行。
- `contract/` 配下の編集（out-of-loop な authority）。

## 受け入れ基準

- [ ] codex SDK の custom tool 対応可否が design で確認されている
- [ ]（対応可）codex が report_result を授受し、typed outcome（`status` / `approved` / `fixableCount`）を `toolResult` に載せる
- [ ]（対応可）codex の `toolResult: null` 固定が解除され、claude-code / managed と同契約になっている
- [ ]（対応不可）escalation され、degrade 据え置きの判断が記録されている
- [ ]（対応可）tool-driven-step-completion の「Codex adapter の frozen behavior」要件を削除/置換する delta spec が生成されている
- [ ] codex の既存テストが更新され、`bun run build && bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **contract 準拠の runtime follow-on（type: spec-change）**: 契約（contract/）は claude-code で実証済み。codex を同じ契約に寄せる。frozen behavior が tool-driven-step-completion spec の MUST 要件として明文化されているため、その解除は spec-change（delta spec で要件を削除/置換）。設計判断自体は contract/ に既出（adr: false）。
- **R4 と並行可能**: 触る場所が `codex/` 配下のみで disjoint。
- **SDK 制約に正直に**: codex SDK の custom tool 対応が TBD なので、サポート前提を design で検証し、無ければ escalation。無理な実装はしない（degrade は安全側）。
- **`contract/` は編集対象にしない**: 契約を消費（codex で実装）するだけ。
