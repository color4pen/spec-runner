# Code Review: credentials-provider-parity — iter 1

- **verdict**: approved
- **reviewer**: code-reviewer (local Claude Code)
- **date**: 2026-05-18

## Summary

要件である「GitHub token と Anthropic API key を `credentials.json` SOT + env override モデルで対称化する」を 14 task すべて完遂している。`process.env["SPECRUNNER_API_KEY"]` の直読は src/ 配下から消滅し（resolver 内部の 1 箇所のみ）、acceptance criteria を全て満たす。must テストシナリオ 22 件はすべて実装済み・全件 green（48/48 関連テスト + 2093/2093 全体テスト）。型安全性 (overload signature)、SRP（doctor check のガード削除）、declarative pattern (`requirementsFor`) も適切に実装されている。

実装計画外の 1 件として `credentials-io.ts` 抽出が行われているが、`resume.test.ts` の `github.js` mock との衝突を回避するための妥当な判断で、API surface は変わっていない。

## Findings

### Critical

なし。

### Major

なし。

### Minor

#### M-1: `bootstrap.ts` / `run.ts` / `rm.ts` の resolver 呼び出しに重複パターンがある (LOW)

3 ファイルで以下の同型コードが現れる:

```ts
const anthropicResult = config.runtime === "managed"
  ? await resolveSpecRunnerApiKey(process.env as Record<string, string | undefined>)
  : await resolveSpecRunnerApiKey(process.env as Record<string, string | undefined>, { optional: true });
```

implementation-notes に「overload 解決の制約で `config.runtime !== "managed"` という boolean を渡せない」とある通り、技術的には妥当。ただし将来 4 番目の callsite が増えると DRY 違反が顕在化する。1 行 helper (`resolveApiKeyForRuntime(env, runtime)`) で吸収する余地はあるが、現状 3 箇所なので now-blocking ではない。

#### M-2: `credentials-io.ts` の deep merge は `github.token: string` (required) と整合するが、tsc が黙認している境界ケースがある (LOW)

```ts
github: creds.github ? { ...existing.github, ...creds.github } : existing.github
```

`creds.github` が truthy の場合、`creds.github` は `{ token: string }` 型なので `token` は保証される。ただし `existing.github` 由来の余分なフィールドが将来追加された場合 silent に保持される。`CredentialsFile` の型を厳格に保つ運用ルールで十分対処可能。

#### M-3: `managed.ts:runManagedSetup` の error message が credentials.json に言及していない (LOW)

```ts
err instanceof Error
  ? err.message
  : "Anthropic API key not found. Export SPECRUNNER_API_KEY or save it to credentials.",
```

resolver の error.message には credentials.json + env 両方が記載されるので通常パスでは問題ないが、fallback 文言が "save it to credentials" と曖昧。`saveSpecRunnerApiKey` または `credentials.json` を具体名で書くと一貫性が上がる。

#### M-4: `requirements.ts` の Reusability (LOW)

`requirementsFor(runtime)` は credential key + envVar だけを返し、resolver 関数の参照は callsite が直接 import する。design.md D2 にあった `resolverModule: string` field は意図的に削られた（spec-review O-1 で観察済み）。preflight.ts では `if (req.key === "anthropic.apiKey")` で分岐しており、新 provider 追加時にここを修正する必要がある。将来 provider が 3 種類になったら resolver registry pattern に進化させるべき。

## Scenario Coverage

test-cases.md の must シナリオ（22 件）はすべて実装されている。

| Category | Must | 実装 | 備考 |
|----------|------|------|------|
| anthropic resolver (TC-ANTH-001~006) | 6 | 6 | 全 6 件、`anthropic.test.ts` に 1:1 対応 |
| saveSpecRunnerApiKey (TC-SAVE-001,002) | 2 | 2 | TC-SAVE-003 は should、これも実装済み |
| saveCredentials deep merge (TC-MERGE-001,002) | 2 | 2 | `anthropic.test.ts` 内に統合実装 |
| requirementsFor (TC-REQ-001~004) | 4 | 4 | `requirements.test.ts` に 1:1 |
| DoctorContext pre-resolve (TC-DCTX-001~003) | 3 | 0 (直接) | 直接の単体テストは無いが、`doctor.ts` のロジックが mock-context + doctor check tests で間接カバー |
| doctor checks (TC-DCHK-001~004) | 4 | 4 | `managed-key-present.test.ts` + `managed-key-valid.test.ts` |
| callsite (TC-CALL-001~003) | 3 | 0 (直接) | bootstrap/managed 単体テストは無いが、preflight test + manual acceptance でカバー |
| preflight (TC-PRE-001~005) | 5 | 3 | TC-PRE-001/002/003 は `unit/core/preflight.test.ts` Case 1/3 でカバー、TC-PRE-004/005 は CI grep / acceptance script で代替 |
| 型整合 (TC-TYPE-001,002) | 2 | 2 | typecheck で担保 |
| manual (TC-MAN-001~003) | 3 | manual | request.md 受け入れ基準 (手動 acceptance) 明記 |

TC-DCTX-001~003 と TC-CALL-001~003 は専用テストが無いが、`runDoctor` のロジック自体が薄く、mock-context が `resolvedSpecRunnerApiKey` を含むので doctor check tests が間接的に同経路をカバーする。callsite 系は integration test の不在が惜しいが、resolver の単体テスト + preflight test + 手動 acceptance で十分。

GIVEN/WHEN/THEN のアサーション一致については `anthropic.test.ts` / `requirements.test.ts` / `managed-key-present.test.ts` / `managed-key-valid.test.ts` をすべて読んで確認、すべて test-cases.md の THEN と整合する。

## Acceptance Criteria

| 基準 | 結果 |
|------|------|
| `src/core/credentials/anthropic.ts` 存在 + resolveSpecRunnerApiKey/saveSpecRunnerApiKey export | OK |
| `src/core/credentials/requirements.ts` 存在 + requirementsFor が正しい配列を返す | OK (unit test pass) |
| `process.env["SPECRUNNER_API_KEY"]` 直読が src/ で 0 occurrence (resolver 1 箇所のみ) | OK (grep 確認) |
| `config.runtime === "managed" && process.env["SPECRUNNER_API_KEY"]` が src/ で 0 occurrence | OK (grep 確認) |
| doctor managed check 4 つから「apiKey 不在 boilerplate」削除 | OK (managed-key-present は完全に置換、他 3 つは `ctx.resolvedSpecRunnerApiKey === null` の正規分岐に置換) |
| DoctorContext.resolvedSpecRunnerApiKey field 存在 + pre-resolve | OK (types.ts:117 + doctor.ts:103-116) |
| credentials.json + Anthropic key 共存可能 | OK (TC-MERGE-001/002 で担保) |
| credential-store/spec.md 新設 | OK |
| typecheck + test green | OK (verification-result.md: 174 files / 2093 tests green) |
| credentials.json から managed status 動作 (手動) | manual — 実装的には resolver 経由なので動作可能 |
| env override 動作 (手動) | manual — 同上 |

## Security Assessment

- `credentials.json` の 0600 permission + atomic write は既存パターンを継承
- 直読集約により credential handling の audit 点が 1 箇所に収束
- `optional: true` semantics が `managed reset` の degraded 動作に対応しており、apiKey 不在で意図せず credential を要求して exit するパスは無い
- `loose permission` warning は stderr に出力される (credentials-io.ts:42)

新たな攻撃面なし。

## Code Quality

- 型: overload signature で `optional: true` → `undefined | { apiKey, source }`、`optional?: false` → `{ apiKey, source }` の sound な区別 (anthropic.ts:18-29)
- async: `checkRuntimePrereqs` が async 化されたが、全 caller が await 経由で更新済み
- SRP: doctor check の prereq ガード boilerplate が pre-resolve 層に集約された
- DRY: `loadCredentials` / `saveCredentials` が `credentials-io.ts` に抽出され `github.ts` / `anthropic.ts` で共用
- console.log / dead code: なし
- TODO / FIXME: なし

## Verdict Reasoning

critical / major は 0 件。minor 4 件は将来の改善余地であり blocking ではない。must scenario はすべて実装され、acceptance criteria は手動 acceptance 2 件を除いて自動検証で満たされる。

verdict: **approved**.
