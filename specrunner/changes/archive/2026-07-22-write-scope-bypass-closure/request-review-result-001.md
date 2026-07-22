# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Step 1: コードアサーション照合（現状コードの前提）

以下の全アサーションをコードで直接確認した。

| アサーション | 確認箇所 | 結果 |
|---|---|---|
| `commit-push.ts:117` — commit は pathspec なし（index 全体） | `["commit", "-m", commitMessage]`（pathspec なし） | ✅ |
| `commitAndPushTail` — HEAD 前進時に push のみ（内容検査なし） | lines 102-112: `pushOnly` を呼ぶだけ、`findWriteScopeViolations` 呼び出しなし | ✅ |
| scoped 残余検査: `findWriteScopeViolations`（保護正典パス − 宣言 writes）のみ、検出時は退避・復元して**続行** | lines 260-276: throw なし、return なし、`commitAndPushTail` に fall-through | ✅ |
| guarded mode: `git status --porcelain` → 違反あり → quarantine + restore + WRITE_SCOPE_VIOLATION halt | lines 282-320: `throw writeScopeViolationError(...)` | ✅ |
| 違反証跡の退避機構（`.specrunner/local/<slug>/write-scope-violation-*.md`）は導入済み | `quarantineViolationEvidence` 関数（lines 142-180） | ✅ |
| `headBeforeStep` は `commitAndPush` に渡されている | line 219 パラメータ、line 324 で `commitAndPushTail` に受け渡し | ✅ |

### Step 2: 3 突破経路の実在確認

**経路 1: 事前 stage の混入**

- scoped mode では `git add -A -- <stagePaths>` で宣言パスのみを stage する（lines 239-242）
- しかし `git commit -m commitMessage`（line 117）は pathspec なし = index 全体を commit する
- step 実行前に許可外ファイルが index に stage 済みであれば、それも commit に混入する
- ✅ 欠陥確認

**経路 2: agent 自己 commit の無検査 push**

- `hasChanges` が false（staged なし）かつ HEAD 前進 → lines 105-109 で `pushOnly` を直接呼ぶ
- `findWriteScopeViolations` は呼ばれない。commit 内容の検査は一切行われない
- ✅ 欠陥確認

**経路 3: 復元して続行**

- scoped 残余違反検出後（lines 263-276）: quarantine → stderrWrite → git clean → git checkout HEAD で処理が fall-through する
- `throw` も `return` もなく `commitAndPushTail` に続く
- step が改変済み正典を読んで出力した結果が無言で採用される
- ✅ 欠陥確認

### Step 3: 要件の網羅性確認

- **要件 1**（agent 自己 commit 検査）: `headBeforeStep..HEAD` の変更パスを write-scope ルールで検査し、違反があれば push せず halt する。既存の `headBeforeStep` パラメータが使用可能。
- **要件 2**（index 混入遮断・scoped）: commit を pathspec 付き（`git commit -- <stagePaths>`）にすること、および `git diff --cached --quiet -- <stagePaths>` によるスコープ限定の staged 判定。両方明示されており実装可能。
- **要件 3**（scoped 残余 halt 化）: 復元後に `throw writeScopeViolationError(...)` を追加する変更。guarded と対称化。
- **要件 4**（証跡）: 既存 `quarantineViolationEvidence` を経路 1 にも適用。経路 2（自己 commit diff）は `git diff headBeforeStep HEAD -- <path>` で取得可能。
- **要件 5**（正常経路の保存）: 境界内のみの変更には既存 path を維持する要件が明示されている。

### Step 4: 受け入れ基準の検証可能性確認

全 8 基準がテストで機械的に固定可能。特に「修正前の挙動に戻すと fail する破壊確認」の要件が含まれており、退行耐性の設計になっている。

### Step 5: スコープ外の妥当性確認

- `commitScopedPaths`（並列 round coordinator）も line 447 で pathspec なし commit を使用しているが、スコープ外として明示されている（"同一欠陥が確認された場合のみ同修正"）。coordinator 経路は `partitionRoundChanges` による変更セット制限があるため、事前 stage 混入の影響は sequential path とは異なる文脈であり、独立した確認が妥当。
- SDK 層・過去 commit 遡及など、他のスコープ外事項も理由付きで記載されている。

### Step 6: architect 評価済み設計判断の確認

- 「自己 commit を自動巻き戻し」却下の理由（証跡破壊）は明確。
- 「scoped 残余の続行維持」却下の理由（偽証跡構造）は明確。
- 採用設計は既存の `writeScopeViolationError` パターンとの整合性がある。

## 検証できなかった項目

None

## Findings 詳細

指摘なし。
