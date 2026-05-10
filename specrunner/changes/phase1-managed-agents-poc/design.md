## Context

SpecRunner is a new web application to execute OpenSpec workflows on Claude Managed Agents. Phase 1 is a proof-of-concept to validate technical feasibility with minimal features. The app will run locally or in a limited environment with no authentication (single user only).

Current state: Empty project, no existing codebase.

Constraints:
- Use Managed Agents SDK v0.89.0 with beta APIs (`client.beta.agents`, `client.beta.environments`, `client.beta.sessions`)
- OpenSpec CLI must be available in the agent environment via npm package `@fission-ai/openspec`
- GitHub repository mounting requires a personal access token
- SSE streaming for real-time communication with agents

## Goals / Non-Goals

**Goals:**
- Validate that OpenSpec CLI can execute within Managed Agents cloud environments
- Demonstrate end-to-end flow: create agent → create environment → create session → send messages → receive responses
- Prove that GitHub repositories can be mounted and manipulated within sessions
- Build a functional web UI for basic interaction with agents

**Non-Goals:**
- Authentication/authorization (Phase 2+)
- Multi-user or multi-tenant support (Phase 5)
- Persistent storage or database (Phase 1 uses in-memory state only)
- Production deployment infrastructure
- Advanced agent features (teams, memory store)
- Error recovery or session persistence across app restarts

## Decisions

### 1. Next.js App Router + API Routes

**Decision**: Use Next.js App Router for both UI and backend API.

**Rationale**:
- Single codebase for frontend and backend reduces complexity
- Server Components enable secure API key management (never exposed to browser)
- API Routes provide REST endpoints for agent operations
- Built-in TypeScript and React support
- Simpler deployment (single app vs separate frontend/backend)

**Alternatives considered**:
- Separate React SPA + Express backend: More complex deployment, API key management requires CORS setup
- Pure server-side rendering: Worse UX for real-time streaming updates

### 2. Server-Side SDK Usage Only

**Decision**: All Anthropic SDK calls happen in API Routes (server-side). Client calls API Routes via fetch.

**Rationale**:
- API keys never exposed to browser
- Simpler security model for Phase 1
- Anthropic SDK runs in Node.js environment as intended

**Alternatives considered**:
- Client-side SDK: Would expose API keys, violates security best practices

### 3. SSE for Streaming (Not WebSockets)

**Decision**: Use Server-Sent Events (SSE) for streaming agent responses.

**Rationale**:
- Anthropic SDK uses SSE for `client.beta.sessions.events.stream()`
- Next.js API Routes support streaming responses natively
- Simpler protocol than WebSockets (unidirectional is sufficient)
- No additional infrastructure needed

**Alternatives considered**:
- WebSockets: Overkill for Phase 1, requires more setup
- Polling: Poor UX, inefficient

### 4. In-Memory Session State

**Decision**: Store active sessions in memory (server-side Map or global variable).

**Rationale**:
- Phase 1 scope: single user, local environment
- No persistence requirement across app restarts
- Simplest possible state management
- Easy to migrate to database in Phase 2+

**Alternatives considered**:
- Database (PostgreSQL, SQLite): Premature for Phase 1 validation
- Redis: Adds unnecessary infrastructure

### 5. Environment Config: Cloud + Limited Networking

**Decision**: Use `networking: { type: 'limited', allowed_hosts: [...], allow_package_managers: true }` for environments.

**Rationale**:
- Allows npm to install `@fission-ai/openspec` package
- Restricts outbound connections for security
- Can whitelist specific hosts (e.g., github.com) if needed

**Alternatives considered**:
- Unrestricted networking: Less secure, not recommended for production
- Air-gapped: Cannot install npm packages

### 6. Agent Toolset: `agent_toolset_20260401`

**Decision**: Use the standard agent toolset for file operations and bash commands.

**Rationale**:
- Required for OpenSpec CLI execution via bash
- Provides file read/write capabilities for GitHub repository
- No custom tools needed for Phase 1

## Risks / Trade-offs

### Risk: OpenSpec CLI may fail in Managed Agents environment
**Mitigation**: Phase 1 is explicitly a validation PoC. If it fails, we learn early and can adjust approach.

### Risk: In-memory state lost on app restart
**Mitigation**: Acceptable for Phase 1 (single user, dev environment). Phase 2 adds database persistence.

### Risk: No error handling for partial session failures
**Mitigation**: Phase 1 focuses on happy path. Error UI can be minimal (display error messages in console/UI).

### Trade-off: SSE is unidirectional (server → client)
**Impact**: Client sends messages via separate POST requests. This is standard for SSE and acceptable for Phase 1 UX.

### Trade-off: Single-user limitation
**Impact**: Only one person can use the app at a time. Acceptable for PoC phase.

## Migration Plan

Phase 1 deployment:
1. Set environment variables (ANTHROPIC_API_KEY, GITHUB_TOKEN) in `.env.local`
2. Run `npm install`
3. Run `npm run dev` for local development
4. Access UI at `http://localhost:3000`

No rollback needed (greenfield project).

## Open Questions

- **UI Design**: Should we display full event streams or summarize responses? → Start with full event display for transparency, can refine in later iterations.
- **Session Lifecycle**: Should sessions auto-close after inactivity? → No auto-close in Phase 1, manual cleanup only.
- **Repository Configuration**: Hardcode a test repository URL or make it configurable in UI? → Make it a UI input field for flexibility during testing.
