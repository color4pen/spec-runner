## Spec Fixer Decisions

### Finding #1 (HIGH) — branch-registration/spec.md に MODIFIED Requirement を追加する :: 既存の `register_branch Database Persistence` Requirement の `Idempotent re-registration (last-write-wins)` Scenario は「agent 値をそのまま DB に書き込む」契約だが、D4（CLI canonical）と矛盾する。ADDED のみで重ねると spec の意味が二重化するため、MODIFIED ブロックで既存 Requirement を更新し「last-write-wins は agent 同士の再登録に限り、CLI canonical 値が常に優先される」と明示する必要がある

### Finding #2 (HIGH) — agent-runner-port/spec.md の `AgentRunner adapter は branch / path verification を内部で行う` Requirement に path verification Scenario を追加する :: design.md D5 と request.md task 1.8 の両方が「path 検証も adapter 内」を要求しているが、既存 Scenario は branch 検証のみ。`step.resultFilePath !== null` のとき result file が取得不能な場合のエラー Scenario が欠落していると実装者が「branch だけ検証 / path 未検証」に流れるリスクがある。managed は GitHub API 404、local は fs.existsSync false を同等に扱うことも明示する

### MODIFIED header の exact match を確認する :: main spec の `### Requirement: register_branch Database Persistence` と完全一致する header で MODIFIED ブロックを作成し、openspec validate の header 照合を通過させる
