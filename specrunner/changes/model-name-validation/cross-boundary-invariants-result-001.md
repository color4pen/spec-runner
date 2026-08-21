# Cross-Boundary-Invariants Review — model-name-validation (Iteration 1)

## Summary

変更の目的はローカル実行時の model 名腐れ検出（`supportedModels()` との照合）と alias 3 種の全経路 pass 化。

- 新規モジュール: `src/core/model-validation/` (collect / check / preflight)
- adapter probe: `src/adapter/claude-code/supported-models-probe.ts`
- port: `src/core/port/model-listing.ts`
- registry 追加: alias 3 種 (`sonnet`/`opus`/`haiku`) を `BUILTIN_MODEL_REGISTRY` に登録
- doctor check: `src/core/doctor/checks/config/model-existence.ts`
- 呼び出し統合: `PipelineRunCommand.prepare()` 内で `assertEffectiveModelsExist` を呼ぶ

既存テストは 12,178 件すべて green（`bun run test`）。typecheck も green。

---

## Cross-Boundary Invariant Analysis

### 検証した境界

| 境界 | 確認内容 |
|------|----------|
| `BUILTIN_MODEL_REGISTRY` の追加 → 既存テスト | alias 3 件追加が registry 依存テストを壊さないか |
| `resolveProvider` 挙動変化 → `DispatchingAgentRunner` | alias が "anthropic" にルーティングされるか |
| preflight 呼び出し順序 → job state 不変条件 | `bootstrapJob` の前に throw され state が未生成であるか |
| `assertProviderReadiness` + `assertEffectiveModelsExist` 二重 SDK session | 互いの cleanup が干渉しないか |
| doctor check vs preflight の検証スコープ | 同じ `collectEffectiveModels` / `checkModelExistence` を共有しているか |
| B-6 allowlist (process.env) | stripSecrets なしの subprocess spawn が発生していないか |
| RealRuntimeStrategy 型制約 | `listSupportedModels` が managed に強制されていないか |

---

## Findings

### F-01: Doctor check は user config の step override を適用しない — false assurance リスク

**Severity: medium | Resolution: decision-needed**

`src/core/doctor/checks/config/model-existence.ts:23` にて

```typescript
const MINIMAL_CONFIG: SpecRunnerConfig = { version: 1, agents: {} };
const refs = collectEffectiveModels(STANDARD_DESCRIPTOR, MINIMAL_CONFIG, undefined, merged);
```

doctor check は `MINIMAL_CONFIG`（空の設定）と `BUILTIN_MODEL_REGISTRY` のみを使用する。  
一方 `PipelineRunCommand.prepare()` は `config`（ユーザー実設定）と `mergeModelRegistry(config)` を使用する。

**問題となるシナリオ:**

```
// .specrunner/config.json
{ "steps": { "design": { "model": "claude-defunct-99" } } }
```

- `specrunner doctor` → model-existence check が MINIMAL_CONFIG を使うため design step の実効 model は hard-coded default（例 `claude-opus-5`） → SDK 一覧に存在 → **PASS**
- `specrunner run` → preflight が user config を適用して実効 model が `claude-defunct-99` → SDK 一覧に不在 → **CONFIG_INVALID**

D7 では「doctor には job の request type / custom reviewer snapshot が無いため構造的制約がある」と明記されており、意図的な設計判断ではある。しかし doctor の目的が「実行前の設定問題の検出」である以上、user step override が検出されないことは**診断機能として虚偽の安全感を与える**。

**DoctorContext** は `config: DoctorConfig` を持ち `get(path)` でアクセス可能だが、docker check は使用していない。

**Options:**
1. 現状維持（D7 の制約として許容）— doctor は base model の腐れのみ検出する旨をドキュメント化
2. `DoctorContext` に `rawConfig?: SpecRunnerConfig` を追加し、doctor check が `collectEffectiveModels(STANDARD_DESCRIPTOR, rawConfig ?? MINIMAL_CONFIG, undefined, merged)` を使えるようにする

---

### F-02: `collect-effective-models.ts` で同一解決チェーンを二重呼び出し — 乖離リスク

**Severity: low | Resolution: fixable**

`src/core/model-validation/collect-effective-models.ts:82-87`:

```typescript
const model = getStepExecutionConfig(config, stepName, stepDefaults, requestType).model;
const traced = traceStepExecutionConfig(config, stepName, stepDefaults, requestType);
const configPath: string | null = traced.fields.model.source.path ?? null;
```

`getStepExecutionConfig` と `traceStepExecutionConfig` は同一の 6-level 解決チェーンを**別々に**実装している。テスト green の今は一致しているが、将来どちらか一方が更新された際に乖離し、エラーメッセージに「実際に使った model」と「報告された configPath」の不整合が生じる。

**Fix**: `traceStepExecutionConfig` のみを呼び、`traced.fields.model.value` と `traced.fields.model.source.path` を共に使う（`getStepExecutionConfig` の呼び出しを削除）。

```typescript
const traced = traceStepExecutionConfig(config, stepName, stepDefaults, requestType);
const model = traced.fields.model.value as string;
const configPath: string | null = traced.fields.model.source.path ?? null;
```

---

### F-03: Resume パスでは model 存在検証が実行されない — 暗黙の前提

**Severity: low | Resolution: decision-needed**

`assertEffectiveModelsExist` は `PipelineRunCommand.prepare()` のみで呼ばれる。`ResumeCommand.prepare()` には呼び出しが無い。

**暗黙の前提:** 「job 開始時点で valid だった model は再開時点でも valid である」。

実際には、job が `awaiting-resume` に入ってから resume するまでの間に model が非推奨になる可能性がある。その場合：
- `assertEffectiveModelsExist` は実行されず warning も出ない
- pipeline の agent step が実行されてから SDK レベルで失敗し mid-run halt になる

この制約は設計スコープ（「配置は local job preflight」）と一致しており、意図的な非対応。  
しかし「再開時 model が失効していた場合に preflight で止まらず mid-run で止まる」という挙動差は既存の `assertProviderReadiness` との非対称（こちらは ResumeCommand でも CommandRunner.execute が呼ぶので実行される）として注意が必要。

**Options:**
1. 現状維持（スコープ外として許容）— 既知の制約として design.md に明記
2. ResumeCommand の prepare() にも `assertEffectiveModelsExist` を追加する

---

## 確認した invariant（問題なし）

| Invariant | 確認結果 |
|-----------|----------|
| `BUILTIN_MODEL_REGISTRY` 追加による既存テスト破壊 | `toEqual` は値比較のため両辺同時更新 → 問題なし |
| alias 追加 → `resolveProvider` が `DispatchingAgentRunner` で "anthropic" を返す | 意図通り。claudeRunner にルーティングされ SDK が alias を解決 |
| `assertEffectiveModelsExist` が `bootstrapJob` 前に throw | pipeline-run.ts の順序確認済み。state 未生成のまま停止 |
| `RealRuntimeStrategy` に `listSupportedModels` が追加されない | 確認済み。ManagedRuntime への強制なし |
| B-6: `process.env` が stripSecrets なしで subprocess に到達しない | probe 内で `stripSecrets(env)` を経由。allowlist entry も追加済み |
| doctor check が probe 未注入時 warn を返す | `if (!probe) return { status: "warn", ... }` で正しく対応 |
| `ANTHROPIC_MODEL_ALIASES` と registry 内 alias の一致 | `model-registry.ts` に同居。現時点で一致。将来の保守リスクは小 |
| `traceStepExecutionConfig` の `source.path` vs `source.configPath` 混同 | `tasks.md` の注記に従い `source.path`（dotted key）を使用 |
| doctor probe が `ctx.env` を受け取り probe 内で stripSecrets | 確認済み。allowlist なし（doctor は composition-root として B-6 free） |

---

## Evidence

- **checked**: 18 items (上記 invariant 全検査 + finding 3 件)
- **skipped**: 0
- **unverified**: 0
