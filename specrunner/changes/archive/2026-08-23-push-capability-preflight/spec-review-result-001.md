# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### spec ファイルの読み込みと相互照合

- `request.md`: 受け入れ条件 6 件、実装範囲 5 件、非目標 5 件を確認
- `design.md`: D1〜D9 の全 Decisions、リスク/トレードオフ、Open Questions を確認
- `spec.md`: Requirements 7 件（各 Scenario を含む全文）を確認
- `tasks.md`: T-01〜T-11 の全タスクと Acceptance Criteria を確認
- `test-cases.md`: TC-001〜TC-040 全 40 件の Summary 数値・内訳・Result YAML を確認

### 既存コードとの整合性確認

- `src/core/port/output-contract.ts`: `OutputContractKind`, `OutputContract`, `OutputViolation`, `OutputVerificationPolicy` の型定義を確認。`"unpushable-path"` 追加が既存型に対して backward-compatible であることを確認
- `src/core/step/step-context-builder.ts`: `outputVerification` ブロック（行 126〜139）を確認。現在 `maxAttempts: OUTPUT_FOLLOWUP_MAX_ATTEMPTS`（定数 2）で固定されており、T-08 の変更点がどこに当たるかを特定
- `src/core/step/output-verify.ts`: `buildOutputFollowUpPrompt(violations: OutputViolation[]): string`（attempt 引数なし）を確認。`partitionByPolicy` の挙動を確認
- `src/core/step/implementer.ts`: `outputContracts()` が `tasks-complete` policy `"follow-up"` を既に返すことを確認（行 258〜263）
- `src/core/step/commit-push.ts`: `commitAndPush` の mixed reset 位置（行 500〜508）と guarded/scoped 分岐を確認。Layer 2 挿入ポイント（混合 reset 直後、staging 前）がコード上で明確に存在することを確認
- `src/core/step/step-halt.ts`: `makeDriftHalt` の実装を `makeUnpushablePathHalt` の範型として確認。`awaiting-resume` halt が `notifyJobTerminal` によって issue escalation コメントを生成することを設計から検証
- `src/core/port/step-context.ts`: `StepContext` が既に `dynamicContext?: DynamicContext` を持ち（shared-kernel から import）、`pushCapability?: PushCapability` の追加が同じパターンで問題ないことを確認
- `src/git/transport-auth.ts`: 既存の shared-kernel git モジュールの構造を確認。DSM 上 `src/git/push-capability.ts` が同層として適切であることを確認
- `src/core/credentials/github.ts`: `resolveGitHubToken` の優先順位（GH_TOKEN → GITHUB_TOKEN → gh auth token → credentials.json）を確認。T-03 のトークン再利用方針との整合性を確認
- `src/util/glob-match.ts`: `matchesGlob` の実装を確認。`**` および `*` のパターンが `.github/workflows/**` マッチングに対して正しく機能することを確認
- `src/errors.ts`: 既存 `ERROR_CODES` を確認。`UNPUSHABLE_PATH_BLOCKED` が未定義であり T-10 で追加が必要なことを確認
- `tests/unit/architecture/core-invariants.test.ts`: 層制約の機械的検証が走ること、`src/git/` が shared-kernel として扱われることを確認

### 要件↔TC トレーサビリティ

- Requirement 1 (capability detection): TC-001〜004, TC-020 → ✓ カバー済み
- Requirement 2 (notify without gating): TC-005〜007, TC-031 → ✓ カバー済み
- Requirement 3 (publishable path enumeration): TC-008〜010, TC-025〜027 → ✓ カバー済み
- Requirement 4 (exactly one follow-up): TC-011〜013, TC-030 → ✓ カバー済み
- Requirement 5 (escalate after follow-up): TC-014 → ✓ カバー済み（TC-035, TC-036 で補完）
- Requirement 6 (Layer 2 deterministic backstop): TC-015〜016, TC-037 → ✓ カバー済み
- Requirement 7 (unchanged behavior): TC-017〜019 → ✓ カバー済み
- Gate tests: TC-038〜040 → ✓

### test-cases.md Summary 数値検証

- Total 40、Automated 37（unit 37 件）+ gate 3 件、Manual 0 → ✓
- Priority: must 28 / should 10 / could 2 → ✓（手動カウントで一致）

### セキュリティ確認（OWASP 視点）

- **トークン管理**: `detectPushCapability(env, token)` は raw token を prefix チェックのみに使用。`PushCapability` 型に `token` フィールドが存在しないことを T-01 型定義・T-03 制約から確認。TC-029 でコンパイル時に token フィールドなしを検証 → 意図的設計として適切
- **インジェクション**: `matchUnpushablePaths` のパターンは hardcoded（`.github/workflows/**`）でユーザー入力ではない。`collectPublishablePaths` の git コマンド出力（パス文字列）は repo-relative で注入リスクなし
- **fail-open 設計 (D2)**: GITHUB_ACTIONS が true かつ GH_TOKEN 未設定かつ `ghs_` prefix という AND 条件は意図的な保守的検出。偽陰性は従来通り remote 拒否にデグレードするだけで現状より悪化しない設計
- **escalation 経路**: `awaiting-resume` halt → `notifyJobTerminal` → issue コメントという経路が `makeDriftHalt` の先例で確立されていることを確認

### 非目標の確認

- `.github/workflows/**` を変更しないこと: 実装範囲 1 で明示、TC-039 で gate テスト化 → ✓
- 予測 `touchedFiles` によるパイプライン停止なし: spec Requirement 2 で明示、TC-006 でテスト化 → ✓
- 新しい pipeline step の追加なし: 設計が既存 `outputVerification` シームを再利用 → ✓

---

## 検証できなかった項目

- **`LocalRuntime.validateStepOutputs` の現在の実装内容**: `src/core/runtime/local.ts` は touched-files に含まれていなかったため読み込めず、T-06 の分岐追加対象の現在のコード構造を直接確認できなかった。ただし T-06 の指示（`this.spawnFn` の存在を前提、`!branch` 早期 continue より前への分岐追加）は design D5 の根拠から技術的に妥当と判断
- **`ManagedRuntime.validateStepOutputs` の現在の実装**: 同様に未読。T-07 の "test-coverage を同様にスキップ" という既存パターンへの言及から、同構造で分岐追加可能と判断

---

## Findings 詳細

### Finding 1: T-08 の `maxAttempts=1` が `tasks-complete` を含む混在 follow-up 違反に影響する（MEDIUM）

**対象ファイル**: `tasks.md` T-08、`test-cases.md` TC-033/034

`implementer.ts` の `outputContracts()` が現在 `tasks-complete` (policy `"follow-up"`) を返すことを確認した（実コード行 258〜263）。

`step-context-builder.ts`（行 135）の `maxAttempts` は現在 `OUTPUT_FOLLOWUP_MAX_ATTEMPTS = 2` で固定されている。T-08 は「`unpushable-path` が follow-up contracts に含まれる場合の上限を 1 とする」ことを要求するが、この変更は `outputVerification.maxAttempts` を単一値で管理する現行構造上、同一 step の他の follow-up contracts（`tasks-complete` 等）にも適用される。

具体的影響:
- implementer で `tasks-complete` 違反 AND `.github/workflows/**` 変更が同時に存在する場合、`maxAttempts=1` で全 follow-up contracts が 1 回に制限される
- 従来は tasks-complete に対して 2 回の修正機会があったが 1 回に減少する
- T-08 は「他 kind の挙動を変えないこと」と明記するが、これは `unpushable-path` が**含まれない**場合の保証（TC-034 が示すとおり）であり、混在ケースは明示的に仕様化されていない

T-08 `maxAttempts` 決定ロジックの実装時に「unpushable-path 含む場合、maxAttempts=1 は全 follow-up kind に及ぶ」旨の TSDoc コメントを明記することで文書化できる（動作変更は意図的なトレードオフ）。

### Finding 2: TC-030 WHEN 句の `buildOutputFollowUpPrompt` 呼び出しシグネチャ不整合（LOW）

**対象ファイル**: `test-cases.md` TC-030、`tasks.md` T-05

TC-030 の WHEN 句は `buildOutputFollowUpPrompt([violation], attempt)` と書かれているが、
- 現在の `buildOutputFollowUpPrompt` シグネチャは `(violations: OutputViolation[]): string`（attempt 引数なし）
- `step-context-builder.ts` 行 136 のクロージャも `(violations, _attempt) => buildOutputFollowUpPrompt(violations)` で attempt を破棄している
- T-05 は `buildOutputFollowUpPrompt` への `attempt` 追加を指示していない

TC-030 の WHEN 句を実装者がそのまま解釈すると、2 引数で `buildOutputFollowUpPrompt` を呼ぶテストが TypeScript エラーになる（TC-038 typecheck 違反）。

修正方法: TC-030 の WHEN 句を「`buildPrompt([violation], attempt)` を呼ぶ（`OutputVerificationPolicy.buildPrompt` クロージャ経由）」として書き換えるか、T-05 に `buildOutputFollowUpPrompt` への `attempt?: number` 追加を明示する。
