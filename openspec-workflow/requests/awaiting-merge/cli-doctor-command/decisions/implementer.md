# Implementer Decisions — cli-doctor-command

## 決定ログ

- `DoctorContext.env["process_version"]` を node version の mock 経路として採用する :: `process.version` は環境変数的にオーバーライドできないため、テスト容易性のため ctx.env 経由で注入できる専用キーを用意する
- `DoctorContext.homeDir` を XDG パス計算から分離する :: `os.homedir()` を直接呼ぶのではなく homeDir を inject することで、jobs/config パスのテストを実ファイルシステムなしで実行できる
- `configFileExistsCheck` が `~/.config/specrunner/config.json` のパスを `homeDir` から構築する :: XDG_CONFIG_HOME 環境変数に依存しない doctor 固有の home-relative パス計算にする（XDG 計算はメインの config store に任せる）
- `jobsWritableCheck` も `homeDir` から `.local/share/specrunner/jobs/` を構築する :: 同上。doctor 固有の injectable パス計算。
- `GitHubApiClient.verifyTokenScopes()` が 5s timeout を内部実装する :: github-token-valid check は `githubClient.verifyTokenScopes()` を呼ぶだけで timeout 管理は adapter 側が責務を持つ（port-pattern の一貫性）
- `definitionDriftCheck` が `AgentRegistry.fromSteps()` を module-level でキャッシュする :: check 実行のたびに全 Step をインポートするのは同一だが、registry 構築はモジュールロード時の一度で済む
- `formatHuman` が CATEGORY_ORDER 配列で表示順を制御する :: ランタイム→設定→認証の順が直感的であり、デフォルト表示の一貫性を保証する
- `runDoctor` が `try/catch` を持たず、`bin/specrunner.ts` の doctor case に wrap させる :: design.md D3/D9 の通り、exit 2 は bin 層の責務。runDoctor は exit code 計算と出力のみ担当する
- `allChecks` に 19 check を登録する（仕様の 18 check + old-state-files で 2 storage check） :: design.md D8 が jobs-writable と old-state-files の 2 check を別個に定義しており、それぞれ独立した storage check として登録する。合計 19 check
