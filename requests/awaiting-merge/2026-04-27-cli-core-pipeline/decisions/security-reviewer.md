# Security Reviewer Decisions — 2026-04-27-cli-core-pipeline iteration 1

- API key / GitHub token を扱うので脅威モデルは「local file 漏洩 + log への意図せぬ出力 + prompt injection 経由のデータ抜き取り」を中心に評価する :: managed-agents 経由でユーザー入力が Agent に渡る経路があり、この 3 つが OWASP A02 と A03 の交差点
- specs/cli-config-store の「機微情報は stdout に出力されない」を有効と判定する :: マスク表記要求が SHALL で書かれており、constraints.md「機微情報の不適切な保存」を仕様レベルで満たす
- design.md D5 の緩い permission 時の warning 継続方針を MEDIUM レベルで指摘候補にする :: 0644 で配置された config を読み込み時に warning だけで継続する仕様は、攻撃者が `chmod 0644` した状態で読まれる窓を許す。書き込み時に 0600 に戻す記述はあるが、読み込み専用の commands（ps）は permission を修正しない経路があるか不明
- prompt injection 防御を確認する :: specs/propose-pipeline「ユーザー入力は `<user-request>...</user-request>` XML タグで囲み、プロンプトインジェクションを構造的に防御する」が SHALL で書かれており constraints.md の対策と整合
- GitHub token の scope を `repo` 固定とする design.md D6 は最小権限原則に対して過剰と判断するが Phase 1 の trade-off としては許容する :: private repo の clone+push に repo scope が必要なため避けにくい。MEDIUM レベルで「scope 最小化（public_repo + workflow など）の検討余地」を将来課題として記録
- specs/github-device-flow-auth に CSRF / replay 攻撃の検討記載がないことを LOW として記録する :: device flow は本質的に CSRF 耐性があるが、`device_code` を盗まれた場合のリスク（ユーザー誘導フィッシング）に関する記載がない。仕様としては許容範囲
- config の race condition を整合性観点で評価する :: 同時に 2 つの specrunner プロセスが config に書く race は spec で扱われていない。`run` は read のみ、`init` と `login` のみが write なので Phase 1 では低リスク (LOW)
- state file の path traversal 耐性を確認する :: jobId が uuid v4 で確定し、path 構築は `<jobs-dir>/<uuid>.json` 固定なので path traversal の余地はない
- Agent 定義（system_prompt + custom_tools）の改ざんリスクを評価する :: design.md R4 で「propose system prompt が改ざんされない限り問題なし」と書かれているが、CLI バイナリ自体が tampering された場合の検出は仕様にない。Phase 1 では trust the binary が現実的、LOW
- GitHub Device Flow の client_id を CLI に埋め込む選択を許容する :: client_secret 不要な OAuth 仕様、SPECRUNNER_GITHUB_CLIENT_ID で上書き可能、最小限のセキュリティリスクで実装の容易さと trade-off
