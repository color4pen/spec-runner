# ADR-20260526: approved + observation を auto-fixer で消化する pipeline 拡張

**Date**: 2026-05-26
**Status**: accepted

## Context

PR #402 / #403 の事後 audit で **二重 review 問題**が観察された。reviewer が `approved` verdict を出しつつ non-blocking な observation / finding を残すケースが頻出し（PR #402: finding 3 件 / PR #403: finding 4 件）、それらが残置のまま finish に流れて skill `acceptance-and-issue-audit` で後追い fix する二重作業が発生していた。

```
問題のある pipeline 状態:
reviewer → needs-fix → fixer → reviewer → ... loop
reviewer → approved (+ observation 残置) → finish
                       ↑ 無視される / 後追い skill で修正 → 二重作業
```

「approve + observation 残置」という中間状態は semantically 曖昧であり、`approved` (完全終了) / `needs-fix` (修正必要) の 2 値で表現できるはずだった。この曖昧さを構造的に解消し、1 PR 内で observation を自動消化して完結させるための pipeline 拡張が必要となった。

同時に、reviewer 出力の score table を CLI が parse して verdict を再計算する既存ロジックが LLM uncertainty（score table 書き忘れ等）の主要源となっており、これも構造的に解消する必要があった。

## Decision

以下 4 つの判断を連携させて実現する。

### D1: `approved-with-fixes` を新 Verdict として Verdict union に追加する

**採用案**: `code-review` の `parseResult` 内で finding の `Fix: yes` 件数を判定し、新 verdict `approved-with-fixes` を返す。transition table で `code-review --approved-with-fixes→ code-fixer` を追加する。

```
# 追加 transition:
code-review --approved-with-fixes→ code-fixer
code-fixer --approved→ delta-spec-validation  (when: 直前 code-review verdict === "approved-with-fixes")
```

**却下案 B**: 既存 `approved` verdict のまま、transition table の `when` predicate で finding 有無を判定して分岐する。

**理由**:
- `approved-with-fixes` という verdict 名で transition table が self-documenting になる（`on: "approved-with-fixes"` で意図が明確）
- `when` predicate は pipeline state 依存の context-aware routing（「このステップを通過済みか」）に使うべきであり、step 出力の意味的分岐（「observation が残っているか」）は verdict 側で表現するのが自然
- code-fixer 出口の「直前 review verdict を state から参照して遷移先を分岐」がシンプルに書ける

**fixer 出口の 4 ケース**:

| 直前 review verdict | fixer 結果 | 次のステップ |
|---|---|---|
| approved-with-fixes | success | delta-spec-validation（再 review に戻らない） |
| approved-with-fixes | failed | escalate |
| needs-fix | success | code-review（既存 loop、変更なし） |
| needs-fix | failed | escalate（変更なし） |

### D2: `Fix` カラムを reviewer 出力の必須フィールドとし、agent が修正可否を判定する

**採用案**: reviewer 出力 `review-feedback-NNN.md` の `## Findings` table に `Fix` カラム (`yes` / `no`) を追加し、**agent (reviewer) が finding ごとに修正すべきか否かを判断して出力する**。CLI は `Fix: yes` 件数のみを count し、verdict 昇格の判定に使う。

**却下案**: CLI が severity rule（HIGH = 必修 / LOW = 無視）で `fix: true/false` を自動判定する。

**理由**:
- agent の個別判断（「pre-existing issue」「設計判断による意図的選択」「別 scope の問題」）を severity rule では表現できない
- CLI 自動判定は agent の意図を上書きする → agent uncertainty の原因を移動するだけ
- agent が判断した `Fix` カラムの値をそのまま使うことで、CLI の判定ロジックを simplify できる

**後方互換**: `Fix` カラムが見つからない場合は `parseFixableFindings()` が 0 を返し、`approved` のまま finish に進む（既存挙動と同等、安全側に倒れる）。

### D3: 既存 fixer を単一処理で再利用、出口遷移のみ verdict ベースで分岐する

**採用案**: fixer の処理ロジックは変更せず（単一処理）、`fixer` 出口の transition table で「直前 review verdict が何であったか」を `when` predicate で参照して遷移先を分岐する。

**却下案**:
- 新規 `observation-fixer` step を追加する → step 定義 / prompt / STEP_NAMES / fixer pair の重複が発生、認知負荷増加
- fixer に `mode: "observation" | "needs-fix"` flag を追加する → fixer 内部分岐が増え、処理の単一性を壊す

**理由**:
- fixer の責務は「`Fix: yes` の finding を消化する」であり、その finding が `needs-fix` 由来か `approved-with-fixes` 由来かは関係ない
- 処理の違いは「次にどこへ行くか」だけであり、これは transition table が最も自然に表現できる層
- YAGNI: 同一処理で解決できる問題に新規 step / mode flag を追加するのは過剰

### D4: CLI 側の score 計算を廃止し、agent verdict をそのまま採用する

**採用案**: `determineVerdict()` を廃止し、`parseResult` を「`parseReviewVerdict()` + `parseFixableFindings()` のみで verdict を決定する」構造に簡素化する。score table は CLI の判定材料に使わない。

```typescript
// 新しい判定ロジック (簡素化後)
if (agentVerdict === "escalation") verdict = "escalation";
else if (agentVerdict === "approved" && fixCount > 0) verdict = "approved-with-fixes";
else verdict = agentVerdict ?? "escalation";
```

**却下案**: score table parse を維持し、score が閾値を下回る場合に verdict を override する。

**理由**:
- score table の format 遵守は LLM uncertainty の主要源（書き忘れ / format 違反）
- CLI が score で verdict を再計算することは「agent 自身の判断を CLI が上書きする」構造であり、D2 の「agent 判断を信頼する」方針と矛盾
- `determineVerdict()` の廃止により CLI の判定ロジックが大幅に simplify される
- score table は agent の思考補助として prompt から削除せず、任意で出力できる（CLI は無視するだけ）

## Alternatives Considered

### A1: `approved-with-fixes` ではなく transition `when` predicate で finding 有無を判定する（D1 代替 B）

`code-review --approved→ code-fixer` の transition に `when: (state) => hasFix(state)` を追加し、既存 `approved` verdict を維持する案。

- **Pros**: Verdict union に新 literal を追加しない。既存コードへの型影響が最小
- **Cons**: `approved` が 2 つの異なる意味（observation あり / なし）を持つことになる。transition table の意図を読むために `when` predicate の中身まで確認する必要がある。`when` predicate の責務（pipeline state 参照）と step 出力の意味的分岐（finding 有無）が混在する
- **Why not**: semantic clarity と self-documenting な transition table を優先して D1 を採用

### A2: observation 専用の `observation-fixer` step を新設する（D3 代替）

`needs-fix` 由来の fixer とは別に、`approved-with-fixes` 専用の fixer step を追加する案。

- **Pros**: pipeline の flow が step 名で自己説明的になる。state ファイル上で 2 つの fixer 実行が区別できる
- **Cons**: prompt / STEP_NAMES エントリ / fixer pair が重複する。「observation の修正」と「needs-fix の修正」は同一の処理（`Fix: yes` finding を消化する）であり、step 分離に意味論的根拠がない
- **Why not**: 同一処理に 2 つの実装を持つことは YAGNI であり、認知負荷と保守コストを増やす

### A3: fixer に `mode` flag を追加して内部分岐する（D3 代替）

既存 fixer に `mode: "observation" | "needs-fix"` のような flag を追加し、`approved-with-fixes` 由来の場合はモードを切り替えて動作させる案。

- **Pros**: step を増やさずに `needs-fix` と `approved-with-fixes` の扱いを分けられる。fixer 内部で mode ごとの細かい差異（例: prompt の微調整）に対応しやすい
- **Cons**: fixer の責務が「`Fix: yes` の finding を消化する」単一処理であり、mode ごとに処理を変える実質的な必要性がない。flag の導入は将来 mode が増えるたびに分岐が増える設計になる。transition table の `when` predicate で出口を分岐すれば mode flag は不要
- **Why not**: 処理の唯一の違いは「次にどこへ行くか」であり、これは fixer 内部ではなく transition table が担うべき責務。flag は YAGNI

### A4: severity rule で `fix: true/false` を CLI 自動判定する（D2 代替）

### A4: severity rule で `fix: true/false` を CLI 自動判定する（D2 代替）

CLI が `HIGH severity → fix: true / LOW severity → fix: false` のルールで修正対象を自動判定する案。

- **Pros**: reviewer が `Fix` カラムを書き忘れても機能する
- **Cons**: severity は問題の「重大度」を表すが、「この PR で修正すべきか」という判断とは独立している（HIGH でも pre-existing issue なら修正不要、LOW でも仕様未充足なら修正必要）。agent の個別判断が CLI ルールで消される
- **Why not**: D2 で採用した「agent 判断を信頼する」方針と構造的に矛盾。agent の意図尊重を優先

## Consequences

### Positive

- `approved + observation` が残置のまま finish に流れる二重作業が構造的に解消される
- skill `acceptance-and-issue-audit` の主要責務（observation の後追い fix）が pipeline 内で完結し、別途実行する必要がなくなる
- CLI の verdict 判定ロジックが簡素化され、LLM uncertainty（score table 書き忘れ）の主要源が構造的に除去される
- fixer の処理が単一のまま維持されるため、既存の needs-fix loop に regression が発生しない
- `Fix` カラムの後方互換設計（カラムなし → 0 件扱い → 既存挙動）により、旧形式の review-feedback に対しても安全に動作する

### Negative

- `approved-with-fixes` という新 verdict が Verdict union に加わるため、verdict を exhaustive に処理している箇所（switch 文等）は更新が必要になる
- reviewer が `Fix` カラムを出力し忘れた場合、observation は silent に無視されて finish に進む（`Fix: no` と同等の挙動）。旧来の score-based 判定と比べると、agent 出力への依存度が上がる
- `approved-with-fixes` 由来の fixer iteration は `fixerIters` counter を共有するため、needs-fix loop で fixer を多く消費した場合に `approved-with-fixes` 段階でのfixer 起動が budget 不足になる可能性が理論上存在する

### Known Debt

- **skill `acceptance-and-issue-audit` の完全廃止**: 本 ADR で主要責務が pipeline 内に取り込まれるが、skill 自体の廃止 / 責務再定義は別 request で扱う
- **reviewer が `approved-with-fixes` を直接 verdict として書くべきか**: 現状は agent が `approved` を書き、CLI が `Fix: yes` 件数で `approved-with-fixes` に昇格させる設計。agent 側から `approved-with-fixes` を直接書かせる設計への移行は将来検討
- **fixer iteration budget の共有**: `needs-fix` 由来と `approved-with-fixes` 由来の fixer が budget を共有する問題は、iteration budget を phase ごとに独立させる設計変更で解決できるが本 ADR の scope 外

## References

- Request: `specrunner/changes/observation-auto-fix/request.md`
- Design: `specrunner/changes/observation-auto-fix/design.md`
- Related: `specrunner/adr/2026-04-30-code-review-fixer-agent-design.md`（code-review / code-fixer 基本設計）
- Related: `specrunner/adr/2026-05-25-delta-validation-post-code-review.md`（`Transition.when` predicate の先行導入）
- Related: `specrunner/adr/2026-04-29-spec-fixer-iteration-loop.md`（pipeline loop primitive の確立）
- Related: PR #402, #403（二重 review 問題の観察起点）
