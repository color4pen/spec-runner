# Tasks: request-review-detect-baseline-edit-intent

## Task 1: Step 2 の検出条件を intent 判定に書き換え

**File**: `src/prompts/request-review-system.ts`

Step 2 (Request Validation) の最後の bullet（L31 付近）を書き換える。

**現行** (削除対象):
```
- Authority path co-occurrence: if the request body references a path under `specrunner/specs/` in conjunction with an edit verb (MODIFIED, ADDED, "を更新", "を作成", or equivalent), flag it as a HIGH severity finding. Exception: referential mentions that describe the authority path as forbidden (policy statements, past incident citations) are NOT HIGH findings.
```

**変更後** (intent 判定):
authority path (`specrunner/specs/`) への言及を検出した場合、reviewer は言及の intent を判定する:
- 参照・言及 (= 読み取り、policy 説明、過去 incident 引用) → HIGH 対象外
- 設計反映 (= delta spec 経由での変更意図) → HIGH 対象外
- 直接操作 (= baseline を直接編集・書き換える意図) → HIGH severity finding

具体的な edit verb や pattern の列挙は **含めない**。

- [x] Done

## Task 2: Severity Scope Constraint の HIGH 定義を整合

**File**: `src/prompts/request-review-system.ts`

Severity Scope Constraint セクション（L50 付近）の HIGH 定義を書き換える。

**現行** (削除対象):
```
or the request body directly specifies an authority path (`specrunner/specs/`) as an edit target
```

**変更後**:
authority path への直接操作 intent を検出した場合を HIGH に含める文言に書き換え。Task 1 の intent 判定と整合させる。

- [x] Done

## Task 3: HIGH finding の recommendation 文を追加

**File**: `src/prompts/request-review-system.ts`

Step 2 の intent 判定ルールの直後、または Severity Scope Constraint の HIGH 説明内に、直接操作 intent を検出した場合の recommendation ガイダンスを追加:

- authority spec は `specrunner finish` の spec-merge が delta から自動更新する
- PR 内では baseline は read-only
- delta spec で Requirement を書き、baseline 状態は AC の grep assertion 等で結果として検証する

- [x] Done

## Task 4: 既存 test (TC-RR-011 / TC-RR-012) を新設計に追従

**File**: `tests/unit/command/request-review.test.ts`

TC-RR-011 と TC-RR-012 の string contains assertion を、新しい prompt 文言に合わせて更新する。

TC-RR-011 (authority path 検出ルールの存在確認):
- `"Authority path co-occurrence"` → intent 判定に対応するキーフレーズに変更
- `"HIGH severity finding"` は維持可能（prompt 内に残る）

TC-RR-012 (referential 除外節の存在確認):
- `"referential mentions"` / `"NOT HIGH findings"` → 新しい除外節の表現に追従

- [x] Done

## Task 5: 再現 test の追加

**File**: `tests/unit/command/request-review.test.ts`

観測ケース風の intent をカバーする static assertion を追加。実 LLM 呼び出しは行わない。

TC-RR-013 (intent 判定の prompt カバレッジ):
- `REQUEST_REVIEW_SYSTEM_PROMPT` が intent 判定（参照 / 設計反映 / 直接操作 の 3 分類）を含むことを assert
- 具体 edit verb 列挙 (`MODIFIED, ADDED`) が prompt に含まれ **ない** ことを assert (= 抽象化の検証)

TC-RR-014 (recommendation 文の存在確認):
- `REQUEST_REVIEW_SYSTEM_PROMPT` に spec-merge / read-only / delta spec 経由を示す recommendation キーフレーズが含まれることを assert

- [x] Done

## Task 6: delta spec 作成

**File**: `specrunner/changes/request-review-detect-baseline-edit-intent/specs/request-authoring-guard/spec.md`

baseline の `### Requirement: Request Review Prompt Authority Path Detection Rule` を MODIFIED する delta spec を作成。

Requirement header は baseline と完全一致させる (= tool が MODIFIED として自動分類する条件)。

Scenario を新設計に合わせて書き換え:
- 検出ルールが「intent 判定」ベースであること
- 具体 edit verb 列挙を含まないこと
- referential 除外が維持されていること

baseline の他の Requirement (`Request Generate Prompt Authority Path Prohibition` / `Request Scaffold Template Delta Spec Guidance` / `Request Review Prompt Regression Test`) は本 request では変更しない → delta spec に含めない。

- [x] Done

## Task 7: typecheck + test green 確認

`bun run typecheck && bun run test` を実行し green を確認。

- [x] Done
