## 1. Project Setup

- [ ] 1.1 Initialize Next.js project with TypeScript and App Router
- [ ] 1.2 Install dependencies: @anthropic-ai/sdk@0.89.0, tailwindcss, and dev tools
- [ ] 1.3 Configure Tailwind CSS with config file and global styles
- [ ] 1.4 Create .env.local.example with ANTHROPIC_API_KEY and GITHUB_TOKEN placeholders
- [ ] 1.5 Set up tsconfig.json with strict mode enabled

## 2. API Routes - Agent Management

- [ ] 2.1 Create API route POST /api/agents/create for agent creation
- [ ] 2.2 Initialize Anthropic client with API key from environment
- [ ] 2.3 Implement agent creation logic using client.beta.agents.create()
- [ ] 2.4 Configure agent with model 'claude-sonnet-4-6' and agent_toolset_20260401
- [ ] 2.5 Store agent ID in server-side in-memory Map
- [ ] 2.6 Create API route GET /api/agents to list created agents

## 3. API Routes - Environment Management

- [ ] 3.1 Create API route POST /api/environments/create for environment creation
- [ ] 3.2 Implement environment creation logic using client.beta.environments.create()
- [ ] 3.3 Configure cloud environment with limited networking and npm packages
- [ ] 3.4 Add @fission-ai/openspec to npm packages in environment config
- [ ] 3.5 Store environment ID in server-side in-memory Map
- [ ] 3.6 Create API route GET /api/environments to list created environments

## 4. API Routes - Session Management

- [ ] 4.1 Create API route POST /api/sessions/create for session creation
- [ ] 4.2 Implement session creation logic using client.beta.sessions.create()
- [ ] 4.3 Accept agent ID, environment ID, repository URL, and mount path from request
- [ ] 4.4 Configure GitHub repository resource with authorization token from environment
- [ ] 4.5 Store session metadata in server-side in-memory Map
- [ ] 4.6 Create API route GET /api/sessions to list active sessions
- [ ] 4.7 Create API route DELETE /api/sessions/:id for session cleanup

## 5. API Routes - Message Streaming

- [ ] 5.1 Create API route POST /api/sessions/:id/messages for sending messages
- [ ] 5.2 Implement message sending using client.beta.sessions.events.send()
- [ ] 5.3 Format user messages with correct event structure
- [ ] 5.4 Create API route GET /api/sessions/:id/stream for SSE streaming
- [ ] 5.5 Implement SSE response using client.beta.sessions.events.stream()
- [ ] 5.6 Forward agent events to client via Server-Sent Events
- [ ] 5.7 Handle stream errors and connection cleanup

## 6. UI Components - Layout and Navigation

- [ ] 6.1 Create main page layout with Tailwind CSS
- [ ] 6.2 Add navigation header with app title
- [ ] 6.3 Create tabbed interface for agent/environment/session management
- [ ] 6.4 Add environment variable validation check on page load

## 7. UI Components - Agent Management

- [ ] 7.1 Create agent creation form with name and system prompt inputs
- [ ] 7.2 Add submit button to trigger POST /api/agents/create
- [ ] 7.3 Display list of created agents with IDs
- [ ] 7.4 Add loading state during agent creation

## 8. UI Components - Environment Management

- [ ] 8.1 Create environment creation form with name input
- [ ] 8.2 Add submit button to trigger POST /api/environments/create
- [ ] 8.3 Display list of created environments with IDs
- [ ] 8.4 Add loading state during environment creation

## 9. UI Components - Session Management

- [ ] 9.1 Create session creation form with agent/environment dropdowns
- [ ] 9.2 Add repository URL and mount path input fields
- [ ] 9.3 Add submit button to trigger POST /api/sessions/create
- [ ] 9.4 Display list of active sessions with metadata
- [ ] 9.5 Add close session button for each active session
- [ ] 9.6 Add loading state during session creation

## 10. UI Components - Message Interface

- [ ] 10.1 Create message input textarea for user messages
- [ ] 10.2 Add send button to trigger POST /api/sessions/:id/messages
- [ ] 10.3 Create message display area for conversation history
- [ ] 10.4 Implement EventSource connection to GET /api/sessions/:id/stream
- [ ] 10.5 Render streamed events incrementally in message display
- [ ] 10.6 Add auto-scroll to bottom as new messages arrive
- [ ] 10.7 Handle SSE connection errors with retry option
- [ ] 10.8 Close EventSource connection on component unmount

## 11. Testing and Validation

- [ ] 11.1 Test agent creation flow and verify agent ID storage
- [ ] 11.2 Test environment creation flow and verify OpenSpec package installation
- [ ] 11.3 Test session creation with GitHub repository mounting
- [ ] 11.4 Test sending message and receiving streamed response
- [ ] 11.5 Test OpenSpec CLI execution (e.g., openspec --version, openspec list)
- [ ] 11.6 Test file read operations on mounted repository
- [ ] 11.7 Test file write operations on mounted repository
- [ ] 11.8 Verify session cleanup removes session from in-memory storage

## 12. Documentation

- [ ] 12.1 Create README.md with project setup instructions
- [ ] 12.2 Document environment variable requirements
- [ ] 12.3 Add usage examples for testing OpenSpec workflows
- [ ] 12.4 Document known limitations and Phase 1 scope
