# delta-spec-validation に specs/ 配下の delta spec 存在 check を追加し spec-change の素通りを構造的に防ぐ

## Meta

- **type**: spec-change
- **slug**: dsv-specs-presence-check
- **base-branch**: main
- **date**: 2026-05-17
- **author**: color4pen
- **issue**: #283

## 背景

### 観測例

PR #282 (`cli-step-observable-progress`) finish で escalation:

```
=== specrunner finish: escalation ===
Failed Step:       spec-merge (specs/ absent)
Detected State:    Request type is 'spec-change' which requires a delta spec, but specs/ directory does not exist in the change folder.
```

request type=spec-change なのに change folder の `specs/` 配下が空 (= delta spec ゼロ)。それでも pipeline は最後まで完走し pr-create まで通過した。手動修復 (= authority 編集分を delta spec に切り出して revert) で finish しなおすコストが発生。

### 4 層防衛網の突破 (= #283 の root cause)

| 層 | 本来の責務 | 実態 |
|---|---|---|
| design | type=spec-change なら delta spec を `specs/<capability>/spec.md` に書く | design.md と tasks.md のみ作成、specs/ ゼロ |
| spec-review | delta spec の存在 + 中身を検証 | 「3 アーティファクト整合」で approved、specs/ 不在を見逃し |
| **dsv** | **specs/ 配下の format / path を検証** | **specs/ 不在を `approved` で通過 (= 本 request 対象)** |
| implementer | code 実装のみ、authority spec は触らない | authority spec を直接 88 行追加編集 (= #263 の領分) |

### openspec-workflow との比較

`~/Documents/GitHub/openspec-workflow/` は `openspec validate --strict` を **Step 5a (delta spec 存在判定のみの独立 Step)** として強制している:

- `openspec-workflow/README.md:178`: 「Step 5 検証 5a: openspec validate (delta spec 存在時) / 5b: Build → Type → Lint → Test → Security」
- `openspec-workflow/constraints.md:175`: 「`openspec archive` の `--skip-specs` 迂回禁止 (SHALL NOT)、Step 5a で fail-fast、spec-fixer agent でリトライ」

spec-runner は PR #189-191 で `openspec` CLI 依存を脱却し dsv に切り替えたが、check 網羅性 (= `specs/` 不在 fail) が抜け落ちた = 実装縮退。本 request はこの落穂を機械的に拾い直す。

## 目的

`delta-spec-validation` step (dsv) に「type=spec-change/new-feature のとき `specs/` 配下に delta spec が 1 件以上存在することを必須化」する check を追加し、**機械的強制で 4 層突破を 1 層で塞ぐ**。

設計判断 (architect / module-architect 評価) で「機械的強制 (CLI fail-fast) が prompt 規律より上位」と確定済。本 request は dsv 単体修正の最小スコープで対応する。

## 設計判断

1. **採用案: dsv に Step 5 として specs/ 不在 check を追加 (module-architect 評価で 6 軸全て優位)**
   - 既存 `validateDeltaSpecPaths` の Step 1〜4 (canonical path / section header / Requirement block) と同じ粒度で Step 5 を並列追加
   - DI fs ベースの純粋な静的検査関数として cohesion 維持
   - SRP: 「change folder の構造前提が満たされているか」で一貫

2. **不採用案: Phase 2 (format 強化 / baseline 整合) を同 PR で扱う**
   - module-architect 評価で「`parseBaselineSpec` / `applyMerge` への依存が発生し、spec 層が finish 層のロジックを取り込む依存逆流」が起きる
   - coupling と SRP 同時悪化、検出層 2 段 (静的 dsv + semantic spec-merge) の構造が崩れる
   - 別 request で扱う (= 本 request スコープ外、後続観測で判断)

3. **不採用案: spec-review / design prompt 強化を同 PR で扱う**
   - architect 評価で「機械的強制 (dsv) で effectiveness 8 割回収」「prompt は確率的防衛で LLM 解釈依存」と確定
   - migration risk と PR 規模の観点から段階分割を選択 (= 案 A 先行 / 案 B 後続)
   - 後続 dogfood で頻度を観測してから別 request で扱う

4. **type 判定の source**:
   - request.md の Meta セクション (`type: spec-change`) を読み取る
   - 既存 dsv の context (request.md path) から parse
   - 「`spec-change`」「`new-feature`」両方を対象とする (= delta spec が必要な type のみ)
   - 他 type (`bug-fix` / `refactoring` 等) は specs/ 不在でも approved 維持

5. **`specs/` 配下のスキャン範囲**:
   - `specrunner/changes/<slug>/specs/**/*.md` (再帰)
   - ファイル数 0 件 → fail
   - 1 件以上 → 既存 Step 1〜4 で path / format check を継続 (= 後段で 0 件以上の specs/ を validate するロジックは既存通り)

6. **エラーメッセージ**:
   - finish escalation で出る `specs/ absent` メッセージと文言を揃える
   - 例: `Request type is '<type>' which requires a delta spec, but specs/ directory contains no .md files in the change folder.`

## 要件

### 1. `validateDeltaSpecPaths` に Step 5 追加

`src/core/spec/delta-spec-validator.ts` の `validateDeltaSpecPaths`:

- 既存 Step 1〜4 と同じ DI fs パターンで Step 5 を追加
- Step 5: request type が `spec-change` or `new-feature` の場合、`specrunner/changes/<slug>/specs/` 配下に `.md` ファイルが 1 個以上存在することを必須化
- 0 件なら `DeltaSpecViolation` を 1 件 violations 配列に push (= 既存 Step 1〜4 と同じ pattern)
- 他 type (`bug-fix` / `refactoring` 等) は本 check の対象外 (= 既存挙動維持)
- **配置は Step 1 の前 (必須)**: 既存 Step 3 (`delta-spec-validator.ts:87-93` 周辺) の `<change>/specs/` entry スキャンで specs/ 不在時に early return する経路があるため、Step 4 の後に置くと specs/ 不在ケースで Step 5 が到達不能になる。**Step 1 の前** に置いて短絡 fail させる
- request type は `validateDeltaSpecPaths` の新引数 (= 例: `requiredType?: "spec-change" | "new-feature" | null`) で受ける。呼び出し側 `src/core/step/delta-spec-validation.ts` が request.md の Meta セクションから parse して渡す

### 2. `DeltaSpecViolationReason` の新メンバー追加 + violation 形

`src/core/spec/delta-spec-validator.ts:20-25` の既存 `DeltaSpecViolationReason` union に新メンバー **`no-specs-for-required-type`** を追加:

```ts
export type DeltaSpecViolationReason =
  | "legacy-flat-file"
  | "legacy-flat-dir"
  | "non-canonical-path"
  | "missing-requirements-section"
  | "empty-section"
  | "no-specs-for-required-type"; // 新規
```

Step 5 が発火した場合に violations 配列に push する `DeltaSpecViolation` (= 既存 `path / reason / suggested` schema 準拠、`formatViolationsTable` を破壊しない):

```ts
{
  path: `${changePath}/specs/`,
  reason: "no-specs-for-required-type",
  suggested: `Request type '${requiredType}' requires a delta spec. Add a file under ${changePath}/specs/<capability-name>/spec.md`,
}
```

= 受け入れ基準「findings format が既存 (path/format) と同 schema」と整合。

### 3. dsv step の verdict 経路

`src/core/step/delta-spec-validation.ts` の verdict 判定で:

- Step 5 が fail (= 0 件) → 既存 needs-fix 経路に乗せる (= delta-spec-fixer が起動する)
- delta-spec-fixer の prompt が「specs/ 配下に delta spec を新規作成する」シナリオを既にカバーしているか確認、不足なら fixer prompt 側に「specs/ 不在の場合は delta spec を新規作成する」hint を追加

### 4. test

`tests/unit/core/spec/delta-spec-validator.test.ts` (既存) に以下 TC を追加:

- TC: type=spec-change で specs/ 配下に .md 0 件 → verdict: needs-fix + findings 1 件 (新規)
- TC: type=new-feature で specs/ 配下に .md 0 件 → verdict: needs-fix + findings 1 件 (新規)
- TC: type=bug-fix で specs/ 配下に .md 0 件 → verdict: approved (= 既存挙動維持確認)
- TC: type=refactoring で specs/ 配下に .md 0 件 → verdict: approved (= 既存挙動維持確認)
- TC: type=spec-change で specs/ 配下に .md 1 件 → 既存 Step 1〜4 の挙動継続 (= regression なし)

`tests/unit/step/delta-spec-validation.test.ts` (既存) に以下 TC を追加:

- TC: dsv step が Step 5 fail を verdict: needs-fix で返し delta-spec-fixer に遷移する経路を assert (= integration 寄り)

### 5. spec authority への反映

`specrunner/specs/<capability>/spec.md` (= 該当 capability) を MODIFIED で更新:

- 既存 Requirement「dsv は delta spec の canonical path / format を validate する」相当の文を拡張、または新規 Requirement「dsv は spec-change/new-feature type の specs/ 配下に delta spec が 1 件以上存在することを必須化する」を ADDED
- Scenario:
  - type=spec-change で specs/ 配下 .md 0 件 → needs-fix
  - type=new-feature で specs/ 配下 .md 0 件 → needs-fix
  - type=bug-fix で specs/ 配下 .md 0 件 → approved (= 対象外)
  - type=spec-change で specs/ 配下 .md 1 件以上 → 後段 Step 1〜4 に進む

該当 capability は `delta-spec-validation` (もしくは `pipeline-orchestrator` に統合されている場合は後者) — baseline を Read して特定する。

### 6. 観測例の reproduction test (任意)

`tests/pipeline-integration.test.ts` 等に:

- TC: type=spec-change な request で design が specs/ を作らないまま completed → dsv で needs-fix → delta-spec-fixer 経由で specs/ が補填される scenario が完走する
- (= PR #282 と同型の reproduction として将来の regression を防ぐ)

## スコープ外

- **Phase 2 候補 (format 強化 / baseline 整合 check の dsv 前倒し)** — module-architect 評価で「spec → finish の依存逆流」発生、別 request で扱う
- **spec-review prompt 強化** (delta spec 存在 check の prompt 追加) — architect 評価で「機械的強制が最上位、prompt は補助」、case B として別 request
- **design 完了条件 MUST 化** — 同上、case B として別 request
- **implementer の authority 直接編集対策** — #263 (step 責務境界) の領分
- **`openspec validate` CLI の再導入** — graduation (PR #189-191) の方向を逆行しない、機能のみ dsv に取り込む
- **既存 delta-spec-fixer prompt の大規模改修** — 要件 3 で hint 追加のみ、構造変更は別 request

## 受け入れ基準

- [ ] `src/core/spec/delta-spec-validator.ts` の `validateDeltaSpecPaths` に Step 5 (specs/ 不在 check) が **Step 1 の前** に追加されている
- [ ] `DeltaSpecViolationReason` に `"no-specs-for-required-type"` メンバーが追加されている
- [ ] type=spec-change/new-feature で specs/ 配下 .md 0 件のとき violations に 1 件追加され `verdict: needs-fix` を返す
- [ ] type=bug-fix/refactoring 等では specs/ 不在でも既存通り approved (= regression なし)
- [ ] specs/ 配下に .md 1 件以上ある場合は既存 Step 1〜4 の挙動が継続 (= regression なし)
- [ ] findings format が既存 (path / format) と同 schema で出力される
- [ ] dsv step が Step 5 fail で delta-spec-fixer に遷移する経路が動く (= 既存 verdict: needs-fix 経路に乗る)
- [ ] 新規 unit test 5 件 + integration test 1 件が pass
- [ ] PR #282 と同型の reproduction scenario が dsv で catch されて escalation せず完走する
- [ ] `bun run typecheck && bun run test` が green
- [ ] spec authority に Step 5 の Requirement が反映されている
- [ ] 既存 dsv test (path / format) が regression していない

## Workflow Options

- enabled: []
