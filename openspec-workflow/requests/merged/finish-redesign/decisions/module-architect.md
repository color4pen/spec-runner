# Decisions — module-architect

- 軸ラベルを In-Scope 6 軸（testability / readability / cohesion / coupling / reusability / SRP）に限定する :: Out-of-Scope の extensibility / deployment / security / domain-boundary は本エージェントの観察対象外と明示されているため
- archive-pr.ts 削除に伴う orchestrator の Phase 配線を coupling 軸で評価する :: 削除対象 4 関数は orchestrator.ts:17 から直接 import されており、結合の物理的な切断面が観測可能なため
- getJobSlug helper の置き場所を `src/state/store.ts` ではなく独立 helper module を推奨する :: store.ts は I/O（loadJobState / listJobStates）と純粋変換が混在しており、純粋 helper を追加するのは SRP / testability 観点で副作用 module への依存を増やすため
- Phase 0 pre-flight を `src/core/finish/preflight.ts` の単一 module として推奨する :: tasks.md 4.x が既に preflight.ts への集約を指示しており、既存 doctor の DoctorCheck pattern が同型の参照点として存在するため
- resolve-target.ts の slug 計算ロジック（path.basename × 2 箇所）を getJobSlug への置換で重複除去する :: reusability / SRP の観点で 2 箇所の同一派生計算が schema-canonical 化の主目的に直接関わるため
- 削除候補（archive-pr.ts、`createArchivePr`、`pushAndCreateArchivePr`、`prepareArchiveBranch`、`checkArchivePrAlreadyMerged`、orchestrator の Step 5–9 / Step 11）を一括で識別する :: 1-PR モデル転換で物理的に到達不能となるため、削除漏れは dead code / readability 劣化を残す
- mergeStateStatus=UNKNOWN retry を pr-state.ts ではなく preflight.ts 側に置くことを推奨する :: pr-state.ts は normalize の純粋関数 + 1-shot fetch という責務に閉じており、retry policy を混ぜると SRP 違反となるため
