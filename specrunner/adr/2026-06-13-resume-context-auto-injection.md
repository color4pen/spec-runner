# resume 時の再開コンテキストを state から自動生成し、素の resume を常に正しくする

**Date**: 2026-06-13
**Status**: accepted
**Related**: `specrunner/adr/2026-06-07-resume-point-as-canonical-source.md`、`specrunner/adr/2026-06-13-decision-options-ledger.md`

## Context

escalation 後の resume では、同じ step を再実行する agent が二重の証拠を見やすい。resume されたセッションは前回 attempt の完了報告を記憶しており、worktree には前回 attempt の成果物が残るため、再実行の意図である「再判定」「作業継続」が人間の補足なしでは伝わりにくい。

これまでは `--prompt` や `/resume` コメントに、前回 attempt の回数・verdict・停止理由・再開意味論を人間が prose で毎回書き足していた。しかしこの内容は state に既にある情報から決定論的に復元できる。人手の prose に依存すると、文面差で挙動がぶれる、注入漏れに気づきにくい、resume の正しさが運用に依存する、という問題が残る。

resume の人間由来 prompt は既存の one-shot `resumePrompt` 経路で adapter に渡されている。一方で、resume 時の自動コンテキスト自体は存在せず、素の resume は前回文脈の説明を持たないまま起動していた。

## Decision

### D1: resume 時の自動コンテキストは `StepExecutor` で state から組み立てる

再開コンテキストは、resume command が準備した `resumeContext` snapshot と `JobState` を入力にして、`StepExecutor` 側で決定論的に生成する。自動コンテキストは既存の `resumePrompt` フィールドに載せ、adapter 側の注入機構は変更しない。

**Rationale**: step 実行時点では、どの step が再開対象か、前回 attempt の outcome が何か、どの resume metadata を見せるべきかが確定している。executor に寄せることで、resume のライフサイクル管理と prompt 合成を同じ責務境界に置ける。

### D2: 自動コンテキストは state-backed の決定論的テンプレートとする

生成内容は、当該 step の attempt 回数、前回 attempt の verdict、停止理由、前回成果物が worktree に残りうるが完了を意味しないこと、という固定要素で構成する。LLM による要約、worktree の再走査、時刻依存の推論は行わない。

**Rationale**: resume の意味論は state に既に保存された事実だけで足りる。決定論的に生成すれば、素の resume でも同じ state から同じ prompt が出る。

### D3: 人間由来の resumePrompt は補足として追記する

`--prompt` や `/resume` コメント由来の prose は、自動コンテキストの後ろに補足として付ける。自動コンテキストが無い場合は従来どおり human prompt 単体を渡して後方互換を保つ。

**Rationale**: 人間の意図は有用だが、resume の正しさはそれに依存させるべきではない。機械的に必須の意味論を先に固定し、その後に operator の補足を載せるのが安定する。

### D4: 将来の state-backed section を差し込める小さな builder 構造を残す

自動コンテキストは単一の文字列連結に閉じず、state-backed section を並べる builder 構造として実装する。将来 `decision ledger` のような判断記録が state に追加された場合は、同じ枠組みに section を足せる。

**Rationale**: resume context は今後も state の投影として増える可能性が高い。拡張点を先に用意しておけば、adapter 契約を変えずに section だけを追加できる。

## Alternatives Considered

### Alternative 1: 人間が prose を書く運用を維持する

- **Pros**: 実装変更が不要
- **Cons**: 手書き依存のまま、表現差・注入漏れ・運用負担が残る
- **Why not**: resume の正しさを人間の文面に委ねる設計は脆い

### Alternative 2: resume.ts で自動コンテキストまで合成する

- **Pros**: command 層で完結する
- **Cons**: step ごとの outcome と prompt の最終形を組み立てる責務が command に寄りすぎる
- **Why not**: step 実行時に必要な情報は executor の方が直接持っている

### Alternative 3: adapter 側で resume context を生成する

- **Pros**: prompt injection に近い場所で完結する
- **Cons**: runtime ごとの差分が増え、resume の意味論が adapter に漏れる
- **Why not**: adapter 注入機構は既存の one-shot 経路のまま維持する方が境界が明確

### Alternative 4: 生成した resume context を state に書き戻す

- **Pros**: 生成結果を再利用できる
- **Cons**: deterministic projection が mutable source of truth になる
- **Why not**: state は元データだけを持ち、prompt はそこから都度導出する方が整合的

### Alternative 5: LLM に前回文脈を要約させる

- **Pros**: prose としては読みやすくなる可能性がある
- **Cons**: 非決定的で、resume の意味論がモデル出力に依存する
- **Why not**: 再開の説明は要約ではなく、state にある事実の投影で足りる

## Consequences

### Positive

- 素の resume でも、再開対象 step の attempt 回数・前回 verdict・停止理由・再開意味論が agent prompt に入る
- human prompt がある場合も、自動コンテキスト + 補足 prose の両方を安定して渡せる
- resume の意味論が state に束ねられ、手書き文面によるばらつきがなくなる
- 自動コンテキストの section 構造を拡張しやすくなる

### Negative

- executor に prompt 合成ロジックが増える
- resume prompt の表層がより構造化されるため、既存の prompt equality 系テストは containment ベースへ寄せる必要がある
- state の内容が不完全な場合は `unknown` のような明示値を返す必要がある

## References

- Request: `specrunner/changes/resume-context-auto-injection/request.md`
- Design: `specrunner/changes/resume-context-auto-injection/design.md`
- Spec: `specrunner/changes/resume-context-auto-injection/spec.md`
- Related: `specrunner/adr/2026-06-13-decision-options-ledger.md`
- Related: `specrunner/adr/2026-06-07-resume-point-as-canonical-source.md`

