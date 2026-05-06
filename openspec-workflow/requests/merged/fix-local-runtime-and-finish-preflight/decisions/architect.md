# Architect Decisions — fix-local-runtime-and-finish-preflight

## Spec Review (Iteration 1)

setsBranch フラグを承認する :: step 名ハードコード（`step.name === "propose"`）を排除する設計方針は TC-003 の要件と整合し、将来の拡張性も担保する。AgentStep interface に optional boolean を追加するコストは最小限

completionVerdict fallback の設計を承認する :: local runtime path で `resultContent === null` のときに step 宣言の completionVerdict を参照する方式は、managed runtime path（_updatedState 分岐）と対称的で整合する

regex 統合は適切だが regex の正確性を確認する必要がある :: design.md の regex `^[-\s]*\*{0,2}verdict\*{0,2}:\s*(approved|needs-fix|escalation)\s*$/mi` は意図を表現しているが、`[-\s]*` が `---` のような区切り線にも pre-match する可能性を指摘する

MERGED bypass の挿入位置は妥当 :: fetchPrViewWithRetry 内の UNKNOWN retry 分岐前に MERGED 判定を入れる方式は、既存のフロー制御を最小限に変更する。orchestrator の prAlreadyMerged path との連携も確認済み

delta spec の Step interface 定義と main spec の現状に差分がある :: delta spec は `completionVerdict` と `setsBranch` を AgentStep に追加するが、main spec にはすでに `completionVerdict` が存在する（L67-73 types.ts）。delta spec が「追加」と記述しているのは不正確で、`setsBranch` のみが新規追加。completionVerdict は「既存フィールドの local runtime path での利用を spec に明文化」が正しい記述
