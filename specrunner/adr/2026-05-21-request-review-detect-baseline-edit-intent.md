# Request Review: Intent ベース検出への抽象化 — Verb 列挙の Patchwork からの脱却

**Date**: 2026-05-21
**Status**: accepted
**Issue**: #299, #349

## Context

PR #294 で `request-review-system.ts` に authority path 直接編集の HIGH finding 検出ルールが実装された（ADR: `2026-05-19-prevent-authority-path-in-request-body.md`）。

しかしその検出条件は **edit verb の列挙** に依存していた:

```
edit verb = MODIFIED, ADDED, "を更新", "を作成", or equivalent
```

### 観測連鎖 (issue #299, #349)

列挙外の表現が繰り返し素通りし、implementer が authority spec 直接編集を試みて pipeline halt となる事故が 6 件発生した。

直近観測ケース（2026-05-20, `merged-to-archive-consolidation` request）:

```markdown
#### PR #347 で漏れた箇所の整合 (= 網羅必須)
- L397: `request ls   active 配下` → `request ls   drafts 配下`
- L399: `request rm <slug>   active 配下から削除` → `drafts 配下から削除`
design agent は cli-commands/spec.md を全行 grep して `active` / `merged` の言及が残らないことを確認する。
```

- `cli-commands/spec.md`（authority path）への言及あり
- `MODIFIED` / `ADDED` / `を更新` / `を作成` は明示されていない
- `L397: A → B` 形式の書き換え指示と「全行 grep して確認」は **edit verb 列挙の外側**
- reviewer は 2 回の review で LOW として approve → implementer が直接編集 → pipeline halt

### 構造的根本原因

検出条件を verb 列挙に固定すると:

1. 列挙にない表現（行番号指定 / 矢印書き換え / grep 命令 / completeness 要求 / 確認依頼等）は素通り
2. 新しい書き方が発生するたびに verb を追加する patchwork が累積する
3. patchwork は pattern matching に最適化された agent の死角を生み続ける（`[[feedback-avoid-patchwork]]`）

根本問題は「**何が edit intent か**」を verb の出現で定義しようとしていること。LLM reviewer が持つ意味理解能力を活用すれば、verb 列挙なしに intent を判定できる。

## Decision

### 1. Intent ベース 3 分類への抽象化

`request-review-system.ts` Step 2 の検出条件を **edit verb 列挙から intent 判定** に書き換える。

reviewer agent は authority path 言及を検出した際、その言及の intent を以下の 3 分類で判定する:

| Intent 分類 | 説明 | HIGH 判定 |
|------------|------|----------|
| **Reference/mention** | read-only 参照、policy statement、過去 incident 引用 | なし |
| **Design reflection via delta spec** | delta spec 経由での変更意図 | なし |
| **Direct operation** | baseline を直接編集・書き換える意図 | **HIGH** |

### 2. 具体 Pattern の列挙を排除

`L397: A → B` のような行番号指定、矢印記法、grep 命令、completeness 要求、「全行確認」等の具体 pattern は prompt 内に **列挙しない**。

LLM reviewer の言語理解に委ねることで、未知の書き方が出現しても対応できる。pattern を列挙すると agent が列挙を pattern matching のショートカットとして使い、列挙外パターンへの感度が低下する。

### 3. 既存 Exception の維持

既存の除外節（authority path を forbidden として記述する policy statement / 過去 incident citation は HIGH 対象外）は維持し、intent 分類の「Reference/mention」に包含させる。

### 4. HIGH finding recommendation の整備

直接操作 intent を検出した際の recommendation に以下を含める:

- authority spec は `specrunner finish` の spec-merge が delta から自動更新する
- PR 内では baseline は read-only
- delta spec で Requirement を書き、baseline 状態は AC の grep assertion 等で **結果として** 検証する

## Alternatives Considered

### A: verb 列挙を拡張し続ける（patchwork 継続）

`L[0-9]+:` パターン、`→` 記法、「全行 grep」等を列挙に追加する。

Rejected:
- 根本原因（verb 列挙依存）を解消しない。新しい書き方が出るたびに再び対応が必要になる。
- 観測連鎖が示す通り、起票者が毎回異なる表現で同じ意図を書くため、列挙の完全性を保証できない。
- `[[feedback-avoid-patchwork]]`: 応急処置 3 回で設計を疑う原則に反する。

### B: dsv 拡張（`request validate` コマンドへの正規表現検出追加）

`src/core/spec/rules/` に request body 内の authority path 言及パターンを静的に検出する rule を追加する。

Rejected:
- `request validate` は構造的妥当性（frontmatter, type, slug）の責務。意味的 intent 判定は別責務（スコープ外）。
- 正規表現では「参照」と「直接操作意図」の区別が困難（コンテキスト依存）。LLM が既に読んでいる情報を二重 parse する必要がない。
- intent ベース判定の補完として将来追加する余地はあるが、本件の根本対策にはならない。

### C: intent 判定と verb 列挙の並存

新しい intent ルールを追加しつつ、既存の verb 列挙も残す。

Rejected:
- agent が列挙を pattern matching のショートカットとして使い、intent 判定の精度が下がるリスクがある。
- 判定ロジックが分散し、メンテナンス性が低下する。
- intent 判定が verb 列挙の上位互換であるため、並存させる理由がない。

## LLM 不確定性への根本対策の姿勢

`[[feedback-llm-uncertainty-principle]]`: **根本対策は「agent が判断する場面を消す」**。verb 列挙はその逆方向——agent が判断できなくなるように制約を強めている。

本 ADR の判断は逆方向: **agent の判断能力を最大限活用する** 方向で設計する。具体 pattern の列挙は agent の汎化能力を削ぐ。「直接操作 intent か否か」という問いは、LLM が自然言語で判断するのに適した問いであり、正規表現や verb 列挙よりも高い汎化性を持つ。

pattern 列挙を排除することで:
- 未知の表現形式に対する robustness が向上する
- patchwork ループから脱却できる
- 起票者が意図せず edit intent を書いた場合でも catch できる

## Consequences

### Positive

- 行番号指定 / 矢印記法 / grep 命令 / completeness 要求等、列挙外パターンがすべて catch 対象になる
- 新しい書き方が出現しても prompt 修正不要
- issue #299 / #349 観測連鎖で繰り返された同型事故を構造的に防止できる

### Negative

- LLM 判断は決定論的でないため、境界ケース（referential か direct operation か）で誤判定のリスクがある
- false positive（read-only 参照を HIGH と判定）が発生する可能性がある。ただし既存の除外節が主要な境界ケースをカバーしている

### Known Design Debt

- dsv 拡張（静的検出）は未実装。LLM 検出の補完として将来追加する余地がある（ADR: `2026-05-19-prevent-authority-path-in-request-body.md` と同じ既知負債）

## Files Changed

| File | Change |
|------|--------|
| `src/prompts/request-review-system.ts` | MODIFIED: Step 2 の検出条件を intent 3 分類に書き換え、verb 列挙を削除、recommendation 文を整備 |
| `tests/unit/command/request-review.test.ts` | MODIFIED: TC-RR-011/012 を新設計に追従、TC-RR-013/014 追加（intent 3 分類 / verb 非列挙 / recommendation 検証） |
| `specrunner/changes/request-review-detect-baseline-edit-intent/specs/request-authoring-guard/spec.md` | NEW delta spec: Requirement を intent ベース検出に整合 |
