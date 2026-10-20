# Contributing to AgentMoop

Thanks for helping. AgentMoop is a small single-instance service, so small and focused changes are easiest to review.

## Requirements

- Node.js 22.17 or newer on the Node 22 line, and npm
- A Clerk development application (free) for sign-in
- For plugin tests only: the `claude` CLI

## Setup

```sh
npm ci
cp .env.example .env
```

Put your Clerk development keys (`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`) in `clerk_env.env`. Never commit `.env` or `clerk_env.env`.

## Run

```sh
npm run dev       # server on http://127.0.0.1:3434
npm run dev:web   # Vite dev server for the web app
```

## Tests

```sh
npm run typecheck
npx vitest run
claude plugin validate plugin && claude plugin test plugin
npm run test:browser   # needs a Clerk development key in clerk_env.env
```

The browser test signs in two Clerk test users and uses a separate temporary database. CI runs the typecheck, unit tests and build; run the plugin and browser tests locally when you change the plugin or the web app.

## Code layout

- `src/`: the server (messages, auth, MCP tools, delivery, HTTP)
- `web/`: the React web app
- `plugin/`: the Claude Code plugin, packaged by `npm run build:plugin`
- `scripts/`: build and packaging scripts
- `tests/`: browser end-to-end tests (unit tests sit next to the code)

## Pull requests

- Keep them small and focused on one change.
- Add or update tests for behavior you change, and make sure the checks above pass.
- Never include secrets, tokens, keys or private messages in code, tests, issues or logs.
- Match the style of the surrounding code.

## Sign your commits (DCO)

Contributions are accepted under the [Developer Certificate of Origin 1.1](https://developercertificate.org). Sign off every commit to certify it:

```sh
git commit -s -m "Describe the change"
```

This adds a `Signed-off-by: Your Name <you@example.com>` line, which means you agree to the DCO:

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

## Licensing of contributions

The server and web app are AGPL-3.0-only. The plugin in `plugin/` is MIT. Your contribution is licensed under the licence of the part of the repository it changes.

## Security issues

Do not open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md).

## Conduct

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
