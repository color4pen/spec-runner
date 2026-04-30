# openspec-propose decisions — cli-doctor-command

- DoctorCheck を interface 化し DoctorContext を inject する :: 既存 port パターンと整合させ、各 check を mock で単独 unit test 可能にするため
- 18 個の check を `src/core/doctor/checks/*.ts` に分割し runner で逐次実行する :: 1 ファイル肥大化を避け、出力順を安定させ debug 容易性を優先するため
- exit code を 0 (pass/warn) / 1 (fail) / 2 (crash) に固定する :: CI で `|| exit 1` 形式が使え、doctor 自身のバグと検査失敗を区別できるため
- formatter を human / JSON の 2 種に分離し formatter.ts に集約する :: 将来の出力形式追加（GitHub Actions annotations 等）を容易にし、JSON schema を spec で固定するため
- 外部依存方針を ADR に明文化する :: 将来の operational tooling（finish / cancel / gc）が「LLM 入れたい」誘惑に流されないよう制度的防波堤を作るため
- gh CLI を不要とし GitHubClient port で代替する :: 既存 port が REST 直叩きで `GET /user` を扱える、dogfooding 環境セットアップを簡素化するため
- Anthropic key 有効性 check は `GET /v1/models` を 5s timeout で叩く :: list endpoint は cheap でレート消費が最小、key revoke 後の状態を doctor で発見したいため
- ネットワーク timeout は warn とする（fail にしない） :: ネットワーク不調と key 失効を区別し、CI が flaky にならないため
- required=false の fail も exit 1 とする :: required 属性は exit code に影響させず、warn と fail の意味を明確に区別するため
- 並列実行ではなく逐次実行を MVP default とする :: ネットワーク check の同時 fire による rate limit 違反を避け、debug 容易性を優先するため
- agent definitionHash 計算は既存 `computeDefinitionHash` を再利用する :: init pipeline と divergence を避け、新規実装の保守コストを発生させないため
- delta spec は `cli-commands` capability の MODIFIED + ADDED として表現する :: doctor は既存 cli capability の拡張であり、新規 capability を増やす理由がないため
- Windows サポートは MVP scope 外とする :: permission 0600 等のセマンティクスが不一致で、dogfooding 環境（darwin / linux）に集中するため
- jobs state file 100 超を warn 閾値とする :: 経験的に 100 超で `ps` が読みにくくなる体感、gc 推奨の signal として明確な数値が必要なため
