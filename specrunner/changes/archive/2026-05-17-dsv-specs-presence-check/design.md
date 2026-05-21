# Design: dsv-specs-presence-check

## 概要

`validateDeltaSpecPaths` に specs/ 不在 check を追加し、type=spec-change/new-feature の request が delta spec なしで pipeline を通過する経路を機械的に遮断する。

## 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/core/spec/delta-spec-validator.ts` | `DeltaSpecViolationReason` に `no-specs-for-required-type` 追加、`validateDeltaSpecPaths` に `requestType` 引数と Step 5 check 追加 |
| `src/core/step/delta-spec-validation.ts` | `validateDeltaSpecPaths` 呼び出し時に `deps.request.type` を渡す |
| `src/core/step/delta-spec-fixer.ts` | fixer prompt に specs/ 新規作成 hint を追加 |
| `tests/unit/core/spec/delta-spec-validator.test.ts` | 新規 TC 5件 |
| `tests/unit/step/delta-spec-validation.test.ts` | 新規 TC 1件 |
| `specrunner/specs/pipeline-orchestrator/spec.md` | delta spec (本 change folder 内) |

## 設計詳細

### 1. `validateDeltaSpecPaths` の signature 変更

```ts
export async function validateDeltaSpecPaths(
  changePath: string,
  deps: DeltaSpecValidatorFs,
  requestType?: string,    // ← 新引数 (optional で後方互換維持)
): Promise<{ ok: true } | { ok: false; violations: DeltaSpecViolation[] }>
```

`requestType` は optional。呼び出し元が渡さない場合 (= 既存テスト) は新 check をスキップし、既存挙動を完全維持する。

### 2. Step 5 の配置: Step 1 の前

既存 Step 3 (line 87-93) で `specs/` 不在時に early return する経路がある。Step 5 を Step 4 の後に置くとこの early return で到達不能になる。**Step 1 の前** に配置して短絡 fail させる。

```
[Step 5] specs/ 不在 check (requestType=spec-change|new-feature のみ)
  ↓ specs/ 不在 → violations push + early return
  ↓ specs/ あり or requestType 不要 → 通過
[Step 1] delta-spec.md legacy check (既存)
[Step 2] delta-spec/ legacy check (既存)
[Step 3] specs/ entries scan (既存)
[Step 4] canonical path validate (既存)
```

### 3. specs/ 配下の .md ファイル検索

DI fs の `readdir` で 2 階層スキャン (canonical path `specs/<cap>/spec.md` のパターンに合致):

1. `readdir(changePath/specs)` → ENOENT or 空 → 0件
2. 各 entry:
   - `.md` で終わる → 1件以上 (非正規だが存在はする)
   - それ以外 (subdir) → `readdir(changePath/specs/entry)` で `.md` を探す
3. 合計 0件 → violation push + early return

### 4. violation 形式

既存 schema (`path / reason / suggested`) 準拠:

```ts
{
  path: `${changePath}/specs/`,
  reason: "no-specs-for-required-type",
  suggested: `Request type '${requestType}' requires a delta spec. Add a file under ${changePath}/specs/<capability-name>/spec.md`,
}
```

`formatViolationsTable` は `reason` が文字列であれば任意の値を受け付けるため、既存ロジックを破壊しない。

### 5. dsv step 側の変更

`DeltaSpecValidationStep.run()` の `validateDeltaSpecPaths` 呼び出しに第 3 引数 `deps.request.type` を追加するのみ。`deps.request` は `ParsedRequest` 型で `.type: string` を持つ (既存)。verdict 判定・result file 書き込みロジックは変更不要 (violation が増えれば needs-fix、なければ approved)。

### 6. delta-spec-fixer prompt の hint 追加

`buildDeltaSpecFixerInitialMessage` の手順リストに以下を追加:

> specs/ ディレクトリや delta spec ファイルが存在しない場合は、request.md の type と内容に基づいて新規作成してください

既存の「move / rename」手順と競合しない位置に挿入。continuation message は変更不要 (validation result を読んで対応するため)。

### 7. 後方互換

- `requestType` は optional → 既存呼び出し (テスト含む) は引数追加不要
- `DeltaSpecViolationReason` union の拡張は additive → 既存 pattern match に影響なし
- `formatViolationsTable` は reason を文字列としてレンダリング → 新 reason をそのまま処理
