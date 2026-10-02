# ISOBASH Documentation

- [Architecture](ARCHITECTURE.md)
- [Local development](LOCAL-DEVELOPMENT.md)

Feature documentation is added with the phase that implements the feature.

## Current handoff: admin shell runner

Status: partial implementation ready for continuation.

The repo already contains the admin-only shell runner and safe-runner UI. The underlying feature code is present in:

- `apps/backend/src/admin/admin-shell.service.ts`
- `apps/backend/src/admin/admin.controller.ts`
- `apps/backend/src/admin/admin.module.ts`
- `apps/frontend/components/admin-shell-panel.tsx`
- `apps/frontend/app/admin/settings/page.tsx`

The feature is intentionally restricted to read-only diagnostics and blocks shell chaining, pipes, redirects, and destructive actions.

Current blocker:
- The backend Jest configuration is failing before tests execute. The observed error is: `SyntaxError: Cannot use import statement outside a module`.
- The relevant file is `apps/backend/jest.config.js`.
- The corresponding test file is `apps/backend/src/admin/admin-shell.service.test.ts`.

Next step for the next developer:
- Fix the TypeScript/Jest transform in the backend config so the test runs under the repo’s real setup.
- Validate that allowed commands execute and dangerous commands are rejected.
- Keep the feature limited to safe admin diagnostics only.
