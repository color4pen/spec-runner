## Why

Phase 1 validates that OpenSpec workflows can execute on Claude Managed Agents through a web application. This is a proof-of-concept to verify the technical feasibility before building authentication and multi-user features in later phases.

## What Changes

- Next.js App Router web application with UI for session creation, message sending, and result display
- Integration with Anthropic Managed Agents SDK v0.89.0 (`client.beta.agents`, `client.beta.environments`, `client.beta.sessions`)
- Agent creation with OpenSpec toolset support
- Environment creation with OpenSpec CLI pre-installed via npm
- GitHub repository mounting for file operations
- SSE streaming for real-time message exchange with agents
- Simple UI built with Tailwind CSS (no authentication in Phase 1)

## Capabilities

### New Capabilities
- `web-app-setup`: Next.js App Router application structure with TypeScript, Tailwind CSS, and environment configuration
- `agent-management`: Create and configure Managed Agents with OpenSpec toolset
- `environment-management`: Create cloud environments with OpenSpec CLI and networking configuration
- `session-management`: Create sessions with agent, environment, and GitHub repository resources
- `message-streaming`: Send messages and receive SSE events from active sessions
- `openspec-execution`: Execute OpenSpec CLI commands within the agent session

### Modified Capabilities
<!-- No existing capabilities to modify -->

## Impact

- New Next.js application in project root
- Dependencies: @anthropic-ai/sdk@0.89.0, next, react, typescript, tailwindcss
- Environment variables required: ANTHROPIC_API_KEY, GITHUB_TOKEN
- No authentication/authorization in Phase 1 (local/limited environment only)
- No database usage in Phase 1
