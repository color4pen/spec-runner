# request review に「baseline 直接編集の *意図* を catch する」観点を追加する (= edit verb 列挙への依存を抽象化)

## Meta

- **type**: spec-change
- **slug**: request-review-detect-baseline-edit-intent
- **base-branch**: main
- **adr**: true

## 背景

`src/prompts/request-review-system.ts` の Step 2 / Severity に **「authority path + edit verb の co-occurrence」を HIGH** とする検出が既に入っている (= L31, L50)。

ただし edit verb の列挙は限定的:
```
edit verb = MODIFIED, ADDED, "を更新", "を作成", or equivalent
```

実際の運用で **edit verb を経由しない直接編集意図** が catch されないケースが発生:

### 観測ケース (= 2026-05-20)

`merged-to-archive-consolidation` request 起票時、私 (= 起票者) が要件 6 で:

```markdown
#### PR #347 で漏れた箇所の整合 (= 網羅必須)
- L397: `request ls   active 配下` → `request ls   drafts 配下`
- L399: `request rm <slug>   active 配下から削除` → `drafts 配下から削除`
- ...
design agent は cli-commands/spec.md を全行 grep して `active` / `merged` の言及が残らないことを確認する。
```

と書いた。

- baseline path (= `cli-commands/spec.md`) への言及あり
- だが edit verb (= MODIFIED / ADDED / 更新 / 作成) は明示的には存在しない
- **「L397: A → B」形式の書き換え指示** は edit verb 列挙の外側
- **「全行 grep して言及が残らない確認」** も同様

→ reviewer は 2 回の review で LOW で approve、HIGH catch なし。
→ implementer が baseline 直接編集を試みて pipeline halt (= authority spec lifecycle 違反)。
→ 同型事例の 6 件目 (= issue #299, #349 観測連鎖)。

### 観測連鎖から得た構造的洞察

検出条件を「edit verb 列挙」に固定すると、列挙にない pattern (= 行番号指定 / 矢印書き換え / grep 命令 / completeness 要求等) は素通り。**新しい書き方が出るたびに verb を追加する patchwork** が累積する (= [[feedback-avoid-patchwork]])。

根本対策は「**baseline の状態を直接操作する意図全般を catch する**」抽象化 — verb 列挙ではなく **intent** で判断する。

## 思想

### intent ベースの検出

reviewer agent (= LLM) の判断能力を活用し、**baseline path 言及がある時点で「読み取り / 言及」「設計反映 (= delta 経由)」「直接操作 (= edit)」のどれに該当するか agent に判断させる**。直接操作 intent は HIGH。

具体 pattern (= 行番号指定 / `→` 書き換え / grep 命令 / 全行整合要求等) は **列挙しない** (= 列挙すると pattern matching に最適化されて柔軟性が落ちる、新しい書き方が出るたびに verb を追加する patchwork ループに戻る)。

### Exception の維持

既存の Exception (= 「authority path を forbidden として記述する policy statement / 過去 incident 引用は HIGH 対象外」) は維持。新しい intent 判定でも同じ exception を適用。

## 要件

### 1. `request-review-system.ts` の Step 2 検出条件を抽象化

`src/prompts/request-review-system.ts` の Step 2 (= Request Validation) と Severity Scope Constraint で、authority path 言及の検出条件を **edit verb 列挙から intent 判定** に書き換える。

期待する文意:
- request body が `specrunner/specs/<capability>/spec.md` (= baseline / authority spec) への言及を含む場合、reviewer は agent としてその言及の intent を判定する
- intent が「直接編集 / 直接書き換え / 直接操作」の場合は HIGH finding として report
- 既存 Exception (= forbidden 記述 / 過去 incident citation) は維持

具体 pattern の列挙は **避ける** (= agent の判断に委ねる、verb 列挙の patchwork 累積を断つ)。

### 2. HIGH finding の recommendation 文を整合

検出時の recommendation として、reviewer が以下に相当する助言を返すよう prompt を整備:
- authority spec は finish の spec-merge が delta から自動更新する
- PR 内では baseline は read-only
- delta spec で Requirement を書き、baseline 状態は AC の grep assertion 等で **結果として** 検証する形にする

### 3. capability spec の delta

`request-authoring-guard` capability (= 既存、`request-review-system.ts` の Detection Rule が含まれる) の delta spec で Requirement を整合する。**新規 capability を並立させない** (= 重複を避ける)。

delta の Requirement header は baseline と完全一致させる (= tool が MODIFIED として自動分類する条件)。

**規律遵守**: baseline (= `specrunner/specs/request-authoring-guard/spec.md`) は **PR 内で read-only**。本 request では一切編集対象として扱わない。authority spec の更新は finish の spec-merge tool が delta から自動的に行う。

### 4. test

影響する test:
- `tests/unit/command/request-review.test.ts` (= 既存、TC-RR-011 / TC-RR-012 が現行 Detection Rule をカバー、本 request の抽象化に追従して update)
- 新規再現 test (= 観測ケースの request 文面を fixture として、reviewer prompt が HIGH catch する想定の static assertion)

### 5. 再現 test

- 観測ケース風の文面 (= 「`L555: A → B` 形式の書き換え指示」「`全行 grep`」「completeness 要求」等を含む request 文面) を fixture に置き、reviewer prompt の検出意図がカバーされていることを **static text assertion** で確認

実 LLM 呼び出しは test では行わない (= 再現性 / コスト)。prompt 文に検出意図が記載されていることのみを assert する。

## スコープ外

- **既存 edit verb 列挙の物理的削除可否** (= 抽象化と並存させるか上書きするかは design agent 判断、本 request は intent 判定の追加を主眼とする)
- **過去 5 件以上の観測ケース全件の retrospective 検証** (= 別 audit、本 request は prompt 補強のみ)
- **issue #299 解決の他の手段** (= generator prompt / template の補強等は別 request で扱う)
- **prompt ファイルの修正** (= `request.md` ファイル名 / 構造は維持、prompt 層は変更対象だが path 抽象化済で影響なし)

## 受け入れ基準

- [ ] `src/prompts/request-review-system.ts` の Step 2 / Severity で authority path 言及の検出が **intent 判定ベース** に書き換えられている
- [ ] 具体 pattern (= 行番号指定 / 矢印 / grep 命令 / completeness 要求等) の列挙は prompt 内に含まれていない
- [ ] 既存 Exception (= forbidden 記述 / 過去 incident citation の HIGH 対象外) は維持されている
- [ ] HIGH finding の recommendation 文に「authority は finish の spec-merge で更新、PR 内では read-only、delta spec で Requirement を書き、baseline 状態は AC で検証」相当の助言が含まれる
- [ ] 該当 capability の delta spec が新設計に整合している
- [ ] 観測ケース風 fixture で reviewer prompt の検出意図カバレッジを static assert する再現 test が green
- [ ] 既存 test (= 存在すれば) が新設計に追従して green
- [ ] `bun run typecheck && bun run test` が green
- [ ] ADR に「intent ベース検出への抽象化判断」「verb 列挙の patchwork 累積を断つ思想」「issue #299 / #349 観測連鎖の retrospective」「pattern 列挙回避による LLM 不確定性への根本対策の姿勢」を記録

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD
