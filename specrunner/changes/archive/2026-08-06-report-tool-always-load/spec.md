# Spec: report tool を alwaysLoad にして ToolSearch 経由の cache 全破棄を止める

## Requirements

### Requirement: report MCP server は alwaysLoad: true で生成されなければならない

`reportTool` が設定されている step において、`createMcpServerFn` を呼び出す際に `alwaysLoad: true` を options に含めなければならない（SHALL）。これにより report tool が deferred にならず、agent が `ToolSearch` を呼ぶ動機が消える。

#### Scenario: reportTool が設定されている場合に alwaysLoad: true が渡る

**Given** `ctx.policy.reportTool` が定義されている AgentRunContext
**When** `ClaudeCodeRunner.run()` が `createMcpServerFn` を呼び出す
**Then** 渡された options に `alwaysLoad: true` が含まれる

### Requirement: report MCP server は in-process の SDK MCP server でなければならない

`queryOptions.mcpServers` に登録される report server は `createSdkMcpServer` が返す in-process オブジェクトでなければならない（SHALL）。外部プロセス起動を伴う stdio 形式（`command`/`args`）でも、ネットワーク接続を伴う SSE/HTTP 形式（`url`）でもあってはならない。

#### Scenario: report server が外部プロセス形式でない

**Given** `ctx.policy.reportTool` が定義されている AgentRunContext
**When** `ClaudeCodeRunner.run()` が `queryOptions` を構築する
**Then** `queryOptions.mcpServers[REPORT_MCP_SERVER_NAME]` が `command` プロパティを持たない
**And** `queryOptions.mcpServers[REPORT_MCP_SERVER_NAME]` が `url` プロパティを持たない

### Requirement: reportTool が未設定の場合は MCP server を生成してはならない

`ctx.policy?.reportTool` が undefined の step では `createMcpServerFn` を呼び出さず、`queryOptions` に `mcpServers` を含めてはならない（SHALL NOT）。

#### Scenario: reportTool が undefined の場合に MCP server が生成されない

**Given** `ctx.policy` が undefined または `ctx.policy.reportTool` が undefined の AgentRunContext
**When** `ClaudeCodeRunner.run()` が `queryOptions` を構築する
**Then** `createMcpServerFn` は呼ばれない
**And** `queryOptions` に `mcpServers` キーが含まれない
