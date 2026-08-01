# Cross-Boundary Invariants Review — missing-file-finding-declaration — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 変更差分の把握

`git diff main...HEAD --stat` を実行し、変更ファイルを特定した。

変更されたソースファイル（実装）:
| ファイル | 変更内容 |
|----------|----------|
| `src/kernel/report-result.ts` | `Finding` 型に `fileMissing?: boolean` を追加 |
| `src/core/port/report-result.ts` | `parseFindings` で `fileMissing === true` のみ capture |
| `src/core/step/report-tool.ts` | `findingSchema` / `conformanceFindingSchema` に `fileMissing` を追加、4 tool description 更新 |
| `src/core/step/step-completion.ts` | ref 検証ブロックを `missingDecl` / `regular` 2群に分割・反転 |
| `src/core/step/__tests__/step-completion-missing-file-finding.test.ts` | 新規テスト（TC-001〜TC-012） |

**変更されていない**コード（暗黙の前提が依存する側）:
- `src/core/runtime/managed.ts:381-422` — `verifyFindingRefs` 実装（`branch = null` 時に全 ref を非実在扱い）
- `src/core/runtime/local.ts:752-781` — `verifyFindingRefs` 実装（filesystem ベース）
- `src/core/port/runtime-strategy.ts:428-443` — seam 契約（非実在 ref の部分集合を返す）
- `src/core/step/judge-verdict.ts:26-30` — `collectVerdictAffectingFindings`（critical/high/decision-needed）
- `src/core/step/step-completion.ts:300-321` — `verdictOverriddenByFindingRef` による escalationReason 抑止

### 境界交差の網羅的トレース

以下の境界を step-completion.ts の新コードと、変更されていない各機構との相互作用として確認した。

#### 境界A: seam 意味論（`verifyFindingRefs` = 非実在 ref の部分集合を返す）× `missingDecl` 反転ロジック

- seam は**渡された ref のうち実在しないものの部分集合**を返す（変更前後で不変）
- `regular` 群: 返却 ≥ 1 → 上書き（hallucination）— 従来通り
- `missingDecl` 群: 返却に含まれない file = 「実在してしまっている」= false declaration → 上書き
- ref オブジェクトは入力そのまま（`nonExistent.push(ref)`）を返す実装のため、`r.file === f.file` の等値比較は成立する
- ✅ 反転ロジックは seam 契約と整合

#### 境界B: managed runtime `branch = null` 動作 × `missingDecl` 群

`managed.ts:384`:
```typescript
if (!branch) return [...refs];   // branch null → 全 ref を非実在扱い（不変コード）
```

- **既存挙動（`regular` 群）**: `branch = null` → 全 ref が非実在 → `nonExistent.length > 0` → `override = true` → escalation（fail-closed）
- **新挙動（`missingDecl` 群）**: `branch = null` → 全 ref が非実在 → `absentFiles` に全 file が含まれる → `falseDecl` = 空集合 → `override = false` → 上書きなし（**fail-open**）

`branch = null` のとき、`missingDecl` 群は「ファイルが存在しないこと」の検証が不可能にもかかわらず、escalation override が走らない。

- 緩和策（design.md Risks 節）: pipeline descriptor の遷移順序により、design step 完了前に judge step に到達する経路は存在しない → `state.branch` は null にならない（非公式の構造的制約）
- コードレベルの保護なし（call site に assertion なし）
- 対象テスト: TC-006 はいずれも `branch = "change/example-abc12345"`（non-null）。`branch = null + missingDecl` の組み合わせを固定するテストは存在しない
- 想定トリガー: managed runtime 環境で `state.branch = null` の状態から `resume --from <judge-step>` した場合、`fileMissing:true` の virtual finding は検証不能なままルーティングが保たれる

⚠️ **この境界は HIGH finding として報告する**（下記参照）

#### 境界C: `collectVerdictAffectingFindings` の対象集合 × `fileMissing` の orthogonality

`judge-verdict.ts:26-30`:
```typescript
return findings.filter(
  (f) => f.severity === "critical" || f.severity === "high" || f.resolution === "decision-needed",
);
```

- `fileMissing` は集合フィルタに関与しない — `medium/low fixable fileMissing:true` 所見は ref 検証対象外
- 回帰ゲートの `deriveRegressionGateVerdict` は `fixable ≥ 1 → needs-fix`（severity 不問）— `medium/low fileMissing:true` 所見が `needs-fix` に影響しうるが、ref 検証を経ない
- これは変更前も同様（`medium/low` 所見は ref 検証対象外）であり、**新たな差分ではない**
- ✅ 設計スコープ外として既存挙動と一致

#### 境界D: `filterUndecidedFindings` の二重呼び出し対称性

- verdict 導出: `allFindings = [...(tr.findings ?? []), ...extraScopeFindings]`（`tr` = original toolResult）
- `effectiveToolResult.findings` = original + scope（同一内容）
- ref 検証: `allFindings = effectiveToolResult.findings ?? []`（同一内容）
- ✅ 両ブロックで `filterUndecidedFindings` の入力は同一

#### 境界E: scope findings（`origin: "scope"`, `decision-needed`）× `missingDecl` 群

- scope findings は `synthesizeScopeFindings` が機械生成（`fileMissing` なし）
- → `regular` 群に分類される
- scope finding の `file = "specrunner/changes/${slug}/request.md"`（常に存在する）
- → ref 検証で非実在リストに含まれない → `override = false`
- ✅ scope findings は `missingDecl` ロジックに干渉しない

#### 境界F: `verdictOverriddenByFindingRef` 共有 × escalationReason 抑止

- false declaration（`missingDecl` 群の上書き）でも `verdictOverriddenByFindingRef = true` を立てる
- `:300-321` の escalationReason 計算が抑止される
- これは Non-Goal（D5）として明示された設計判断 — **新たな差分ではない**
- ✅ 既存 escalationReason 抑止ロジックとの整合を確認

#### 境界G: `DecisionFindingSnapshot` に `fileMissing` を含まない

- `src/state/schema/types.ts:232-239`: `DecisionFindingSnapshot` = `{ title, file, line?, rationale, severity, options? }`
- `computeFindingKey` は `step|file|line|title|rationale` → `fileMissing` はキーに含まれない
- 意味論: `fileMissing:true` の `decision-needed` finding が決定済みになると、次イテレーションで same key で一致し `filterUndecidedFindings` が除外する — ref 検証スキップ
- ✅ 後方互換かつ決定抑止は正常に機能する

#### 境界H: `missingDecl` 群の line 省略 × seam 実装

- `refs = missingDecl.map(f => ({ file: f.file }))` — `line` プロパティ自体を持たない
- local/managed 両実装とも `if (ref.line !== undefined)` で line チェックを制御
- `{ file }` のみの ref → `ref.line === undefined` → line チェックスキップ → file 存在のみ判定
- ✅ `FindingRef = { file: string; line?: number }` の型契約と一致

### 既存テストの確認

- `src/core/runtime/__tests__/managed-verify-finding-refs.test.ts` — 無変更、構文確認
- `tests/unit/core/runtime/verify-finding-refs.test.ts` (TC-VFR-L-001〜007) — 無変更、seam の意味論固定テストが継続有効
- verification-result.md: `test 10032 passed | 1 skipped (10033)` — 全テスト green 確認

## 検証できなかった項目

- `resume --from <judge-step>` コマンドが `state.branch = null` のまま managed runtime で judge step を起動できるか（CLI の resume ルーティングコードの実読が必要、本レビューの調査範囲外）
- pipeline descriptor の全遷移テーブルを読み「design 完了前に judge step に到達する遷移が本当に存在しない」を網羅確認（ADR の対象；本レビューでは不変条件の informal 性を確認するにとどまる）

---

## Findings 詳細

### F-01: managed runtime `branch = null` + `missingDecl` 群 → fail-open（ファイル実在確認不能のまま routing 保存）

**境界**: `src/core/step/step-completion.ts:264-276`（新コード）× `src/core/runtime/managed.ts:384`（不変コード）

**変更前の不変条件**:
> `branch = null` かつ managed runtime のとき、verdict に影響する全 finding の ref が「非実在」として返される
> → `nonExistent.length > 0` → `override = true` → verdict = escalation（均一 fail-closed）

**新挙動による破損**:
`missingDecl` 群でのみ反転: `branch = null` → 全 ref が非実在 → `absentFiles` に全 file が入る
→ `falseDecl = missingDecl.filter(f => !absentFiles.has(f.file)) = []`（空集合）
→ `override = false` → routing 保存

具体的なシナリオ:
1. agent が `{ fileMissing: true, file: "src/hallucinated.md", severity: "high" }` を報告（hallucination）
2. managed runtime、`state.branch = null` の状態
3. seam: `branch = null` → `[{ file: "src/hallucinated.md" }]` を返す（全件非実在）
4. `absentFiles = new Set(["src/hallucinated.md"])` → `falseDecl = []` → no override
5. verdict = `needs-fix`（hallucinated 所見が routing を駆動）

`regular` 群: 同条件で escalation override → fail-closed は維持されている。

**緩和策（informal）**: design.md Risks 節に記載の pipeline 順序不変条件:
「design step 完了 → `state.branch` 確定 → judge step 到達」。コード上の assertion や型ガードは存在しない。

**テストギャップ**: TC-006 は `branch = "change/example-abc12345"`（non-null）のみ。`branch = null + missingDecl` の組み合わせをカバーするテストは存在しない。

**Note**: design.md は ADR 化を推奨しているが、`specrunner/adr/` が spec-fixer の write scope 外であったため adr-gen step での別途 ADR 化が必要と記載されている。
