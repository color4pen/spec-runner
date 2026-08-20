# cross-boundary-invariants Review — issue-target-resume-from-issue

**Iteration**: 1  
**Reviewer**: cross-boundary-invariants  
**Scope**: 変更が diff していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないか

---

## 検査対象ファイル

| ファイル | 役割 |
|---|---|
| `src/core/issue-target/resume.ts` | ドメイン層 resolver（新規） |
| `src/cli/resume-from-issue.ts` | CLI オーケストレーター（新規） |
| `src/adapter/github/github-client.ts` | `listIssueLinkedBranches` 追加 |
| `src/core/notify/issue-notifier.ts` | `parseEscalationJobId` 追加 |
| `src/errors.ts` | 3 エラーコード追加 |
| `src/cli/command-registry.ts` | `--from-issue` flag 配線 |
| `src/core/command/guide.ts` | escalation topic 更新 |

---

## Finding 1 — `slug` の二重導出：`setupWorkspace` と `runResumeCore` の不一致リスク

**severity**: medium  
**resolution**: fixable  
**file**: `src/cli/resume-from-issue.ts`  
**lines**: 143, 186, 215

### 観察

`runResumeFromIssue` の needsRebind=true 経路で `slug` 変数は 2 つの独立した checkpoint 読み出しから異なる値を持ちうる:

```
L143:  slug = resolved.slug;      // readCheckpointFromRef(checkpointOid₁) — identity check
       ...
L186:  setupWorkspace(verified.slug, ...)   // readCheckpointFromRef(checkpointOid₂) — runAttachVerification
       ...
L215:  return runResumeCore(slug, ...)      // resolved.slug を使用
```

`resolved.slug` は `resolveResumeBranchFromIssue` 内の最初の `git fetch` + `rev-parse` + `readCheckpointFromRef` から導出される（OID₁）。  
`verified.slug` は `runAttachVerification` 内の二回目の `git fetch` + `rev-parse` + `readCheckpointFromRef` から導出される（OID₂）。

二回の fetch の間に remote branch が force-push され、新しい checkpoint の change folder 名が異なるケース（例: slug 変更やフォルダ再構成）では：
- `setupWorkspace(verified.slug, ...)` は新しい slug でワークスペースを作成する
- `runResumeCore(slug, ...)` は古い `resolved.slug` でローカル state を探索する
- `resolveJobStateBySlug(resolved.slug, repoRoot)` は state を見つけられず、`repo = { owner: "", name: "" }` のまま `bootstrap` へ進み、resume が失敗する

### 暗黙の前提（破られうる不変条件）

> `setupWorkspace` と `runResumeCore` に渡す `slug` は同一の checkpoint 読み取りから派生しなければならない。

`attach.ts` の既存実装は `verified.slug` のみを使用しており、この分岐は存在しない（参照: `attach.ts:144, 162, 163`）。

### 修正

needsRebind=true 経路で `setupWorkspace` 完了後に `slug` を更新する:

```typescript
await runtime.setupWorkspace(verified.slug, verified.jobId, { ... });
slug = verified.slug; // ← この1行を追加
```

これにより `runResumeCore(slug, ...)` は常に `verified.slug` を使用し、TOCTOU ウィンドウが消去される。

### 実用リスク評価

`awaiting-resume` 中の feature branch への force-push は通常発生しない（pipeline が停止中）。slug 変更を伴う push はさらに稀。ただし、構造的な不変条件として設計上は保証されるべきであり、1 行の fix で解決する。

---

## Observation 1 — `resolved.checkpointOid` は計算されるが使用されない

**severity**: low  
**file**: `src/core/issue-target/resume.ts`  
**lines**: 87–88, 147, 182

`resolveResumeBranchFromIssue` の戻り値 `checkpointOid` は `resume-from-issue.ts` で使用されていない。実際に `setupWorkspace` に渡される OID は `verified.checkpointOid`（`runAttachVerification` が独自に解決したもの）である。

設計 D3 の意図（識別選定と rebind 検証の分離）には適合しているが、戻り値インターフェースに不使用フィールドが存在することは API の誤誘導になりうる。正確性への影響はない。

---

## Observation 2 — TC-001 テストは `verified.slug` 優先を pin しない

**severity**: low  
**file**: `src/cli/__tests__/resume-from-issue.test.ts`  
**line**: 259–264

TC-001 は `runResumeCore` が `"test-slug"` で呼ばれることを期待しているが、`resolveResumeBranchFromIssue` と `runAttachVerification` の両モックが同じ `slug: "test-slug"` を返すため、Finding 1 の修正（`slug = verified.slug`）を適用しても同テストは通過する。

Finding 1 の修正後に、slug が diverge するシナリオ（`resolved.slug !== verified.slug`）を pin するテストを追加することが望ましい。修正なしに現状を pin することも可能だが、その場合は不変条件違反を固定することになる。

---

## 検証済み不変条件

| 不変条件 | 結果 |
|---|---|
| `core/issue-target/resume.ts` が `cli/` / `adapter/` を import しない（B-1 / TC-001） | ✓ import 一覧を確認。kernel, git, errors, logger のみ |
| `resume-from-issue.ts` 内で `process.cwd()` を直読みしない（CWD ratchet） | ✓ grep で確認。コメント1行のみ |
| `command-registry.ts` の `cwd: process.cwd()` が既存 allowlist で被覆される | ✓ `CWD-registry-generate-resume-attach-archive-debt` エントリが対応 |
| arch-allowlist に新エントリが追加されていない | ✓ `resume-from-issue` 関連エントリなし |
| `listIssueLinkedBranches` が非 2xx / GraphQL errors / null issue で fail-closed | ✓ 各ケースで `githubApiError` を throw |
| `parseEscalationJobId` の正規表現が `buildMarker` の literal 構造に対応 | ✓ format 定義を比較、round-trip が成立 |
| 複数 escalation marker で `createdAt` 降順の最新が選ばれる | ✓ `sort` ロジックを確認 |
| identity 3-field check（jobId + issueNumber + branch）が型安全 | ✓ schema が `issueNumber` を `number \| null` に強制（`operations.ts:246`） |
| リンク 0 件・複数 full 一致・全候補 read 不能 がそれぞれ異なる fail-closed エラー | ✓ ロジックと error factory を確認 |
| detach の 2 経路（local-state 有 / 無）が正しく動作する | ✓ 実装と TC-013 を確認 |
| `attachResumePolicy`（status / resumePoint / reads()）の検証失敗が正しく伝播する | ✓ `try/catch` で SpecRunnerError を再 throw |
| `setupWorkspace` と `runResumeCore` が同一の `slug` を使用する（= Finding 1 の対象） | ✗ 構造的保証なし |
| `resolveResumeBranchFromIssue` が unreadable 候補をスキップして全体を止めない | ✓ `skipped.push(branch); continue` パターン |
| `issue.body` / `getIssue` が resolve 経路で呼ばれない（D5） | ✓ port interface に `getIssue` はあるが resolver は使用しない |
