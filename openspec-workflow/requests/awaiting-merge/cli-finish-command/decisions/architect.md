# architect decisions — cli-finish-command (iteration 1)

- module-analysis.md の Path correction notice (`src/cli/commands/finish.ts` vs `src/cli/finish.ts` 等) を HIGH consistency finding として spec-review に escalate する :: tasks.md verbatim 追従で parallel module tree が生まれるリスクが implementer 段階で破綻するため、design 段階で path を実 codebase に揃えさせる
- 既存 `JobStateStore is the Sole Persistence Authority` Requirement と実装 (`createJobState`/`listJobStates` のみの free function) の乖離を HIGH consistency finding として明示する :: delta spec が触れていない既存矛盾は implementer が存在しない API を呼ぶ原因になる。design 段階で free-function 設計を canonical 化する Decision に昇格すべき
- archive PR の auto-merge queue 後の OPEN 状態における再実行挙動を MEDIUM completeness finding として指摘する :: spec.md 冪等性 Requirement が「main に archive commit 反映済み」のみを基準に書かれており、queue 直後の再実行 path が未定義。Idempotency が部分的にしか機能しない
- `--slug` 解決の `updatedAt` lexicographic 比較 / basename 正規化規則を MEDIUM feasibility finding として記述する :: spec.md が比較基準と path 正規化を明示していないため、trailing slash / 大文字小文字差で誤動作する可能性
- `failed` → `archived` 遷移の許否を MEDIUM maintainability finding として明示する :: spec.md は `success` → `archived` のみ書くが、PR が外部で manual merge された failed job の recovery 経路が未定義。状態マシンの edge case として review-lessons 該当
- archive 空 commit 時の挙動を MEDIUM completeness finding として spec に追加させる :: 「commit 不要時に push と PR 作成を実行するか」が未定義で、空 PR noise を生む可能性
- `git mv` 中断時の両 dir 残存判定を MEDIUM feasibility finding として固定する :: design.md Risks §3 Mitigation が「次回冪等チェック」に委ねるが、両 dir 同時存在時の挙動が spec で固定されていない
- security-reviewer は workflow enabled list に含まれないため skipped で扱う :: pipeline-context.md の `enabled: [test-case-generator, adr, module-architect, pattern-reviewer]` で security-reviewer が opt-out されているため起動しない。category weight は再正規化する
