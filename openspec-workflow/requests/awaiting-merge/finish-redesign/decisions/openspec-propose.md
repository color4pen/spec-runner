# openspec-propose decisions — finish-redesign

書式: `〜する :: 理由`（現在形・事前宣言）

- 既存 spec の cli-finish-command を MODIFIED 中心の delta で書き換える :: 2-PR モデル前提の archive PR / chore branch 関連 requirement を削除し、1-PR モデルに置換する必要があるため
- cli-commands spec を MODIFIED で更新し finish の subcommand 仕様を再定義する :: B 章で `<slug>` 第一形・`--pr` `--dry-run` を追加するため input contract が変わる
- job-state-store spec を MODIFIED し RequestInfo に slug field を追加 :: A1/A3 で schema レベルの canonical slug 化が要件
- request-md-parser spec は触らない :: request.md 解析側は slug 影響を受けない（state populate 側責任）
- pr-create-step / pr-create-runner spec は触らない :: PR 作成は 1-PR モデルでも変更なし、merge orchestration のみ差し替え
- register-branch-tool spec を MODIFIED し slug field を追加 :: F1/F2 で custom tool に slug を客体化する要件
- Phase 0 pre-flight は cli-finish-command spec の MODIFIED 配下に新 Requirement として追加 :: D 章は新規責務でなく finish コマンドの内部段階の追加
- ADR 候補は design.md の Architecture Decisions セクションに記述、別ファイル化は本 propose では行わない :: ADR 化は workflow 後段で行う規約
- delta spec で Requirement header を変更する場合は RENAMED + MODIFIED を併記する :: 過去事例（cli-finish-command 2026-05-02）で archive 失敗、本ルールが Skill 規約で MUST
- tasks.md は A〜H 章をそのまま 8 セクションで対応する粒度にする :: 受け入れ基準が章立てに沿っているため tracker の対応関係が一目で分かる
- cli-finish-command を ADDED で扱う（MODIFIED でなく） :: 既存 archive（2026-05-02-cli-finish-command）が openspec/specs/ に promote されておらず drift 状態のため、本 change で 1-PR モデル仕様として新規定義し直す
- job-state-store の RequestInfo / JobStatus / getJobSlug を ADDED で追加する :: 既存 spec に RequestInfo schema を直接定義する Requirement が無いため、MODIFIED 不可。ADDED で新 Requirement として固定する
- cli-commands は MODIFIED で `specrunner` バイナリ Requirement と `specrunner ps` Requirement の 2 件を更新する :: バイナリ count は 6 のまま（subcommand 追加なし）、ps は SLUG 列追加で列数 5→6 になるため両方 MODIFIED が必要
- register-branch-tool は MODIFIED で input_schema と handler の 2 件を更新する :: slug field 追加と冪等性ロジックの拡張が同時に必要
- openspec validate --strict が pass することを propose 完了の必須条件にする :: 過去事例（cli-finish-command 2026-05-02）で archive 失敗の元となった header mismatch を本段階で fail-fast する

