# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | completeness | test-cases.md | spec.md が issue #860 正典に更新された際に追加された 3 つのシナリオ（S2b: 2 回目 init already-exists、S2c: 半初期化補完、"doctor per-check root/sub equivalence"）に対応する TC が test-cases.md に存在しない。実装（package-smoke.sh の S2b/S2c/S3）は正しく網羅しており、振る舞い上の問題はないが、台帳としての test-cases.md が古いまま残っている。 | test-cases.md に TC-016（S2b）・TC-017（S2c）・TC-018（S3 root/sub equivalence）を追加し、Summary および Result YAML のカウントを更新する。ただし実装は人間レビューで承認済みであるため、スペックアーティファクトの整合修正のみでよく、実装変更は不要。 |
| 2 | LOW | consistency | tasks.md | 行 11「起動は常に `node <installed dist>` 形式」および T-01 受け入れ基準「install 後、`node <解決した dist> --help` が起動できる」は旧バージョンの記述。spec.md・design.md・実装はすべて `npx --no-install specrunner` を採用しており、tasks.md だけが `node <dist>` 直叩きを示すことでドキュメント間の不整合が生じている。runtime 挙動への影響なし。 | tasks.md 行 11 を「起動は常に `npx --no-install specrunner` 経由（npm 利用者の実入口）」に修正し、T-01 AC の「`node <解決した dist> --help`」を「`npx --no-install specrunner --help`（bin 配線・shebang・npx 解決の生存確認）」に更新する。 |
| 3 | LOW | consistency | test-cases.md | Result YAML ブロック（`automated: 9, manual: 6`）が Summary ヘッダ（Automated: 10, Manual: 5）および実際のカテゴリ集計（integration/automated 10 件、manual 5 件）と一致しない。転記ミスと推定される。 | Result YAML を `automated: 10, manual: 5` に修正し、Summary と一致させる。 |
| 4 | LOW | consistency | test-cases.md | TC-001〜TC-006 の Source が「Packaged smoke SHALL assert first-contact contracts using only the packed tarball run with node」（旧タイトル）を参照しているが、現在の spec.md の Requirement タイトルは「Packaged smoke SHALL assert first-contact contracts through the real npm entry (`npx --no-install specrunner`) on the packed tarball」。シナリオ名は一致しているため機能的な問題はない。 | TC-001〜TC-006 の Source 参照を現 spec.md の Requirement タイトルに合わせて更新する。 |

## Review Notes

本レビューは post-hoc 再検証（operator break-glass 復旧後、手修正で issue #860 正典に合わせた現 revision に対する新 iteration）として実施した。

**実装との整合確認（packages-smoke.sh）**:

- **npx --no-install の徹底**: `run_cli` ヘルパが `npx --no-install specrunner` を使い、`node <dist>` 直叩きを一切行っていないことを確認。bin 配線・shebang・`.bin/specrunner` シンボリックリンクがすべて assert 経路に載る。✓
- **S1（repo 外 init）**: `GIT_CEILING_DIRECTORIES="${SMOKE_TMP}"` を `run_cli` に組み込み、fixture が repo 外であることを `git rev-parse` で事前確認している。意図的な非ゼロ exit を `||` なしで明示捕捉し、`set -e` 誤中断を防いでいる。✓
- **S2/S2b/S2c（init 3 相）**: F2_XDG を S2→S2b→S2c で共有し、実ユーザーの逐次セッションを再現。S2c で scaffold 削除後に再 init し、config は `already exists`・scaffold は `created` の分離を assert。✓
- **S3（doctor 同値 + XDG 契約）**: `|| true` で doctor の全体 exit code を無視し、`node -e` で JSON parse して per-check `config-file-exists=pass` を抽出。root/sub の check 集合をソート済み配列で比較。`jq` 非依存。✓
- **S4（subdirectory request new）**: `run_cli "${F2_SUB}"` から `request new smoke-request-fixture` を実行し、root 側への landing と subdir の入れ子なしを assert。✓
- **install → .bin/specrunner 生存確認**: F1_DIR と F2_REPO 両方の `.bin/specrunner` 存在を先行確認し、bin 配線故障を即時検出する構造。✓
- **origin stub**: `https://github.com/example/fixture-app.git`（ネットワーク非接触）を追加し、doctor の `github-origin` check が実運用と同条件で走る。✓
- **tests/package-smoke-contract.test.ts**: TC-012（dist 不在時の明示エラー）と TC-006（bun 非呼び出し・src/ 非参照）を vitest で自動検証。`SMOKE_REPO_ROOT` オーバーライドで実際の npm pack を回避する軽量設計。✓

**セキュリティ評価**: 本 change はローカルシェルスクリプトによる CI ゲート拡張。外部入力（CLI 引数・環境変数）をコマンドに展開する箇所はなく、固定 slug（`smoke-request-fixture`）を使用しているため injection リスクなし。`XDG_CONFIG_HOME`/`HOME` を temp パスへ隔離することで runner・開発者機の credential への読み書きを防止。認証要求経路（login / run）は明示的にスコープ外。CI への長期 token 追加なし。OWASP Top 10 の適用対象外。
