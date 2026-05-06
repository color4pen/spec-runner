# Implementer Decisions

## D1: setsBranch を AgentStep interface に追加する :: design.md D2 の指定通り。step 名ハードコードを避けるための宣言的フラグ方式を採用する。TC-006（step 名ハードコード禁止）が green であることを維持するため

## D2: ProposeStep に `setsBranch: true` と `completionVerdict: "success"` を追加する :: propose は resultContent が null で完了する step であり、completionVerdict fallback の恩恵を受ける必要がある。setsBranch で branch 自動設定を有効にする

## D3: executor.ts の local runtime path で completionVerdict fallback を実装する :: resultContent === null のとき step.completionVerdict を参照する。未定義なら既存の escalation fallback を維持する。managed runtime path（_updatedState 分岐）は変更しない

## D4: executor.ts の local runtime path で setsBranch ロジックを実装する :: step.setsBranch === true && !jobState.branch のとき state.branch = `feat/${deps.slug}` を設定する。deps.slug 経由で取得（step 内再導出禁止の制約遵守）

## D5: review-verdict regex を `^(?:-\s*)?\*{0,2}[Vv]erdict\*{0,2}:\s*(approved|needs-fix|escalation)\s*$` に拡張する :: spec-review-result の LOW 指摘（finding #3）を踏まえ、`[-\s]*` ではなく `(?:-\s*)?` に限定して markdown 区切り線（`---`）への false positive を回避する。`/mi` フラグで case-insensitive かつ multiline マッチを有効にする

## D6: preflight.ts の fetchPrViewWithRetry で UNKNOWN retry 前に MERGED チェックを挿入する :: GitHub API は MERGED PR に UNKNOWN を返すことがある。MERGED は不可逆終了状態なので merge 可能性チェック不要。`parsed.state === "MERGED"` を UNKNOWN 分岐の先頭に配置して即 success を返す

## D7: finish-orchestrator.test.ts TC-106 の mock を `mergeStateStatus: "UNKNOWN"` に修正する :: GitHub の実際の挙動（MERGED PR に UNKNOWN を返す）を再現するため。MERGED bypass ロジックが TC-106 で検証されるよう整合させる

## D8: preflight.test.ts に TC-013 相当（MERGED + UNKNOWN bypass）と TC-014 相当（OPEN + UNKNOWN retry 維持）を追加する :: test-cases.md の must テスト TC-013 を unit test として実装する。新規テストファイルを作成する
