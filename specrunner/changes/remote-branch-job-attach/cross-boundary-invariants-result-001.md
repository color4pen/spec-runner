# Cross-Boundary Invariants Review — remote-branch-job-attach

- **reviewer**: cross-boundary-invariants
- **iteration**: 1
- **verdict**: approved

## 観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## 調査範囲

変更ファイル 31 件（src/ 8 ファイル変更、テスト 6 ファイル追加、仕様成果物 17 ファイル）。主要な検査対象:

- `src/core/runtime/workspace-materializer.ts` — 新 plan variant `attach-from-checkpoint`
- `src/core/runtime/local.ts` — `setupWorkspace` の attach early-return、`writeLivenessSidecar` の `pid` optional 化
- `src/store/job-state-projection.ts` — `composeSplitLayoutFromContent` 追加・委譲リファクタ
- `src/git/checkpoint-ref.ts` — 新モジュール
- `src/core/attach/verify-checkpoint.ts` — 検証述語
- `src/core/attach/orchestrator.ts` — fetch → read → verify シーケンス
- `src/cli/attach.ts` — CLI エントリポイント
- `src/errors.ts` — 4 つの error code 追加

---

## Findings

### F-01 `pid=null` sidecar は `assertNoDuplicateLiveJob` をバイパスする（設計上の意図的動作、low）

**ファイル**: `src/core/runtime/duplicate-slug-guard.ts`（変更なし）と `src/core/runtime/workspace-materializer.ts:139`

`checkDuplicateLiveJob` は以下のロジックで live pid を判定する：

```ts
const pid = data["pid"];
if (typeof pid !== "number") {
  return; // permissive case
}
```

attach が書く `{ pid: null, ... }` は `typeof null === "object"` → `!== "number"` → early return（許可）。
これは guard のドキュメントに明示された permissive case 3 に一致する：
> `pid` field is missing or not a number → allow

したがって `job attach` 後、`job resume` より前に同一 slug で `job start` を呼ぶと：
1. guard を通過（pid が number でないため）
2. 新 jobId で新 worktree を作成
3. sidecar を上書き

新 sidecar は別 jobId を指し、attach 済み worktree は sidecar から切り離される。ただし `JobCatalog.listWithSourceDirs` section 2（`.git/specrunner-worktrees/*/specrunner/changes/*/state.json` 走査）は attach 済み worktree を引き続き発見できる（sidecar なしでも）。  

**判定**: guard の既存 invariant（"live pid が alive なら拒否"）は破られていない。quiescent job を live job と区別する設計は ADR-20260715 D4 に準拠。ただし **"slug あたり 1 sidecar binding"** という非公式な期待が `pid=null` 状態で緩くなる点は、attach → 重複 start というユーザー操作ミスで顕在化しうる。existing discovery（section 2 worktree scan）が補完するため data loss にはならない。

**重大度**: low（設計上の意図的動作、ユーザー誤操作が必要、data loss なし）

---

### F-02 `resume-existing` arm の `recopyDraftToChangeFolder` が attach 後 resume で呼ばれる（既存挙動、info）

**ファイル**: `src/core/runtime/workspace-materializer.ts:92`（変更なし）

attach 後に `job resume <slug>` を実行すると、resume path は `resume-existing` arm を通る。この arm は `recopyDraftToChangeFolder` を呼ぶ。

```ts
// ローカルに drafts/<slug>/request.md がなければ no-op
try {
  await fs.access(draftSrc);
} catch {
  return;  // Draft does not exist — no-op
}
```

**別環境（新規マシン）での attach→resume**: draft が存在しないため no-op ✅  
**同一マシンでの attach→resume**: ローカル draft が残っていれば checkpoint の `request.md` を上書きし git stage する。ただしこれは通常 resume でも同じ動作であり、本 change が導入した新しい挙動ではない。

**判定**: 既存 resume invariant と一致。attach が作る checkpoint の `request.md` が "上書きされてはならない" という本 change 固有の要件があれば別 ADR で扱うが、現在の ADR-20260715 はその制約を要求していない。

---

### F-03 `verifyCheckpoint` 内で `resolveResumeStep` が `logInfo` を呼ぶ可能性（minor設計不整合）

**ファイル**: `src/core/attach/verify-checkpoint.ts:104-116` / `src/core/resume/resolve-step.ts:101-104`

`verifyCheckpoint` の docstring は「NO I/O beyond the inputs it receives」と述べるが、`resolveResumeStep` を呼ぶため、`resumePoint.step` が reviewer member 名（custom reviewer）のとき `logInfo` による stdout 書き込みが発生する。これは変更していない `resolve-step.ts` の既存副作用。

セマンティクスへの影響はなく、テストでは stdout をキャプチャするか `vi.spyOn` で抑制可能。検証の正確性は維持されている。

**判定**: minor inconsistency（docstring と実装の乖離）。correctness には影響しない。

---

### F-04 `composeSplitLayoutFromContent` 委譲リファクタの挙動保全（確認済み・問題なし）

**ファイル**: `src/store/job-state-projection.ts`

既存 `composeSplitLayout` の内部ロジック（`_journal` 抽出 → slugInject → fold → validateJobState → resumePoint 復元 → legacy migration → compose）が `composeSplitLayoutFromContent` に移管され、`composeSplitLayout` はファイル読み→委譲の薄いラッパに変換。

`eventsJsonl.length > 0` ガード（`ENOENT` → 空文字列 → 空 fold は旧来の `ENOENT` 扱いと同一）を確認。  
`stateJson` が `ENOENT` のとき `fs.readFile` が throw → 既存挙動保全。  
既存 `composeSplitLayout` / `loadSplitLayout` / `JobCatalog` テストが無改変で green であることが T-10 で確認済み。

**判定**: 挙動不変リファクタ、問題なし ✅

---

### F-05 attach 後 resume の worktreePath 解決チェーン（確認済み・問題なし）

**ファイル**: `src/core/command/resume.ts:241-256`、`src/core/job-access/resolve-state-store.ts`

attach 後の sidecar: `{ pid: null, session: null, worktreePath: "<path>", jobId: "<jobId>" }`

`ResumeCommand.prepare()` の resolution chain:
1. `updatedState.worktreePath` → null（slug-mode state.json は worktreePath を strip）
2. sidecar 読み → `typeof sidecar["worktreePath"] === "string"` ✅ かつ `sidecar["jobId"] === updatedState.jobId` ✅ → `resolvedWorktreePath` が設定される

`resolveStateStoreByJobId` も同様に sidecar 経由で worktree slug store を解決。  
`persist(transitioned)` は state.json（worktree 内）に書き、sidecar は上書きしない（liveness write は別途 `writeLivenessSidecar` 経由）。

**判定**: attach→resume の state 解決チェーンは正しく機能する ✅

---

### F-06 `attach-from-checkpoint` arm が `updateJobState` を呼ばない（設計上の正しい動作）

**ファイル**: `src/core/runtime/workspace-materializer.ts:122-142`

新 arm は `bootstrapState` seed / `updateJobState` / `recopyDraftToChangeFolder` を行わない。checkout により worktree に branch-borne な state.json / events.jsonl が既に存在するため、これは ADR-20260715 D4 の "seed しない" 要件に準拠。

ただし `resume-existing` arm は `opts?.bootstrapState` を参照しない（T-05 AC 通り）。resume が transiton して persist した `running` 状態は worktree の state.json へ書かれるが、この時点では `origin/<branch>` はまだ `awaiting-resume`。第一 step の `commitAndPush` で同期される。

**判定**: 既存 `resume-existing` / `new-run` arm の invariant（registerWorkspace → updateJobState 順序）は attach arm が触れないコードパスにあり、侵食なし ✅

---

### F-07 `duplicate-attach`（同一 branch を 2 回 attach）のエラー型（設計上の既知 Risk）

2 回目 attach → `manager.create` → `git worktree add -b <branch>` がローカル branch の存在衝突で失敗 → generic な `Error`（非 `SpecRunnerError`）として `runAttach` の catch ブロックが処理。`err.exitCode` は 1。

design.md に「衝突を許容せずエラーで留め」と記載済みだが typed error を出さないため、ユーザーが「already attached、`job resume` を実行せよ」の案内を受けられない。

**判定**: UX gap（既知 Risk）。不変条件の破壊ではない。

---

## 全体判定

cross-boundary-invariants の観点で不変条件を実際に破る問題は検出されなかった。

- F-01 は設計上の意図的動作で既存 guard の permissive case と一致
- F-02 は既存 resume arm の挙動と同一
- F-03 は correctness に影響しない minor inconsistency
- F-04〜F-06 は問題なし
- F-07 は既知 Risk（UX gap）

- **verdict**: approved
