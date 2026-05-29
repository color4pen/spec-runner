## Requirements

### Requirement: halt 時の job status 遷移

`toolResult: null` で完了した agent step は MUST halt せず次の step へ proceed しなければならない。verdict は step-class に基づいて確定する:

- **judge** (spec-review / code-review): verdict = `"needs-fix"`（保守側。`"approved"` でも `"escalation"` でもない）。fixer に回り、loop 枯渇で grounded に halt する。
- **producer** (design / implementer / spec-fixer / delta-spec-fixer / code-fixer / build-fixer / test-case-gen / adr-gen): verdict = `completionVerdict`（通常 `"success"`）。下流の grounded step（verification 等）が裏取りする。

halt は adapter 内の malformed retry 枯渇（`invalid-input` reason で `maxAttempts` 超過）時のみ発生する。`no-tool-call` reason の場合は `toolResult: null` で executor に返り、executor が proceed する。

adapter が `reason` フィールドで `invalid-input` と `no-tool-call` を区別する既存の挙動は MUST 維持する。

#### Scenario: judge step の toolResult null で needs-fix として proceed

**Given** spec-review step が `reportTool` 付きで実行されている
**When** agent が `report_result` tool を呼ばずに session 完了し、adapter が `toolResult: null` で返す
**Then** executor は halt せず verdict `"needs-fix"` で次 step（spec-fixer）へ proceed する

#### Scenario: producer step の toolResult null で completionVerdict として proceed

**Given** implementer step が `completionVerdict: "success"` を持ち、`reportTool` 付きで実行されている
**When** agent が `report_result` tool を呼ばずに session 完了し、adapter が `toolResult: null` で返す
**Then** executor は halt せず verdict `"success"` で次 step（verification）へ proceed する

#### Scenario: malformed JSON は adapter 内で追撃後に halt

**Given** agent が `report_result` を不正な JSON で呼び出す（`reason: invalid-input`）
**When** adapter が `maxAttempts`（2回）の追撃を行い、3回目も不正
**Then** adapter は halt し、executor には到達しない（awaiting-resume 遷移は adapter/executor 既存経路で処理）

### Requirement: toolResult 存在時の verdict 導出

`toolResult` が存在する agent step では、executor は MUST `toolResult` の typed field から verdict を導出し、prose parse（`step.parseResult`）を verdict 確定に使用してはならない。

- **judge** (spec-review / code-review): `toolResult.approved === true` → `"approved"` / `toolResult.approved === false` or undefined → `"needs-fix"`
- **producer**: `toolResult.status === "success"` → `completionVerdict`（fallback `"success"`）/ `toolResult.status === "error"` → `"error"` / `status` undefined → `completionVerdict` fallback

grounded step（verification / delta-spec-validation / pr-create）は `report_result` を通らないため toolResult を持たず、従来の prose parse path を SHALL 維持する。

#### Scenario: judge step で toolResult.approved が true の場合

**Given** spec-review step が `toolResult: { ok: true, approved: true }` で完了する
**When** executor が verdict を確定する
**Then** verdict は `"approved"` になり、`parseReviewVerdict` は verdict 確定に使用されない

#### Scenario: judge step で toolResult.approved が false の場合

**Given** code-review step が `toolResult: { ok: true, approved: false, fixableCount: 0 }` で完了する
**When** executor が verdict を確定する
**Then** verdict は `"needs-fix"` になる

#### Scenario: judge step で toolResult.approved が未設定の場合

**Given** spec-review step が `toolResult: { ok: true }` で完了する（approved 未設定）
**When** executor が verdict を確定する
**Then** verdict は `"needs-fix"` になる（保守側 — golden case「空/壊れ→非 approved」と整合）

#### Scenario: producer step（completionVerdict: "success"）で toolResult.status から verdict を導出

**Given** design step が `completionVerdict: "success"` を持ち、`toolResult: { ok: true, status: "success" }` で完了する
**When** executor が verdict を確定する
**Then** verdict は `"success"` になる（`completionVerdict` 経由）

#### Scenario: approved-returning producer step で toolResult.status から verdict を導出

**Given** spec-fixer step が `completionVerdict: "approved"` を持ち、`toolResult: { ok: true, status: "success" }` で完了する
**When** executor が verdict を確定する
**Then** verdict は `"approved"` になり、遷移表の `on: "approved"` にマッチする
