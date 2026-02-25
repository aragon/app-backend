# CLAUDE.md - Aragon Backend Project Guide

## Project Overview
- **Name**: aragon-backend
- **Description**: OpenSource backend services for Aragon DAO platform
- **Version**: 0.7.0
- **License**: AGPL-3.0
- **Language**: TypeScript/Node.js
- **Database**: MongoDB (with replica set)
- **Message Queue**: RabbitMQ

## Repository Information
- **Git Repository**: https://github.com/aragon/app-backend.git
- **Main Branch**: development
- **Current Branch**: feat/APP-4555

## Key Commands

### Development
- `yarn start` - Start aragon-api service
- `yarn service:aragon-api` - Run aragon-api service
- `yarn service:aragon-gateway` - Run gateway service
- `yarn service:aragon-indexer` - Run indexer service
- `yarn service:aragon-admin-api` - Run admin API service

### Testing & Quality
- `yarn lint` - Run ESLint
- `yarn lint:fix` - Fix ESLint issues
- `yarn format:check` - Check formatting with Prettier
- `yarn format:fix` - Fix formatting with Prettier
- `yarn test:unit` - Run unit tests
- `yarn test:unit:coverage` - Run unit tests with coverage
- `yarn test:coverage:check` - Check coverage thresholds (98% statements, 89% branches, 98% functions, 98% lines)
- `yarn test:dotonly` - Check for .only in tests
- `yarn push:check` - Pre-push checks (lint, format, test dotonly)

### Database & Migrations
- `yarn mig:create` - Create new migration
- `yarn mig:run` - Run migrations
- `yarn mig:status` - Check migration status

### Docker
- `yarn docker:services` - Start all services in Docker
- `yarn docker:mongo` - Start MongoDB replica set
- `yarn docker:rabbitmq` - Start RabbitMQ
- `yarn docker:test:unit-dep` - Run unit tests with dependencies

## Project Structure
- `src/` - Source code
  - `services/` - Core services (API, indexer, gateway, etc.)
  - `models/` - Database models
  - `handlers/` - Request handlers
  - `helpers/` - Utility functions
  - `middlewares/` - Koa middlewares
  - `modules/` - Business logic modules
  - `types/` - TypeScript type definitions
  - `migrations/` - Database migrations
  - `aragonContracts/` - Aragon contract definitions
- `test/` - Test files
- `runners/` - Service entry points
- `scripts/` - Utility scripts
- `tools/` - Development tools
- `config/` - Configuration files

## Technology Stack
- **Runtime**: Node.js with TypeScript
- **Framework**: Koa.js for HTTP services
- **Database**: MongoDB with Mongoose ODM
- **Queue**: RabbitMQ with amqplib
- **Blockchain**: Ethers.js for Ethereum interaction
- **Testing**: Mocha with Chai
- **Code Quality**: ESLint + Prettier
- **Process Management**: PM2

## Environment & Configuration
- Environment variables in `.env` files
- Uses `dotenv` for configuration
- Supports multiple environments (sand, dev, stg, prod)
- MongoDB replica set required for development
- RabbitMQ for message queuing

## Development Workflow
1. Install dependencies: `yarn install`
2. Set up environment: Copy `.env.example` to `.env`
3. Start dependencies: `yarn docker:mongo` and `yarn docker:rabbitmq`
4. Run tests: `yarn test:unit`
5. Start development: `yarn start`
6. Before pushing: `yarn push:check`

## Code Style
- Uses ESLint with TypeScript rules
- Prettier for code formatting
- Follows standard TypeScript conventions
- Husky for pre-commit hooks
- Commitlint for conventional commits

## Services Architecture
Multiple microservices:
- **aragon-api**: Main API service
- **aragon-gateway**: Gateway service
- **aragon-indexer**: Blockchain indexing service
- **aragon-admin-api**: Admin API service
- **aragon-dao**: DAO service
- **aragon-plugins**: Plugin service
- **aragon-rates**: Rate service

## Notes for Claude
- Always run `yarn lint:fix` and `yarn format:fix` after code changes
- Run `yarn test:unit` to ensure tests pass
- Check `yarn test:coverage:check` for coverage requirements
- Use `yarn push:check` before proposing changes
- The project uses MongoDB replica sets - ensure proper setup for development
- Services can be started individually using `yarn service:<name>` commands

## Subagent Workflow & Continuous Improvement

### When Using Subagents (Task Tool)
After completing work with any subagent, **always follow the reflection pattern**:

1. **Review the work completed** - Examine code, tests, and patterns used
2. **Identify learnings** - What worked well? What issues were encountered?
3. **Update documentation** - Capture patterns, gotchas, and best practices
4. **Iterate for improvement** - Ensure future subagent tasks benefit from these learnings

### Reflection Pattern Example (using test-builder as illustration)
```
User: "Let's take our learnings from the test writing experience and update our
context for test-builder subagent understanding where necessary"

Assistant Actions:
1. Read the subagent's documentation (.claude/agents/test-builder.md)
2. Identify what was learned during the task (e.g., controller vs model test patterns)
3. Update documentation with:
   - New patterns discovered
   - Common pitfalls and how to avoid them
   - Code examples showing correct approaches
   - Rationale for why patterns matter
4. Commit the updated documentation for future reference
```

### Documentation Locations for Subagents
**Current Subagents:**
- **test-builder**: `.claude/agents/test-builder.md` - Testing patterns and best practices

**Future Subagents** (create as needed):
- `.claude/agents/api-builder.md` - API endpoint patterns
- `.claude/agents/migration-builder.md` - Database migration patterns
- `.claude/agents/{name}.md` - Domain-specific subagent context

**Project-Wide:**
- `CLAUDE.md` (this file) - General conventions applicable to all subagents

### Why This Matters
- **Knowledge retention**: Learnings persist across sessions
- **Consistency**: All subagents follow established patterns
- **Efficiency**: Avoid repeating the same mistakes
- **Quality**: Code quality improves with each iteration
- **Onboarding**: New developers/agents benefit from accumulated knowledge

### Trigger for Reflection
Reflection should occur when:
- A subagent completes a non-trivial task
- New patterns or gotchas are discovered
- Tests fail due to common mistakes
- Code review reveals repeated issues
- User explicitly requests: "let's capture our learnings"
