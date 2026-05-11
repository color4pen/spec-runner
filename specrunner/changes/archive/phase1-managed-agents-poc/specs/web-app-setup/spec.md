## ADDED Requirements

### Requirement: Next.js App Router Structure
The application SHALL use Next.js App Router with TypeScript for both UI and API routes.

#### Scenario: App directory structure created
- **WHEN** the application is initialized
- **THEN** an `app/` directory exists with page routes and API routes

#### Scenario: TypeScript configuration present
- **WHEN** the project is set up
- **THEN** `tsconfig.json` is configured for Next.js with strict mode enabled

### Requirement: Tailwind CSS Integration
The application SHALL use Tailwind CSS for styling.

#### Scenario: Tailwind configured
- **WHEN** the application starts
- **THEN** Tailwind CSS is configured via `tailwind.config.ts` and `globals.css`

#### Scenario: UI components styled with Tailwind
- **WHEN** rendering UI components
- **THEN** components use Tailwind utility classes for layout and styling

### Requirement: Environment Variable Configuration
The application SHALL load API keys from environment variables.

#### Scenario: Required environment variables defined
- **WHEN** the application starts
- **THEN** `ANTHROPIC_API_KEY` and `GITHUB_TOKEN` are loaded from `.env.local`

#### Scenario: Environment validation
- **WHEN** environment variables are missing
- **THEN** the application displays an error message indicating which variables are required

### Requirement: Development Server
The application SHALL run a development server for local testing.

#### Scenario: Dev server starts
- **WHEN** running `npm run dev`
- **THEN** the server starts on `http://localhost:3000`

#### Scenario: Hot reload enabled
- **WHEN** source files are modified
- **THEN** changes are reflected in the browser without manual restart
