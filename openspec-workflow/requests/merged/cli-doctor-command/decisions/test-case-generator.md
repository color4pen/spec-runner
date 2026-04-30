# Test Case Generator — Decision Log

## 判断記録

- 18 個の DoctorCheck を全て個別 unit テストとして列挙する :: pipeline-context.md の must-areas が「各 DoctorCheck の独立 unit test」を明示しているため、check 単位の粒度を維持する
- runtime checks（node / bun / git / openspec）の境界値を must に含める :: node >= 18 は spec.md に明記された仕様であり、v18.0.0 と v17.9.1 の境界は仕様の中核
- openspec check の 30s timeout を must に含める :: design.md D7 が timeout 値を表で明記しており、これが他の check と異なる唯一の例外値であるため仕様の中核と判断
- config file-exists の permission 0600 違反は warn（fail でない）として TC-011 を記述する :: design.md D6 に `permission 0600 でない場合は warn` と明記
- Windows permission 0600 check を should に格下げする :: Non-Goals に "Windows MVP 対応は別 issue" と明記されており、仕様の必須ではないため
- github-token-valid が fetch 直叩き禁止を should テストとして追加する :: tasks.md T-12.1 で port パターン遵守を明示しているが、これは実装観点の制約であり仕様の「振る舞い」とは別軸であるため
- exit code テストを unit（runDoctor mock）として分類する :: process.exit の呼び出しは unit 層で spy/mock 可能であり、integration を必要としない
- manual テストを 4 件（T-14.1〜T-14.4）に限定する :: ビルドアーティファクト検証・実 API 通信・実機 invoke は manual カテゴリの定義に該当し、CI 自動化不可のため
- definition-drift check の hash 一致／不一致を両方 must に含める :: spec.md に "agent definition drift 検出" シナリオが明記されており仕様の中核
- DoctorResult の name/category/required 保存検証を could に格下げする :: runner の内部実装詳細であり、外部から観察可能な振る舞いの核ではない
