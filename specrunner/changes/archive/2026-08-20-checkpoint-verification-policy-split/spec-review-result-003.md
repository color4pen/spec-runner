# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 前周 findings の再確認

**[medium] spec.md: generic check 列挙に request.md が含まれており tasks.md と矛盾する**

現在の spec.md 第二 Requirement 末尾に以下の Note が追記されている:
> Note: (d) request.md presence is verified after `policy.verify()` and before identity (e),
> consistent with the execution order defined in tasks.md T-02.

T-02 の「呼び出し位置: profile 検証の後、request.md 存在確認（(d)）の前」と整合しており、矛盾は解消された。✓

**[low] test-cases.md: Result YAML の automated: 11 が Summary の 14 件と不整合**

test-cases.md Summary は「Automated (unit/integration: 11, gate: 3): 14」、
Result YAML は `automated: 14` となっており整合。✓

**[low] tasks.md T-03: Acceptance Criteria に TC-004 が記載されておらず自己完結しない**

T-03 Acceptance Criteria に以下が追加されている:
> corrupted journal の checkpoint で `policy.verify()` が呼ばれる前に `journal-corrupted` で throw することがテストで確認できる（generic → policy の実行順序 pin、TC-004）

TC-004 が明示されており自己完結している。✓

---

### アーキテクチャ

- **D1（デフォルト引数で後方互換）**: `policy = attachResumePolicy` デフォルト引数により既存呼び出し元（orchestrator.ts 等）が無改変で動く。orchestrator.ts L84 `verifyCheckpoint({ ... })` が引数なしで呼ぶ点を確認。適切な設計。
- **D2（新ファイル配置）**: `checkpoint-policy.ts` を `src/core/attach/` 内に留め、cross-layer import を発生させない。architecture allowlist への新エントリ不要。
- **D3（generic 検証は verifyCheckpoint に残す）**: 整合性破綻の checkpoint を policy に流さない fail-fast 設計。実行順序: (b-new)→(b)→(b-new)→(profile)→policy.verify()→(d)→(e)。元コードと同一順序を保持。
- **D4（PolicyVerificationContext の最小化）**: `{ state, slug, treeFiles }` に限定。branch / expectedRepo / checkpointOid は policy に不要で露出しない。最小公開原則。
- **D5（sync policy）**: 現在の実装に async 不要。verifyCheckpoint が既に async なので将来 `await policy.verify()` への変更はトリビアル。

---

### 正確性

**TC-006 の fixture 仕様**（「non-null resumePoint は検証なしで passthrough」）を resolve-step.ts で確認:
- `resolveResumeStep` L119-130: `resumePoint !== null` のとき `toStepName(resolvedStep)` を `allowed` 集合チェックなしで返す。
- `toStepName` は `name as StepName` のキャストのみで例外を投げない。
- よって non-null resumePoint は常に通過する。spec.md / tasks.md の記述は正確。✓

**実行順序の保存**: verify-checkpoint.ts 現在の (a)(c)(d-new) の位置（L172-L238）が policy.verify() に移動し、(d) request.md は L241 でその後に続く。tasks.md T-02 の「profile 後・request.md 前」と整合。✓

**T-01 import リスト**: `getPipelineDescriptor`（L18）、`getPipelineId`（L19）、`resolveResumeStep`/`buildAllowedStepSet`（L22）、`StepDeps`（L28）が verify-checkpoint.ts の (a)(c)(d-new) ブロックで現在使用されており、checkpoint-policy.ts への移動が必要十分。✓

---

### 完全性（タスク分解カバレッジ）

| request 受け入れ基準 | カバーするタスク |
|---|---|
| 既存 attach テストが無改変で green | T-02（デフォルト引数で後方互換）、T-04 |
| rebind primitive が policy 注入を受け取り、generic 検証が独立 | T-01、T-02、T-03（TC-003/004） |
| attachResumePolicy 単体テスト（3 種の拒否） | T-03（TC-005/006/007） |
| architecture テスト green | T-03（TC-012）、T-04 |
| typecheck / test green | T-04 |

全 AC がタスクに対応している。✓

---

### test-cases.md カウント検証

- Unit (TC-001〜007, TC-010, TC-011): 9
- Integration (TC-008, TC-009): 2
- Gate (TC-012〜014): 3
- 合計: 14、Summary の「unit/integration: 11, gate: 3, total: 14」と整合。✓

---

### 新 finding

**design.md の spec-fixer-deferred コメントが陳腐化**

design.md 末尾に以下のコメントが残存:
```
<!-- spec-fixer-deferred: [LOW] Result YAML の automated: 11 が Summary の 14 件と不整合
spec-fixer の scoped write paths に test-cases.md が含まれないため修正不可。
test-cases.md の Result YAML 内 automated: 11 を automated: 14 に変更する必要がある。 -->
```

test-cases.md の Result YAML は既に `automated: 14` となっており、このコメントが指摘する問題は解消済みである。コメントの記述が現状と矛盾しており、将来のメンテナンスで誤解を招く可能性がある。

---

## 検証できなかった項目

None（全項目を確認した）。

## Findings 詳細

### [LOW] design.md の spec-fixer-deferred コメントが陳腐化している

- **ファイル**: `specrunner/changes/checkpoint-verification-policy-split/design.md`
- **内容**: design.md 末尾の HTML コメントに `automated: 11 を automated: 14 に変更する必要がある` と記載されているが、test-cases.md は既に `automated: 14` を示している。コメント自体が解消済みの問題を指摘しており、現状と矛盾する。
- **修正**: コメントを削除するか、「解消済み」に書き換える。
