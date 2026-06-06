# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✅ | T-01〜T-19 全チェックボックス完了 |
| design.md | ✅ | D1〜D9 すべてに対応する実装確認（後述） |
| spec.md | ✅ | 全 15 Requirement の実装確認 |
| request.md | ✅ | 受け入れ基準 17 項目確認（`StepRun.modelUsage` 型残留は非ブロッキング — 後述） |

---

## 1. tasks.md — 全チェックボックス完了

T-01〜T-19 の全タスクが `[x]` で完了済み。

---

## 2. Design Decisions 実装確認

| 決定 | 実装ポイント | 判定 |
|------|------------|------|
| D1: 3-store 分離 | `event-journal.ts` append-only、`state.json` atomicWriteJson、`.specrunner/local/<slug>/liveness.json` | ✅ |
| D2: JSONL レコードスキーマ + fold | `StepAttemptRecord \| TransitionRecord \| InterruptionRecord`、fold で partial 末尾を無視し attempt を位置から導出 | ✅ |
| D3: append/overwrite の物理分離 | `fs.appendFile` のみで journal 追記、delta カウンタ + crash recovery（fold 行数 > カウンタ時リセット） | ✅ |
| D4: history 永続 truncation 撤廃 | `appendHistoryEntry` truncation なし、`MAX_HISTORY_SIZE` は表示 cap 専用に転換 | ✅ |
| D5: slug identity + 導出フィールド除去 | `stateToStateJson(slugMode:true)` が `worktreePath/pid/session/request.slug/request.path` を strip、load 時に convention から injection | ✅ |
| D6: 一括 derive 廃止 + per-step usage | `deriveAndWriteUsage` は no-op、executor.ts が step 完了ごとに `appendInvocation` | ✅ |
| D7: worktree 不変量 + dual-read 列挙 | `list()` が 5ソース（slug 現 checkout / archive / worktrees / legacy / managed marker）を合成・dedup | ✅ |
| D8: machine-local sidecar + worktreePath 再導出 | `writeLivenessSidecar` 実装、cancel/archive の 3-step fallback（state.worktreePath → sidecar → `buildWorktreePath`）実装 | ✅ |
| D9: 非破壊 backward-compat | `load()` が slug → split-layout → legacy flat file の順に fallback | ✅ |

---

## 3. Spec Requirements 確認

| Requirement | 実装確認 |
|-------------|---------|
| 単一 JSON 分割（段1） | `JobStateStore.create` が `events.jsonl + state.json` を生成 ✅ |
| append/overwrite 分離 | TC-003/TC-030 で crash safety 保証 ✅ |
| fold が partial 末尾を無視 | TC-004 ✅ |
| fold 同値保証（routing/resume） | TC-005（fixableCount）、TC-006（fixer-empty）、TC-028（attempt 連番）✅ |
| change folder 同梱（段2） | slug mode store が `changes/<slug>/` に書き、step commit に含まれる ✅ |
| CI 再 checkout resume | slug mode で `request.path` が `changes/<slug>/request.md` に injection ✅ |
| machine-local 除外 | TC-009 で state.json に worktreePath/pid/session 不在を確認 ✅ |
| cost per-step | executor.ts line 545–557 で `appendInvocation` を step 完了ごとに呼び出し ✅ |
| interruption event 1件 | `store.appendInterruption` が executor timeout 経路と exit-guard signal 経路で呼ばれる ✅ |
| history 保持 | transition record を journal に append、fold が `history` を返す ✅ |
| archive に state ファイル含む | `archiveChangeFolder` が `changes/<slug>/` ごと移す（strip しない）✅ |
| active 列挙 + --all | `job ls` 既定は非終端のみ（ps.ts）、`--all` で全 status ✅ |
| exit-guard per-job | `createExitGuardHandler(repoRoot, jobId?)` — jobId あり時は自 job のみ遷移 ✅ |
| 再 run 非破壊 | 新 jobId8 の worktree を作成、旧 branch に触れない ✅ |
| backward-compat 移行 | `load()` が legacy flat file を `validateJobState` 経由で正規化 ✅ |

---

## 4. Acceptance Criteria 確認（request.md）

受け入れ基準 17 項目すべて充足。

### 注記: `StepRun.modelUsage` 型定義の残留（非ブロッキング）

`src/state/schema.ts` の `StepRun` に `modelUsage?: Record<string, ModelUsage>` が optional で残っている。
ただし:
- `stepRunToRecord()` は modelUsage を journal レコードに書かない
- `stateToStateJson()` は steps を state.json から除外する

実際の永続ファイル（`state.json` / `events.jsonl`）に modelUsage は書き込まれない。
受け入れ基準「`changes/<slug>/state.json` / `events.jsonl` に modelUsage が含まれない」は満たされている。
型定義の完全除去は別 change として切り出せる技術的負債だが、観測可能な挙動への影響はない。

---

## 5. テスト結果

```
bun run typecheck  → clean（エラーなし）
bun run test       → 273 test files passed、3233 tests passed
```

---

## 結論

段1・段2 の全要件が実装され、全テスト green。設計判定 D1〜D9 すべてに対応する実装とテストが揃っている。
