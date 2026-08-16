# Spec: agent step の完了契機を report 受領主・プロセス終了 fallback の二重系にする

## Requirements

### Requirement: report 受領が step 完了の主契機になる

claude-code adapter の main work turn 中に valid な `report_result` を受領した場合、adapter は
SHALL その受領を step 完了の主契機として扱い、受領した `capturedToolResult` を step の
semantic result として確定する。受領後 `REPORT_SETTLE_GRACE_MS` の固定 grace 内に SDK message
generator が自然終了しなければ、adapter は main work turn だけを abort し、受領済み toolResult を
付けて `completionReason: "success"` で settle しなければならない (MUST)。report の `ok` の解釈は
executor の責務であり、adapter は `ok:true` / `ok:false` を区別せず受領時点で完了を確定する。

#### Scenario: ok:true 受領後に generator が閉じない → grace 経過で success settle

**Given** reportTool を設定した agent step が実行中である
**And** agent が `report_result` を `ok:true` で呼び、その後 session が background task により無音化し generator が閉じない
**When** report 受領から `REPORT_SETTLE_GRACE_MS` が経過する
**Then** main work turn は abort され、返り値の `completionReason` は `"success"` である
**And** 返り値の `toolResult` は受領済みの report (`ok:true`) であり null ではない

#### Scenario: ok:false 受領後に generator が閉じない → grace 経過で success settle

**Given** reportTool を設定した agent step が実行中である
**And** agent が `report_result` を `ok:false` で呼び、その後 generator が閉じない
**When** report 受領から `REPORT_SETTLE_GRACE_MS` が経過する
**Then** 返り値の `completionReason` は `"success"` であり、`toolResult.ok` は `false` である
**And** その `toolResult` は従来どおり executor の verdict 導出へ渡される

### Requirement: grace 内に generator が自然終了した場合は usage を従来どおり回収する

report を受領してから `REPORT_SETTLE_GRACE_MS` が経過する前に SDK message generator が自然終了
した場合、adapter は SHALL grace timer を発火させず、最終 success result から `modelUsage` /
invocation metrics を従来どおり回収して settle しなければならない (MUST)。

#### Scenario: 受領後 grace 内に自然終了 → 最終 result から modelUsage 回収

**Given** reportTool を設定した agent step が実行中である
**And** agent が `report_result` を呼んだ後、grace 経過前に `modelUsage` 付き success result を出して generator が自然終了する
**When** step が settle する
**Then** 返り値の `completionReason` は `"success"` である
**And** 返り値の `modelUsage` は最終 success result 由来の値で回収されている

### Requirement: sessionId を最終 result より前に確保し grace 後 abort でも postWork を resume する

adapter は SHALL `extractedSessionId` を最終 success result より前に到着する SDK message
(session 初期化 message 等、`session_id` を持つ最初の message) から確保しなければならない
(MUST)。これにより grace 後 abort 経路 (最終 success result が存在しない) でも postWork prompts
(rules follow-up) が `resume: sessionId` で実行できる。

#### Scenario: grace 後 abort 経路で postWork prompts が resume で走る

**Given** reportTool と postWorkPrompts を設定した agent step が実行中である
**And** main work turn の先行 message が `session_id` を運び、その後 agent が report を呼んで generator が閉じない
**When** grace 経過で main work turn が abort され postWork prompts が実行される
**Then** postWork prompts の query は先行 message で確保した sessionId を `resume` に指定して実行される
**And** 返り値の `completionReason` は `"success"` である

### Requirement: abort catch 経路は受領済み report を破棄しない

watchdog / step-timeout / SIGTERM による abort の catch 経路は、`capturedToolResult` が非 null の
場合、SHALL `completionReason: "timeout"` ではなく `"success"` を、受領済み toolResult を付けて
返さなければならない (MUST)。`toolResult: null` での上書きをしてはならない。usage / metrics は
取得済みなら付与し、無ければ欠損を許容する。`completionReason` に新たな値を追加してはならない。

#### Scenario: report 受領後に hard abort が発火しても report を保全する

**Given** reportTool を設定した agent step が report を受領済みである
**And** grace 完了より前に watchdog / step-timeout / SIGTERM による shared abort が発火する
**When** adapter の abort catch 経路が実行される
**Then** 返り値の `completionReason` は `"success"` であり、`toolResult` は受領済みの report である
**And** 返り値は STEP_TIMEOUT error を持たない

### Requirement: report 不在時の fallback 挙動は不変である

report を受領しないまま SDK message generator が終了した場合の report retry follow-up → error、
および report を受領しないまま watchdog が発火した場合の STEP_TIMEOUT halt は、SHALL 現行挙動を
一切変えてはならない (MUST NOT change)。report 不在時は grace timer を張らない。

#### Scenario: report 不在で watchdog 発火 → 従来どおり STEP_TIMEOUT halt

**Given** reportTool を設定した agent step が実行中で、agent が report を一度も呼ばない
**And** generator が閉じないまま inactivity 閾値 (`DEFAULT_INACTIVITY_TIMEOUT_MS`) が経過する
**When** watchdog が発火し abort する
**Then** 返り値の `completionReason` は `"timeout"` であり、`toolResult` は null である
**And** `error.code` は `"STEP_TIMEOUT"` である

#### Scenario: report 不在で generator が終了 → report retry 経路が不変

**Given** reportTool を設定した agent step が実行中である
**And** agent が report を呼ばないまま generator が自然終了する
**When** adapter が完了処理に入る
**Then** 従来どおり report retry follow-up が実行され、最終的に report 不在なら既存の error 経路に落ちる
**And** grace timer は一度も張られない
