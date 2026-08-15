# Spec: build-fixer の廃止 — verification 失敗は implementer への継続再入で直す

## Requirements

### Requirement: verification 失敗は implementer へ再入する

The pipeline SHALL route a verification failure to the implementer step (re-entry)
in both the standard and fast (chore) profiles. The build-fixer step MUST NOT exist as
a transition target.

#### Scenario: 標準経路で verification 失敗が implementer へ遷移する

**Given** 標準 pipeline で verification が `failed` verdict を返した
**When** 遷移表を参照して次 step を決める
**Then** 次 step は implementer である(build-fixer への遷移は存在しない)

#### Scenario: chore(fast)経路で verification 失敗が implementer へ遷移する

**Given** fast pipeline で verification が `failed` verdict を返した
**When** 遷移表を参照して次 step を決める
**Then** 次 step は implementer である(build-fixer への遷移は存在しない)

### Requirement: 再入は直前 implementer session の継続として実行し失敗内容を渡す

The verification-failure re-entry SHALL run as a continuation (resume) of the most
recent implementer session, and the re-entry message MUST include the failed command
and its output.

#### Scenario: 前回 session を継続して失敗内容を渡す

**Given** 直前の implementer run が非 null の sessionId を持ち、最新 verification が `failed`
**When** implementer step の実行 context と message を組み立てる
**Then** resume 対象 session として前回 implementer の sessionId が渡され、
message に失敗した command と出力が含まれる

### Requirement: 継続元 session が無い場合は fresh session に fallback する

When no continuation source session exists (the previous implementer run has no
sessionId), the re-entry SHALL fall back to a fresh session without raising an error,
and MUST still include the verification failure content in the message.

#### Scenario: 前回 sessionId が無ければ fresh で継続失敗を吸収する

**Given** 最新 verification が `failed` だが直前 implementer run の sessionId が null/不在
**When** implementer step の実行 context を組み立てる
**Then** resume 対象 session は渡されず(fresh 実行)、エラーにならず、
message には失敗内容が含まれる

### Requirement: 再入指示は失敗解消のみで機械的修正制約を課さない

The re-entry instruction SHALL direct the implementer only to resolve the verification
failure with its normal authority and responsibility (aligning implementation and tests
with canon). It MUST NOT impose mechanical-fix-only, no-design-decision, or
scope-limited constraints.

#### Scenario: 回復 message に制約文言が含まれない

**Given** 最新 verification が `failed` で implementer 再入 message を組み立てる
**When** 生成された message を検査する
**Then** 「検証の失敗を解消する」旨と canon 整合の指示を含み、
「機械的修正のみ」「設計判断禁止」「範囲限定」といった制約文言を含まない

### Requirement: verification 再入回数の上限は維持される

The verification loop MUST terminate with `VERIFICATION_RETRIES_EXHAUSTED` when
failures persist across re-entries, so the recovery loop cannot run unbounded.

#### Scenario: 持続失敗で再入上限に達し escalation する

**Given** verification が implementer 再入のたびに `failed` を返し続ける
**When** 再入回数が上限に達する
**Then** job は `awaiting-resume` へ遷移し、error code は `VERIFICATION_RETRIES_EXHAUSTED` である

#### Scenario: conformance 再検証は fresh な予算で実行される

**Given** conformance が承認し、直近 verification より新しいコード変更がある
**When** conformance から verification 再検証へ遷移する
**Then** verification の再入予算はリセットされ、再検証が即 exhaustion で打ち切られない

### Requirement: build-fixer 実行歴を含む既存 state は互換に扱われる

Existing job state that contains build-fixer execution history SHALL load and fold
without error, with the historical build-fixer step names preserved and ignored.
A resume anchored at build-fixer MUST resolve to the implementer step.

#### Scenario: build-fixer 実行歴を含む state を読み込み fold する

**Given** `state.steps["build-fixer"]` に実行歴を持つ既存 state と対応する events
**When** state を読み込み journal を fold する
**Then** エラーにならず、build-fixer の実行歴は projection に保持され、以降の routing では無視される

#### Scenario: build-fixer 復帰点は implementer へ写される

**Given** resumePoint.step が `"build-fixer"`(または `--from build-fixer`)の resume 要求
**When** resume 開始 step を解決する
**Then** 解決結果は `"implementer"` である
