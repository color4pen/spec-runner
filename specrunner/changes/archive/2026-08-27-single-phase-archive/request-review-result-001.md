# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. コードアサーション実在確認

| アサーション | 確認結果 |
|---|---|
| `src/core/archive/plain-archive.ts` 存在・2相動作 | ✓ L186-194: PR present → awaiting-archive 維持、re-run 案内を出力 |
| `src/core/archive/merge-completion.ts` 存在 | ✓ `completeAfterMerge` / `mergedBeforeRecordEscalation` の両関数を確認 |
| `.github/workflows/specrunner-dispatch.yml` 存在・2相コメント | ✓ L33-36: "2 相の実行を前提とする" コメントを確認 |

### 2. 現行 2 相契約の正確な把握

**`plain-archive.ts` L186-194（現行 PR OPEN path）**
```ts
if (prNumber !== undefined) {
  stdoutWrite(
    `Job '${slug}' remains in awaiting-archive until PR #${prNumber} is merged. ` +
    `After the PR is merged, re-run: specrunner job archive ${slug}`,
  );
  return { exitCode: 0, headSha };
}
```
`markJobArchived` も `runPostMergeCleanup` も呼ばれない → awaiting-archive を維持するのが現行動作。request の「正しい操作モデル」が変更しようとしている箇所と一致する。

**`orchestrator.ts` L241-243（コメント）**
```
// Status transition (awaiting-archive → archived) is NOT performed here.
// It is the caller's responsibility to call markJobArchived after the PR is merged,
// via completeAfterMerge (runPlainArchive) or performPostMergeTransition (--with-merge).
```
orchestrator は現行でも transition を行わない設計。新設計でも orchestrator は変更不要で、plain-archive 側が push 直後に cleanup + markJobArchived を呼ぶ形に移行できる。

### 3. 残置ジョブ（Req 10）対応の実現性

TC-013（MERGED + archiveRecorded → completeAfterMerge）は現行でも動作している。新設計でも同様に `archiveRecorded: true` + PR MERGED のケースを cleanup + transition で処理できる。

### 4. ワークフロー変更 (Req 7)

`specrunner-dispatch.yml` L33-36 の「2 相の実行を前提とする」コメントと L34-36 の 1 回目・2 回目の説明は、新設計で削除・書き換えが必要。コメント削除は単純な変更であり、実現上の問題はない。

### 5. Req 9（PR 既 MERGED 時の設計明示）の解釈確認

現行は `MERGED + !archiveRecorded → mergedBeforeRecordEscalation`（escalation で終了）。  
Req 9 は「少なくとも `archived` + cleanup へ終端できること。archive record commit が main に届かない可能性は警告でよいが terminal transition の条件にしない」と明示している。  
この要件は現行の escalation 動作を「警告 + 続行」に変更する旨を明確に述べており、設計段階で処理分岐の設計を求めている。デザイン step 以降で解決すべき設計判断として適切に記述されている。

### 6. ADR フラグ

`adr: true` が設定されており、`merge-completion.ts` の delete/keep 判断が ADR に委ねられている。design step の設計に基づいて adr-gen が生成する運用として適切。

### 7. 既存テスト（TC-011〜TC-041）への影響

TC-011: PR OPEN → `markJobArchived` NOT called は新設計では **逆に呼ばれる方向** に変わる。  
TC-014: PR OPEN → cleanup NOT called も同様に逆転する。  
TC-024: re-run guidance が新設計では不要になる。  
これらのテスト変更は implementer step の責務であり request の欠陥ではない。受け入れ条件に "typecheck / test が green" とあり適切に委ねられている。

## 検証できなかった項目

None — 主要な確認対象（コードアサーション、既存動作、非目標の境界）はすべて確認できた。

## Findings 詳細

指摘なし。コードアサーションはすべて正確で、要件・受け入れ条件・非目標は矛盾なく記述されており、実装可能性に問題はない。
