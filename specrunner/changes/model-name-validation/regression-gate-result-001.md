# Regression Gate Result — model-name-validation (Iteration 1)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証方法

- `git diff main...HEAD --name-only` で変更ファイルを一覧化
- 台帳 11 件について、参照ファイルを直接 Read して実装状態を確認
- `cross-boundary-invariants-result-002.md` で operator 裁定内容と code-fixer の対応状況を確認

---

## 検証結果一覧

| Finding | Provenance Ref | Severity | 状態 |
|---------|----------------|----------|------|
| [1] ClaudeSdkQueryResult / SdkModelInfo 型追加 | ff6f991b | HIGH | ✅ FIXED |
| [2] T-05 AsyncIterable 構成パターン未定義 | df4f7b43 | MEDIUM | ✅ FIXED |
| [3] T-02 configPath 命名混同 | a9a38a2b | MEDIUM | ✅ FIXED |
| [4] TC-030 カテゴリ 'unit' → 'gate' | 84f69608 | LOW | ✅ FIXED |
| [5] spec.md snapshot.model フォールバック省略 | 2e4fd659 | LOW | ✅ FIXED |
| [6] SdkModelInfo 型定義が spec 内に存在しない | 6944f1a4 | LOW | ✅ FIXED |
| [7] TC-019/TC-020 abort() spy assertion 欠落 | 3152ea65 | MEDIUM | ✅ FIXED |
| [8] 同一解決チェーン二重呼び出し（乖離リスク） | 7a4731aa | LOW | ❌ STILL PRESENT |
| [9] DoctorContext に rawConfig なし / MINIMAL_CONFIG 継続使用 | 40a077c7 | MEDIUM | ❌ STILL PRESENT |
| [10] 同一解決チェーン二重呼び出し（operator 裁定済） | c67d10d8 | LOW | ❌ STILL PRESENT |
| [11] ResumeCommand.prepare() に assertEffectiveModelsExist なし | 244d375c | LOW | ❌ STILL PRESENT |

---

## 修正済み詳細

### [1] ff6f991b — ClaudeSdkQueryResult / SdkModelInfo 型 (HIGH)

`src/adapter/claude-code/sdk-loader.ts` を確認:
- `SdkModelInfo` interface（`{ value: string }`）が lines 9-11 に定義・export されている
- `ClaudeSdkQueryResult` interface が lines 20-23 に定義（`AsyncGenerator<unknown, void>` を拡張し `supportedModels()` と `close()` を追加）
- tasks.md T-05 lines 96-111 に型追加の指示と `as ClaudeSdkQueryResult` キャスト戦略が記述されている
→ **修正確認済み**

### [2] df4f7b43 — AsyncIterable 構成パターン (MEDIUM)

tasks.md T-05 lines 112-130 に `makePromptIterable(signal: AbortSignal)` のコードパターンが追記されている（AbortController.signal の abort イベントで終了させる方式）
→ **修正確認済み**

### [3] a9a38a2b — configPath 命名混同 (MEDIUM)

tasks.md T-02 lines 32-37 に「`configPath` の意味」注記が追加され、dotted key パスと絶対ファイルパスの区別が明記されている。  
`collect-effective-models.ts` lines 27-32 の JSDoc コメントにも同旨の注記あり。
→ **修正確認済み**

### [4] 84f69608 — TC-030 カテゴリ修正 (LOW)

`test-cases.md` TC-030（line 338）:
- Category: `gate` に変更済み
- GWT 記述なし（gate TC 形式に変更済み）
- Summary section: Automated 31 件（32 → 31 に修正済み）
→ **修正確認済み**

### [5] 2e4fd659 — spec.md フォールバック記述 (LOW)

`spec.md` line 15: `snapshot.model ?? DEFAULT_REVIEW_MODEL`（snapshot.model 未設定時は `DEFAULT_REVIEW_MODEL`（`claude-sonnet-5`）にフォールバック）と明記されている。
→ **修正確認済み**

### [6] 6944f1a4 — SdkModelInfo 型定義 (LOW)

`src/adapter/claude-code/sdk-loader.ts` lines 6-11 にコメント付きで local minimal alias として `SdkModelInfo` が定義されている。tasks.md T-05 lines 97-105 に定義の根拠も記述されている。
→ **修正確認済み**

### [7] 3152ea65 — TC-019/TC-020 abort spy (MEDIUM)

`tests/adapter/claude-code/supported-models-probe.test.ts` を確認:
- TC-019（line 171）: `vi.spyOn(AbortController.prototype, "abort")` で abort spy を設定し `expect(abortSpy).toHaveBeenCalled()` で明示的にアサートしている
- TC-020（line 204）: 同様のパターンで abort spy を設定してアサートしている
→ **修正確認済み**

---

## 未修正（残存）詳細

### [8] 7a4731aa — 同一解決チェーン二重呼び出し (LOW)

`src/core/model-validation/collect-effective-models.ts` lines 82-87:

```typescript
const model = getStepExecutionConfig(config, stepName, stepDefaults, requestType).model;
const traced = traceStepExecutionConfig(config, stepName, stepDefaults, requestType);
const configPath: string | null = traced.fields.model.source.path ?? null;
```

`getStepExecutionConfig` と `traceStepExecutionConfig` の両方が独立して呼ばれたまま。  
`traced.fields.model.value` に実効値が含まれるため `getStepExecutionConfig` は不要。
→ **未修正（regression）**

### [9] 40a077c7 — DoctorContext rawConfig 欠落 (MEDIUM)

`src/core/doctor/types.ts`（line 91-165）: `rawConfig?: SpecRunnerConfig` フィールドが存在しない。  
`src/core/doctor/checks/config/model-existence.ts`（lines 23, 47）: `MINIMAL_CONFIG` と `BUILTIN_MODEL_REGISTRY` のみを使用し続けている。  
`src/cli/doctor.ts`: rawConfig を取得しているが DoctorContext に注入していない。  
operator 裁定（cross-boundary-invariants-result-002.md F-01）で「選択肢 2: DoctorContext に rawConfig を追加」が採用されたが実装されていない。
→ **未修正（regression）**

### [10] c67d10d8 — 同一解決チェーン二重呼び出し（operator 裁定済）(LOW)

[8] と同一コード箇所。cross-boundary-invariants-result-002.md F-02 にて operator 裁定「指摘どおり修正: 同一解決チェーンの二重呼び出しを一本化する」が記録されているが、code-fixer により修正されなかった。
→ **未修正（regression）**

### [11] 244d375c — ResumeCommand.prepare() に assertEffectiveModelsExist なし (LOW)

`src/core/command/resume.ts` の `prepare()` メソッドに `assertEffectiveModelsExist` の呼び出しが存在しない（grep で確認済み）。  
operator 裁定（cross-boundary-invariants-result-002.md F-03）で「選択肢 2: ResumeCommand の prepare() にも assertEffectiveModelsExist を追加」が採用されたが実装されなかった。
→ **未修正（regression）**

---

## Evidence

- **checked**: 11（台帳全 11 件を実装ファイルで直接確認）
- **skipped**: 0
- **unverified**: 0
