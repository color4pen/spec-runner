# Cross-Boundary Invariants Review — operator-guide (iteration 002)

**Reviewer**: cross-boundary-invariants  
**Branch**: feat/operator-guide-a96538bc  
**Diff stat**: 28 files changed, 3760 insertions(+), 454 deletions(-)

---

## 観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## iteration 1 → iteration 2 での変化点

### operator adjudication により解決された点

| 項目 | iteration 1 | iteration 2 |
|------|------------|------------|
| TC-012: `parallel-request-workflow` | tombstone(DEPRECATED マーカー)で妥協、緩い OR 条件 | ディレクトリが実際に削除済み、TC-012 が厳密な `existsSync === false` を assert |
| `escalation.ts` ファイル先頭コメント | "4 required fields" — 実装(5 要素)と乖離 | "5 required fields" に修正済み |

### iteration 2 で新たに追加されたコード

- `guide.test.ts`: F1 直接 `resolveCommand` assertions (merge/audit/setup/request/inject topic のコマンド)  
- `guide.test.ts`: F2 `USAGE` が全 topic 名を含む drift-guard assertion  
- `src/cli/__tests__/init-snippet.test.ts`: F3 `runInit` 統合テスト (`buildClaudeMdSnippet()` が stdout に出る)  
- `command-registry.ts`: guide の `help.summary` を `GUIDE_TOPICS.map(t => t.name)` から導出するよう修正

---

## 確認手順

| # | 確認対象 | 手法 |
|---|----------|------|
| 1 | `escalation.ts` 両コメントの整合性 | ファイル全文を Read して file-level / function-level JSDoc を照合 |
| 2 | `init-snippet.test.ts` mock の漏れ | `init.ts` import 一覧 vs test の `vi.mock` 呼び出しを突合 |
| 3 | `command-registry.ts` USAGE 生成 — 既存テストとの整合 | `command-spec-api.test.ts` / `detach-output-contract.test.ts` の assertion パターン確認 |
| 4 | TC-012 strict assert と実ディレクトリ状態の整合 | `ls .claude/skills/` で確認 |
| 5 | LOOP_ERROR_CODES.hint — iteration 1 からの継続ギャップ | 前回 operator adjudication で設計決定済みのため再確認のみ |
| 6 | `guide.ts` top-level 実行 — iteration 2 変更が副作用を持たないか | import chain 確認 |

---

## 項目別結果

### 1. `escalation.ts` コメントの内部整合性 ⚠️

ファイル先頭コメント(file-level)は修正済み:

```typescript
/**
 * Escalation formatter for finish command.
 * TC-023: formatEscalation must include 5 required fields:
 *   failedStep, detectedState, recommendedAction, resumeCommand, guide escalation hint
 */
```

しかし、関数直上の JSDoc はそのまま:

```typescript
/**
 * Format an escalation block for stdout output.
 * All 4 fields are required and will always appear in the output.
 */
export function formatEscalation(params: EscalationParams): string {
```

operator adjudication の指示は「ファイル先頭コメント」の更新のみを明示していたため、関数 JSDoc は対象外だった。結果として同一ファイル内に「5 required fields」と「All 4 fields」が共存する状態になった。  
機能的な破壊はなく、実装・テスト・runtime 挙動はすべて正しい。開発者が関数 JSDoc を正典として読んだ場合にのみ混乱が起きる。

⚠️ **低重要度コメントドリフト** — 機能破壊なし、同一ファイル内の 2 コメント間不整合

---

### 2. `init-snippet.test.ts` mock カバレッジ

`init.ts` の import 一覧と test mock の突合:

| import | パス | mock 状況 | 実行経路 |
|--------|------|-----------|---------|
| `node:fs/promises` | — | ✅ `access`/`mkdir` mocked | `access` → resolves → `configExists=true` |
| `node:readline` | — | 未 mock | `configExists=true` なので `if (!configExists)` ブロック未到達、呼ばれない |
| `loadConfig`/`saveConfig` | `config/store.js` | 未 mock | 同上 — 未到達 |
| `getConfigPath` | `util/xdg.js` | ✅ mocked | `configExists` 判定用 |
| `logInfo`/`logResult`/`stdoutWrite` | `logger/stdout.js` | ✅ mocked | stdout キャプチャで assert |
| `ensureDotSpecrunnerGitignore` | `util/gitignore.js` | ✅ mocked | `.gitignore` 処理をスキップ |
| `changesDirRel`/`draftsDir` | `util/paths.js` | 未 mock | 純粋関数、I/O なし |
| `PROVIDER_DEFAULTS` | `config/model-registry.js` | 未 mock | `if (!configExists)` ブロック未到達 |
| `buildClaudeMdSnippet` | `core/command/guide.js` | 未 mock (意図的) | 純粋関数を実 call して期待値生成に使用 |

`guide.ts` が import する `../../logger/stdout.js` は test ファイル相対の `../../logger/stdout.js` と同一モジュールパスに解決される。mock は `init.ts`・`guide.ts` 両側の stdio を共通に捕捉する。

✅ **問題なし**

---

### 3. `USAGE` 生成変更 — 既存テストとの整合

`command-registry.ts` の guide `help.summary` が `GUIDE_TOPICS.map(t => t.name).join(" ")` で動的導出に変わった。  
既存の USAGE 依存テスト:

- `detach-output-contract.test.ts` TC-019: `USAGE.toContain("job wait")` / `USAGE.toContain("--detach")` — guide 追加は非干渉
- `command-spec-api.test.ts` TC-036: `requiresRepo` の個別確認、`guide` を列挙しない — 非干渉

新追加の TC-008 drift-guard (`USAGE が全 topic 名を含む`) は registry 由来のため手書き重複がない。  
✅ **問題なし**

---

### 4. TC-012 strict assert — ディレクトリ実状態との整合

`ls .claude/skills/` 結果:
```
acceptance-and-issue-audit
job-run-monitor
rebase-finish
```

`parallel-request-workflow` ディレクトリは実際に不在。TC-012 の strict `fs.existsSync(prwDir) === false` assertion は実状態と整合する。  
✅ **完全解決**

---

### 5. `LOOP_ERROR_CODES.hint` — 継続ギャップ(再確認)

iteration 1 で operator adjudication 済みの設計決定: 設計 `design.md` Open Questions に「要件 3 は formatEscalation と resumePoint.reason を名指しする。LOOP_ERROR_CODES の hint は対象外。広げる場合は別 request。」と明記。  
6 種の hint 関数はいずれも `specrunner guide escalation` 導線を持たないままだが、これは operator 承認済みのスコープ限定。  
⚠️ **operator adjudication 済みのギャップ** — 再指摘不適

---

### 6. `guide.ts` 変更なし — import chain 副作用

iteration 2 で `guide.ts` 本体に変更はない。`init-snippet.test.ts` と `guide.test.ts` の F1/F2 追加は test code のみ。cross-boundary invariant への影響なし。  
✅ **問題なし**

---

## サマリー

| 項目 | 判定 | 備考 |
|------|------|------|
| `escalation.ts` function JSDoc "All 4 fields" — file-level と乖離 | ⚠️ [low, fixable] | 機能破壊なし。同一ファイル内 2 コメント間の文書不整合 |
| `init-snippet.test.ts` mock カバレッジ | ✅ | 未到達経路の未 mock は正しい設計 |
| `USAGE` 生成変更と既存テスト互換 | ✅ | `toContain` 系 assertion に非干渉 |
| TC-012 strict assert と実ディレクトリ状態 | ✅ | ディレクトリ不在を確認 |
| `LOOP_ERROR_CODES.hint` 導線欠落 | ⚠️ (承認済み) | operator adjudication 済みのスコープ制限 |
| `guide.ts` iteration 2 変更なし — 副作用なし | ✅ | — |

**新規の不変条件破壊**: なし  
**未解決の残留問題**: `escalation.ts` 関数 JSDoc コメントドリフト [low, fixable]  
**operator adjudication 済みの既知ギャップ**: 1 件 (LOOP_ERROR_CODES.hint)
