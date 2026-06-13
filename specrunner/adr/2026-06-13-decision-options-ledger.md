# decision-needed を構造化選択肢と判断台帳で置き換える

**Date**: 2026-06-13
**Status**: accepted
**Related**: `specrunner/adr/2026-06-01-arch-invariant-enforcement-vitest-ratchet.md`（judge verdict 整備の上位文脈）

## Context

judge step の `decision-needed` finding は escalation を発生させ、人間に `/resume` コメントで応答を求める。しかし人間の判断は自由テキスト（prose）で運ばれていたため、三重の脆弱性を抱えていた。

1. **prose の再解釈揺らぎ**: `/resume` ごとに別の reviewer instance が prose を解釈するため、文面次第でレビューが通ったり通らなかったりした（2026-06-12 #662 で実証）。
2. **決定済み判断の記録不在**: 同一の論点を後続ステップが再報告しても「決定済み」として扱う機構がなく、同一指摘の蒸し返しを防げなかった。
3. **decision-needed の過剰申告**: 「選択肢を提示できない指摘は decision ではない」という機械的な定義がなく、fixable で済む指摘が decision-needed と申告されるケースが観測された。

これを解決するため、decision-needed を「選択肢付きの構造化要求 → 番号指定応答 → 判断台帳への記録 → 判断済み finding の verdict 除外」という一貫したプロトコルに置き換える。

## Decision

### D1: 新規レポートのみ厳密検証し、旧形式は permissive に読む

`src/core/port/report-result.ts` のレポートツール入力アダプタで、`resolution: "decision-needed"` の finding に `options`（`{ label, consequence }` が 2 件以上）がない場合は invalid として拒否し、既存のツールリトライパスに委ねる。型定義（`src/kernel/report-result.ts`）では `Finding.options` を optional に保ち、persisted state および過去の `StepRun.outcome.toolResult` は options なしで読み込める。

**Rationale**: 新規入力を厳密にすることで「選択肢を書けない指摘は decision ではない」という規律を機械的に強制しつつ、既存 state ファイルの読み込みを壊さない。state migration を不要にする。

### D2: finding 同一性を正規化フィールドの決定論的キーで表現する

`src/core/decision/decision-ledger.ts` に純粋ヘルパー `computeFindingKey` を置く。キー構成要素は `step | file | line-or-empty | normalized-title | normalized-rationale`（正規化: trim・空白畳み込み・lowercase）。決定済み判定は `isFindingDecided(step, finding, decisions)` でキー照合する。

**Rationale**: 既存 finding には安定 ID がなく、モデルが生成する ID は信頼できない。決定論的フィンガープリントが最も防御性が高い。rationale をキーに含めることで、同一ファイル+タイトルでも内容が異なる指摘を誤って suppression するリスクを下げる。step をキー先頭に含めることで `isFindingDecided` の step ガード条件（`d.step === step`）は冗長になるが、これは実装段階で除去された。

### D3: 判断台帳を `JobState.decisions` として持つ

`state.json` の `JobState` に `decisions?: DecisionRecord[]` を追加する。各レコードは `id`・`step`・`findingKey`・`finding` スナップショット・`selectedOption`・`resumeComment`・`decidedAt`・`source` を持つ。フィールドを optional にすることで旧 state との後方互換を保つ。

**Rationale**: state 内に持つことで決定台帳と他の job 状態の一貫性が保たれ、別ファイルの同期ずれを起こさない。スナップショットを持つことで将来の resume-context-auto-injection が利用できる。

### D4: `/resume N=M` トークンを prose から分離して解析する

`parseResumeDecisionInput(body)` が `selections: { findingNumber, optionNumber }[]` と `resumePrompt` を返す。`N=M` トークン（N・M は 1 始まりの整数）のみを選択と解釈し、残りは prose としてそのまま `resumePrompt` に渡す。malformed なトークン（`1=`・`0=1` 等）が open decisions のある job に現れた場合は resumption をブロックし、ジョブを awaiting-resume のままにする。

**Rationale**: `/resume` 既存挙動（prose のみ）を壊さず構造選択を追加できる。strict parsing により typo が無音で resume されるリスクを防ぐ。

### D5: escalation 通知に選択肢を描画し、テキストをエスケープする

`buildEscalationComment` が latest escalated step の open decision-needed findings を番号付きで描画し `/resume 1=2 ...` 案内を追加する。finding title・file・rationale・option label/consequence はすべて untrusted plain text として扱い、HTML/Markdown 構造・command spoofing を防ぐためエスケープする（`<`・`>`・`&`・改行を変換）。`*`・`_` 等の Markdown emphasis 文字は cosmetic なため現実装では変換しない（意図的逸脱として記録）。

**Rationale**: モデル制御テキストがコメント本文を二次命令チャネルとして悪用するリスクを低減する。番号による選択は人間が短く入力できる。

### D6: verdict 導出前に決定済み finding をフィルタする

`executor.ts` が `filterUndecidedFindings(step, findings, decisions)` を呼び出し、その結果を `deriveJudgeVerdict` および参照検証に渡す。元の `toolResult.findings` は audit trail としてそのまま state に保存する。

**Rationale**: 判断済み finding を blocking としてカウントしないことで、reviewer が同一論点を再報告しても escalation が再発しない。verdict helper を state-independent に保つため filtering は executor 層で行う。

## Alternatives Considered

### Alternative 1: D1 — options なし decision-needed を fixable に自動降格する

- **Pros**: hard failure を避け、既存の fixer パスに自然に流れる
- **Cons**: reviewer の意図（「これは判断が必要だ」）を黙って変更し、人間の認識なしに fixer に回る
- **Why not**: 却下

### Alternative 2: D1 — `Finding.options` を全 finding で必須にする

- **Pros**: 型が単純になる
- **Cons**: legacy state と旧 toolResult が読めなくなる
- **Why not**: 後方互換要件を満たせないため却下

### Alternative 3: D2 — finding 番号（通知内の index）で照合する

- **Pros**: 即時 `/resume` 解析が簡単
- **Cons**: 後続 reviewer run で番号が変わると安定しない
- **Why not**: 却下

### Alternative 4: D2 — `file` + `title` のみで照合する

- **Pros**: 多少の rationale 変動を許容できる
- **Cons**: 同一ファイル+タイトルで異なる内容の指摘を誤 suppress するリスクが高い
- **Why not**: 却下

### Alternative 5: D2 — モデル生成 finding ID を使う

- **Pros**: 明示的なアイデンティティ
- **Cons**: モデルが別 run で別 ID を出すと照合できず信頼できない。新たなモデル制御フィールドを増やす
- **Why not**: 却下

### Alternative 6: D3 — 判断台帳を別ファイルに保持する

- **Pros**: `state.json` の肥大化を防ぐ
- **Cons**: state との同期ずれが起きうる。小さい台帳に対してプロジェクション管理のコストが不釣り合い
- **Why not**: 却下

### Alternative 7: D4 — `/resume --decision 1:2` 構文を使う

- **Pros**: 明示的で曖昧さが少ない
- **Cons**: request 例（`1=2 2=1`）より冗長で入力コストが高い
- **Why not**: 却下

### Alternative 8: D4 — invalid token を prose として受理する

- **Pros**: 利用者が typo しても resume が通る
- **Cons**: typo で required decision が未記録のまま resume され、意図しない状態遷移を起こす
- **Why not**: 却下

## Consequences

### Positive

- escalation の人間判断が構造化され、prose の書き方による通過/ブロックの揺らぎが消える
- 決定済み finding の蒸し返し escalation がなくなる
- reviewer の decision-needed 過剰申告が schema 検証で機械的に抑制される
- 判断台帳は将来の resume-context-auto-injection の注入対象として再利用できる

### Negative / Known Debt

- reviewer が title・rationale をわずかに変えて再報告した場合、finding key が変わり suppression が効かない。意図的設計（exact semantic suppression の限界を明文化）
- strict validation により rollout 直後は report-result のリトライ頻度が増える可能性がある。`DECISION_NEEDED_DEFINITION` と tool description を同一 change で更新することで緩和する

## References

- Request: `specrunner/changes/decision-options-ledger/request.md`
- Design: `specrunner/changes/decision-options-ledger/design.md`
- Spec: `specrunner/changes/decision-options-ledger/spec.md`
