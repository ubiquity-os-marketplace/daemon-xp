# @ubiquity-os/daemon-xp

The Daemon XP tracker listens to GitHub issue events and records XP for contributors using Supabase. It is designed to be run as a Ubiquity OS plugin worker, handling XP awards for assignments and deductions when issues are unassigned by the automation.

## Features

- Records XP awards and malus events for issues handled by Ubiquity OS.
- Posts GitHub comments summarizing XP changes for transparency.
- Calculates collaborator multipliers when multiple contributors are involved.
- Stores totals and history in Supabase for downstream reports.

## Prerequisites

- Ubiquity OS kernel configured and dispatching events to this worker.
- Supabase project with the expected schema (see `src/adapters/supabase` for generated types).
- `bun` installed for dependency management and local execution.

## Installation

```sh
bun install
```

## Local Development

Run the worker locally and dispatch events through the kernel:

```sh
bun worker
```

To simulate an event, send a POST request with a payload matching the kernel contract:

```ts
await fetch("http://localhost:4000/", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    stateId: "",
    eventName: "issues.unassigned",
    eventPayload: {},
    settings: {},
    ref: "",
    authToken: "",
  }),
});
```

## Configuration

Define plugin settings in your `.ubiquibot-config.yml` or organization configuration. Example:

```yml
plugins:
  - name: daemon-xp
    id: daemon-xp
    uses:
      - plugin: https://your-hosted-worker
        with:
          disableCommentPosting: false
```

- `disableCommentPosting` (boolean, default `false`): prevent the worker from posting XP summaries back to GitHub while still recording XP in Supabase.

## Deployment

Deploy the worker using your preferred platform (ideally, Deno). Supply the required environment variables defined in `src/types/env.ts` and ensure the kernel target points to the deployed URL.

## Testing

Tests use the existing mocks located in `tests/__mocks__`. Run them with:

```sh
bun run test
```

For coverage details:

```sh
bun run test --coverage
```

## Project Structure Highlights

- `src/handlers`: event-specific handlers such as `handle-issue-unassigned`.
- `src/adapters/supabase`: Supabase client access and generated types.
- `src/xp/utils.ts`: formatting and helper utilities for XP records.
- `src/types`: shared types and plugin input schema.

## Contributing

1. Fork the repository and create a feature branch.
2. Make your changes and add/adjust tests.
3. Ensure linting and tests pass locally.
4. Open a pull request describing the change and link related issues.

## License

MIT
