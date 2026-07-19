# Spec: reviewer の approved を fixer 予算切れで覆さない

## Requirements

### Requirement: 承認は paired fixer の予算切れで覆らない

reviewer の直近 verdict が `approved` の場合、pipeline は paired fixer の iteration budget を使い切っていても exhaustion による escalation を発火させては**ならない（MUST NOT）**。この不変は standard 経路（`buildReviewerChainTransitions`）と custom/parallel 経路（`buildParallelReviewerTransitions`）の両方で成立**しなければならない（SHALL）**。

#### Scenario: standard 経路で承認が予算切れでも進む

**Given** standard reviewer 構成（`code-review` が `code-fixer` と paired、maxIterations 有限）で、`code-review` が `approved` かつ fixable finding を 1 件以上持ち、`code-fixer` が budget を使い切っている
**When** pipeline が `code-review` の approved を routing する
**Then** escalation せず、`code-review` の clean approved 遷移先（reviewer chain の次段、無ければ `conformance`）へ進む

#### Scenario: custom/parallel 経路で承認が予算切れでも進む

**Given** custom reviewer（parallel 構成）が有効で、`code-review` が `approved` かつ fixable finding を 1 件以上持ち、共用 `code-fixer` が budget を使い切っている
**When** pipeline が `code-review` の approved を routing する
**Then** escalation せず、clean approved 遷移先（coordinator）へ進む

### Requirement: 省略された fixable findings を保持する

予算切れで適用されなかった low/medium の fixable finding を、pipeline は破棄しては**ならない（MUST NOT）**。reviewer が記録した findings と findings 成果物（review-feedback）は参照可能な形で残ら**なければならない（SHALL）**。再 routing は reviewer の StepRun（verdict / toolResult / findingsPath）を上書きしては**ならない（MUST NOT）**。

#### Scenario: 省略後も reviewer の findings が残る

**Given** approved + fixable + 予算切れで観察修正が省略された
**When** pipeline が clean approved 遷移先へ進んだ後
**Then** その reviewer の直近 StepRun の verdict は `approved` のままで、記録された fixable findings（および findingsPath）が保持されている

### Requirement: 任意修正の省略を明示して次工程へ進む

予算切れで観察修正を省略したとき、pipeline はその事実を history と event に明示的に記録**しなければならない（MUST）**。記録は後から原因を追える内容とし、対象 step 名と省略した fixable finding 件数を含ま**なければならない（SHALL）**。黙って省略しては**ならない（MUST NOT）**。

#### Scenario: 省略が history / event に記録される

**Given** approved + fixable + 予算切れで観察修正が省略された
**When** pipeline が clean approved 遷移先へ進む
**Then** history に「任意修正を予算切れで省略した」旨・対象 reviewer step 名・省略した fixable finding 件数を含むエントリが追加され、かつ対応する event（`pipeline:fixer:budget-skipped`）が step 名と件数付きで emit される

### Requirement: needs-fix の予算切れは従来どおり停止する

verdict が `needs-fix` のまま fixer budget を使い切った場合、pipeline は従来どおり escalation し `awaiting-resume` に遷移**しなければならない（SHALL）**。error code・停止メッセージは変更しては**ならない（MUST NOT）**。

#### Scenario: needs-fix 予算切れの escalation は不変

**Given** `code-review` が maxIterations 回とも `needs-fix`（bypass 1 回を含む）で `code-fixer` budget を使い切った
**When** pipeline が exhaustion を判定する
**Then** `CODE_REVIEW_RETRIES_EXHAUSTED` で escalation し、停止メッセージは `code-review did not approve after N iterations` のまま

### Requirement: 停止メッセージは verdict と矛盾しない

`did not approve` を含む停止メッセージは、直近 reviewer verdict が `approved` でない場合にのみ出力され**なければならない（SHALL）**。verdict が `approved` のとき、この文言を含む停止・error を出しては**ならない（MUST NOT）**。

#### Scenario: 承認時に "did not approve" を出さない

**Given** approved + fixable + 予算切れで観察修正が省略された
**When** pipeline が clean approved 遷移先へ進む
**Then** `did not approve` を含む停止メッセージ・error は生成されない
