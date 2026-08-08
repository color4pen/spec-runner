# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `specrunner/changes/step-prompt-artifact-injection/request.md`
- `specrunner/changes/step-prompt-artifact-injection/design.md`
- `specrunner/changes/step-prompt-artifact-injection/spec.md`
- `specrunner/changes/step-prompt-artifact-injection/tasks.md`
- `src/adapter/shared/prompt-builder.ts`（共有層の現状）
- `src/util/paths.ts`（`changeFolderPath` の実装・SLUG_REGEX の参照先）
- `src/util/validation-patterns.ts`（`SLUG_REGEX`）
- `src/adapter/claude-code/agent-runner.ts` L440–510（prompt 組み立て箇所の現状）
- `src/adapter/codex/agent-runner.ts` L300–340（prompt 組み立て箇所の現状）
- `src/adapter/managed-agent/agent-runner.ts` L600–640（managed 非対象の確認）
- `src/core/step/implementer.ts` L85–106（buildMessage の実例）
- `src/adapter/codex/__tests__/resume-prompt-injection.test.ts`（既存テストの構造確認）
- `src/adapter/claude-code/__tests__/credential-injection.test.ts`（`makeCaptureQueryFn` の実装確認）

### 検証した内容

1. **要件整合性**（spec.md の全 Scenario と request.md の要件 1〜4 の対応）
   - Scenario: 存在する artifact が同梱される → T-04(a) に対応 ✓
   - Scenario: 存在しない artifact はスキップ → T-04(b) に対応 ✓
   - Scenario: 出力系 artifact が除外される → T-04(c) に対応 ✓
   - Scenario: 上限超過で従来 prompt → T-04(d) に対応 ✓
   - Scenario: change folder / 入力 artifact 不在 → T-04(e) に対応（後述 Gap あり）
   - Scenario: buildMessage 文言が変わらない → T-03 既存テスト継続 green の根拠確認 ✓

2. **設計整合性**
   - D1: `artifact-bundle.ts` 新規モジュールで両 adapter が呼ぶ 1 箇所注入 ✓
   - D2: `INPUT_ARTIFACT_NAMES` allowlist で出力系を構造的排除 ✓
   - D3: 64KB 超過で全中止（fail-open） ✓
   - D4: stat 別呼びせず readFile の ENOENT で skip、TOCTOU なし ✓
   - D5: baseMessage 直後挿入、artifactSection = "" のとき prompt バイト同一 ✓
   - D6: `<bundled-change-artifacts>` / `<artifact path="...">` XML ラッパー ✓

3. **セキュリティ確認**
   - **パストラバーサル**: `slug` は `/^[a-z0-9][a-z0-9-]{0,63}$/` で検証済み（`..` や `/` 不可）。`name` は固定 allowlist 由来。`cwd` は CLI が設定する worktree パス。traversal リスクなし ✓
   - **プロンプトインジェクション**: artifact 内の `</artifact>` / `</bundled-change-artifacts>` リテラルで区切りが崩れるリスクは design.md の "Risks / Trade-offs" に明示・fail-open として許容 ✓
   - **サイズベースの DoS**: 64KB 上限定数で入力トークン肥大を頭打ち ✓
   - **managed runtime への波及なし**: `managed-agent/agent-runner.ts` が `prompt-builder` を import していないことを grep で確認 ✓

4. **既存テストへの影響**
   - `resume-prompt-injection.test.ts` 「resume 未指定時バイト同一」テスト: `testCwd` に change folder がないため `artifactBundle = ""` → `artifactSection = ""` → prompt 変化なし ✓（T-03 根拠確認）
   - `credential-injection.test.ts`: `cwd = tempDir`（per-test mkdtemp）に change folder なし → 同梱ゼロ → 既存 assert 影響なし ✓

5. **T-05 テストパターンの実装可能性**
   - codex 側: `makeCapturingMockThread` は `calls[].prompt` をキャプチャ済み → 流用可能 ✓
   - claude-code 側: `makeCaptureQueryFn` の実装を確認 → **下記 Finding 参照**

## 検証できなかった項目

- `bun run typecheck && bun run test` の実行（コードはまだ存在しない）
- managed runtime での実際の挙動（out of scope であることは設計上確認済み）
- 64KB 境界の実数値テスト（T-04(d) の記述から実装意図は確認可能だが実行は未）

## Findings 詳細

### Finding 1 (medium / fixable): T-05 claude-code テストパターンに prompt キャプチャが欠落

**対象**: `specrunner/changes/step-prompt-artifact-injection/tasks.md` T-05

**問題**:
T-05 は claude-code 側テストの実装指示として `credential-injection.test.ts` の `makeCaptureQueryFn（params.prompt をキャプチャ可能）パターンを流用` と記述している。しかし実際の `makeCaptureQueryFn` は次のように `params.options`（env 等）のみキャプチャし、`params.prompt` をキャプチャしない:

```typescript
async function* queryFn(params: { prompt: ...; options?: ... }) {
  if (params.options) {
    capturedOptions.push({ ...params.options });   // prompt は不収集
  }
  ...
}
```

受け入れ基準「キャプチャした prompt に同梱ブロックと design.md の内容が含まれることを assert」を満たすには、`params.prompt` も収集する関数を新設または既存関数の拡張が必要。T-05 の "(params.prompt をキャプチャ可能)" は「そういうものを作る必要がある」意図と読めるが、文脈だけでは「既存関数を流用すれば足りる」と誤読しうる。

**修正方針**: T-05 に「`makeCaptureQueryFn` を `prompt` もキャプチャするよう拡張または新規 helper を作成する」と明示する。

---

### Finding 2 (low / fixable): T-04(e) が spec.md の OR 条件を片方しかカバーしない

**対象**: `specrunner/changes/step-prompt-artifact-injection/tasks.md` T-04(e)

**問題**:
spec.md のシナリオは `Given change folder が存在しない、または入力 artifact が 1 つも存在しない` と OR 条件で 2 つのケースを示している。T-04(e) のタスク記述は「change folder を掘らない slug で返り値が `""` を assert」のみで、「change folder は存在するが入力 artifact が 1 つも無い」サブケースのテストが欠落している。

D4 の設計上は「found=[] → 空文字」で同じパスを通るため実質同等だが、spec シナリオと機械検証の 1:1 対応が欠ける。

**修正方針**: T-04(e) に「change folder は作成するが allowlist ファイルを一切書かない slug でも `""` を assert」を追記する。

---

### Finding 3 (low / fixable): T-04 に非 ENOENT の per-file エラーのテストケースがない

**対象**: `specrunner/changes/step-prompt-artifact-injection/tasks.md` T-04、`design.md` D4

**問題**:
D4 は「read 失敗（ENOENT / 権限等）はその 1 件を skip（per-file fail-open）」と規定しており、ENOENT 以外のエラー（権限拒否など）も 1 件 skip であることを明示している。しかし T-04 には ENOENT（ファイル不在）ケースしかなく、非 ENOENT エラーのケースがない。実装が `if (err.code === 'ENOENT') skip; else throw;` と書かれても T-04 で検出できない。

**修正方針**: T-04 に「readFile をモックして任意エラーを throw させた場合に、そのファイルがスキップされ残りの artifact は同梱される（または 0 件なら `""` を返す）こと」を確認するケースを追加する。
