# Test Cases: pipeline profile 権限スコープ宣言 + スコープ超過機械導出 escalation 土台

## Summary

- **Total**: 30 cases
- **Automated** (unit/integration): 30
- **Manual**: 0
- **Priority**: must: 20, should: 8, could: 2

---

### TC-001: スコープ未宣言 profile は無制限として扱われる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: PipelineDescriptor は任意の権限スコープ宣言を持ち、absent は無制限として扱う > Scenario: スコープ未宣言 profile は無制限

---

### TC-002: registry profile（standard / design-only）は permissionScope が absent

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: PipelineDescriptor は任意の権限スコープ宣言を持ち、absent は無制限として扱う > Scenario: registry profile はスコープ未宣言

---

### TC-003: deriveScopeBreach は scope absent で breached=false を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: スコープ超過の機械導出は純関数で、fs / child_process を import しない > Scenario: スコープ未宣言は超過無し

---

### TC-004: 禁止面にマッチする changed-file があると breached=true かつ抵触面 id が返る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: スコープ超過の機械導出は純関数で、fs / child_process を import しない > Scenario: 禁止面にマッチする changed-file があると超過

---

### TC-005: scope.ts は fs / child_process を import しない（arch test）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: スコープ超過の機械導出は純関数で、fs / child_process を import しない > Scenario: 純関数は fs / child_process を import しない（arch test で固定）

---

### TC-006: 機械源 breach から decision-needed が合成され escalation → awaiting-resume に遷移する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 機械源 breach は scope marker 付き decision-needed を CLI が決定的に合成する > Scenario: 機械源 breach から decision-needed を合成し escalation に落ちる

---

### TC-007: 同一入力に対して合成 finding は決定的（file / title / rationale / options ≥2 が一致）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 機械源 breach は scope marker 付き decision-needed を CLI が決定的に合成する > Scenario: 合成 finding は options を伴い決定的

---

### TC-008: 超過理由（抵触面 id）が escalation コメントの「Decisions needed」セクションに描画される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: scope finding は既存の decision-needed → escalation 経路と issue 描画を再利用する > Scenario: 超過理由が escalation コメントに描画される

---

### TC-009: 禁止面に抵触しない場合は verdict・遷移・findings が scope 機構なし時と完全一致する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: scope finding は既存の decision-needed → escalation 経路と issue 描画を再利用する > Scenario: 越えない時は現行と挙動完全一致

---

### TC-010: origin absent の finding を parseFindings で解析した結果は現行と完全一致する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Finding は任意の scope discriminator を持ち、absent は現行と完全一致 > Scenario: origin absent は現行と同一

---

### TC-011: origin: "scope" を持つ decision-needed finding を parseFindings が捕捉し保持する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Finding は任意の scope discriminator を持ち、absent は現行と完全一致 > Scenario: origin present を捕捉する

---

### TC-012: FindingResolution の妥当値は fixable / decision-needed の 2 値のみ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: FindingResolution の union は fixable / decision-needed のまま > Scenario: 新 resolution 値が存在しない

---

### TC-013: 解決済み scope breach は filterUndecidedFindings で除外され再 escalate しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 解決済みの scope breach は decision-ledger で再 escalate しない > Scenario: 解決済み scope breach は再 escalate しない

---

### TC-014: 既存 judge-verdict / decision-ledger テストが無変更または additive 拡張のみで green

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 解決済みの scope breach は decision-ledger で再 escalate しない > Scenario: 並行 escalation 機構を新設していない

---

### TC-015: deriveScopeBreach: 禁止面の glob にマッチしない changed-files は breached=false

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `permissionScope` が宣言され、`forbidden` に 1 件以上の `ForbiddenSurface` が存在する  
**WHEN** `deriveScopeBreach` に禁止面のどの `paths` glob にもマッチしない `changedFiles` を渡す  
**THEN** `breached` は false、`surfaces` は空配列である

---

### TC-016: deriveScopeBreach: forbidden が空配列の scope は breached=false

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `forbidden: []`（禁止面が空）の `PermissionScope`  
**WHEN** `deriveScopeBreach` に任意の `changedFiles` を渡す  
**THEN** `breached` は false、`surfaces` は空配列である

---

### TC-017: parseFindings は不正な origin 値を黙って無視し missingFields に加えない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `origin: "unknown-value"` を持つ finding 入力  
**WHEN** `parseFindings` で解析する  
**THEN** 解析結果の finding に `origin` フィールドは含まれず、`missingFields` にも追加されない

---

### TC-018: findingSchema / conformanceFindingSchema が origin を任意フィールドとして受け付ける

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `origin: "scope"` を含む finding の JSON 入力  
**WHEN** `findingSchema`（または `conformanceFindingSchema`）で parse する  
**THEN** parse が成功し、結果に `origin: "scope"` が保持される

---

### TC-019: codex strict-schema テストが origin の additive 追加後も green

**Category**: unit
**Priority**: could
**Source**: design.md > D3 (Risk: codex strict 変換) / tasks.md > T-02

**GIVEN** `findingSchema` に `origin` optional フィールドが追加された状態  
**WHEN** `tests/adapter/codex/strict-schema.test.ts` を実行する  
**THEN** 既存の `toContain` / 特定キー検証アサーションがすべて green のまま

---

### TC-020: composeReviewerDescriptor が base の permissionScope を合成後も保持する

**Category**: unit
**Priority**: should
**Source**: design.md > D5 / tasks.md > T-04

**GIVEN** `permissionScope` を持つ `PipelineDescriptor` を base として `composeReviewerDescriptor` を呼ぶ  
**WHEN** 合成後の descriptor を参照する  
**THEN** `permissionScope` フィールドが spread によって引き継がれ、absent でない

---

### TC-021: permissionScope 未宣言時は listChangedFiles / deriveScopeBreach が呼ばれない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `permissionScope` を渡さずに構築した `StepExecutor`  
**WHEN** `finalizeStep` を任意の judge step で呼ぶ  
**THEN** `runtimeStrategy.listChangedFiles` は呼ばれず、`deriveScopeBreach` も呼ばれず、toolResult・verdict は既存挙動と完全一致する

---

### TC-022: breach なし時の toolResult.findings は scope 機構が無い場合と byte 一致

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `permissionScope` が宣言されているが、禁止面の glob にマッチする `changedFiles` が存在しない  
**WHEN** checkpoint step で `finalizeStep` を実行する  
**THEN** 永続化される `toolResult.findings` が scope 機構を挟まない場合と完全一致する

---

### TC-023: 機械源 breach 後の awaiting-resume 遷移で resumePoint.step が checkpoint になる

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `permissionScope.checkpoint = "conformance"` を持つ profile で、禁止面に抵触する `changedFiles` がある  
**WHEN** checkpoint step の `finalizeStep` が実行され job が `awaiting-resume` に遷移する  
**THEN** `state.resumePoint.step` が `"conformance"`（checkpoint 名）に設定されている

---

### TC-024: 意味源（agent emit）scope finding も既存 deriveJudgeVerdict 経路で awaiting-resume に落ちる

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** agent が `origin: "scope"` の `decision-needed` finding を emit し `parseFindings` が捕捉する  
**WHEN** `deriveJudgeVerdict` で verdict を導出する  
**THEN** verdict は `escalation` となり job が `awaiting-resume` に遷移する（新規 escalation 機構は経由しない）

---

### TC-025: computeFindingKey が scope finding に対して安定した key を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** 同一の `checkpoint` 名と合成 scope finding（決定的な `file` / `title` / `rationale`）  
**WHEN** `computeFindingKey(checkpoint, finding)` を 2 回呼ぶ  
**THEN** 両回とも同じ key 文字列を返す

---

### TC-026: getOpenDecisionFindings が resumePoint.step の合成 scope finding を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** `awaiting-resume` の job で `resumePoint.step = checkpoint`、かつ checkpoint の最新 run の `toolResult.findings` に合成 scope finding（`decision-needed`・options ≥2）が含まれる  
**WHEN** `getOpenDecisionFindings(state)` を呼ぶ  
**THEN** 合成 scope finding がリストに含まれる

---

### TC-027: buildEscalationComment 本体を変更せずに合成 finding が描画される

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-07

**GIVEN** `buildEscalationComment` の実装が本 request で変更されていない  
**WHEN** `issue-notifier.ts` の既存 escalation コメントテストを実行する  
**THEN** すべて green のまま（issue-notifier に新機構を追加していないことが確認できる）

---

### TC-028: VALID_RESOLUTIONS の妥当値は fixable と decision-needed の 2 値のみ

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** `src/core/port/report-result.ts` の `VALID_RESOLUTIONS` 定数  
**WHEN** その値を列挙する  
**THEN** `"fixable"` と `"decision-needed"` の 2 値のみが存在し、scope 由来を示す新 resolution 値は存在しない

---

### TC-029: arch test が src/core/pipeline/ 配下の child_process / execSync / spawnSync import をゼロ検証

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-09

**GIVEN** `tests/unit/architecture/core-invariants.test.ts` に `child_process` / `node:child_process` / `execSync` / `spawnSync` の参照を `src/core/pipeline/` 内で禁じるアサーションが追加されている  
**WHEN** arch 不変条件テストを実行する  
**THEN** アサーションが green となり、`scope.ts` が pure function として実装されていることが確認される

---

### TC-030: scope.ts の新規 import edge が DSM closure / B-1〜B-10 を破らない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-09

**GIVEN** `src/core/pipeline/scope.ts` が追加された状態  
**WHEN** DSM closure および B-1〜B-10 の arch 不変条件テストを実行する  
**THEN** すべて green となり、`scope.ts` が kernel / state / shared-kernel と同層の domain モジュールのみに依存していることが確認される

---

## Result

```yaml
result: completed
total: 30
automated: 30
manual: 0
must: 20
should: 8
could: 2
blocked_reasons: []
```
