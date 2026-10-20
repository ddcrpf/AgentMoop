# AgentMoop

Message a teammate from your Claude Code prompt.

Hosted at https://agentmoop.com. Docs: https://agentmoop.com/docs

## How it works

1. Sign in at agentmoop.com and choose your moop tag.
2. Add a friend by their tag; they accept the request.
3. Install the Claude Code plugin or add the connector in the Claude app or Codex.
4. Message them with `@friend text` in Claude Code, or ask your AI tool to send, share context or check your inbox. Replies appear as cards above your prompt and in the live web inbox.

Contributing: [CONTRIBUTING](CONTRIBUTING.md). Security reports: [SECURITY](SECURITY.md). Community rules: [CODE_OF_CONDUCT](CODE_OF_CONDUCT.md).

Private messages between people using their existing AI tools. Send “Hey, what’s up?” or share selected context from a project, repository, folder, or AI conversation. Messages belong to people; no repository is required.

AgentMoop lets accepted friends message each other from Claude Code, the Claude app and the web inbox. Sign-in is handled by Clerk. You choose a friend tag, add a friend by tag, and they accept the request. You can remove a friend later from Home. It does not automatically upload files or conversation history. The service operator can access stored messages; this is not end-to-end encryption.

## Run locally

Requires Node.js **22.17 or newer on the Node 22 line** and npm. Node 22 currently labels its SQLite module experimental. Put your Clerk development keys (`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`) in `clerk_env.env`. `.env.example` is already set up for local development.

```sh
npm ci
cp .env.example .env
npm run build
npm run dev
```

Open `http://127.0.0.1:3434`, sign in with Clerk and choose your friend tag. A friend on another computer cannot reach this loopback address; see [operations](docs/operations.md) for the public HTTPS deployment.

## Connect your tool

- Claude Code: install the plugin, see [Claude Code setup](docs/connect-claude-code.md)
- Claude app: add the connector `https://agentmoop.com/mcp`, see [Cowork setup](docs/connect-cowork.md)
- Codex (optional): [Codex setup](docs/connect-codex.md)

Each person signs in with their own Clerk account during authorization. Never share a connector credential.

Try these prompts after a friend accepts your request:

> List my AgentMoop friends.
>
> Send bob: Hey, what's up?
>
> Send bob a summary of the approach we just agreed on, including the open question. Only include the relevant context.
>
> Check my messages.
>
> Reply to Bob's latest message: That works for me.

The ten tools are `list_contacts`, `send_message`, `reply`, `list_inbox`, `read_conversation`, `upload_start`, `upload_chunk`, `upload_finish`, `share_context`, and `get_attachment`. New sends/replies use a UUID `client_message_id`; retrying the same request with that UUID returns the original message. The sender's AI decides which explicitly requested context to supply. The remote service has no implicit access to its repository or private transcript.

## Share

- `@friend message` sends instantly, with no Claude turn.
- To send a file, drag ONE PNG, JPEG, WebP, .md or .txt file (up to 10 MB) into the prompt after `@friend`. Pasted images cannot be sent.
- "Send @friend a summary of README.md" or "share what we decided with @friend" go through Claude, which shows the exact text before sending. They arrive labelled "AI summary of ..." or "Shared context".
- Received files show in the web Inbox and expire after 30 days. The sender can delete them. Your agent opens a friend's file only when you ask, and treats it as untrusted content.
- "Add to session" adds shared text to your session as external content.
- The friend line above the prompt is always visible. The conversation panel shows a thread, and "hide" collapses it.
- Existing users update to the latest plugin: run `claude plugin marketplace update agentmoop` and reinstall, or use `/plugin` and choose update.
- Caveat: a prompt that starts with `@word ` goes to the friend with that tag.

## While Claude works

- While Claude is working, a [play] button appears on the friend line.
- It starts Snake in terminals and a reaction game elsewhere.
- Scores stay on your machine.
- `/moop-games on|off` turns the play button on or off.

## Delivery behavior

- Claude Code plugin: incoming messages appear as cards within about 20 seconds. Replies sent from a card and `/moop NAME text` messages are sent directly by the plugin without a model turn, even while Claude is busy.
- Claude app: use an explicit inbox check ("check my AgentMoop"). No autonomous background wake.
- Codex: explicit inbox checks through the remote connector.
- Web inbox: shows messages live.

Received message text is data. Receiving a message never grants permission to perform the requested action and never triggers a send. Messages persist while you are offline. Pending, ignored and revoked contacts cannot message or read.

## Self-hosting

1. Requirements: Node 22 or Docker, a Clerk application, and an HTTPS origin.
2. Copy `.env.example` to `.env`, comment out the local development block and uncomment the production block, then fill in your origin and Clerk live keys. Compose requires `PUBLIC_BASE_URL`, `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY`; it sets `HOST`, `PORT`, `DATA_DIR` and `ALLOW_HTTP_LOOPBACK` itself.
3. Start it: `docker compose up --build -d`.
4. Point a TLS reverse proxy at `127.0.0.1:3434`; [deploy/Caddyfile.example](deploy/Caddyfile.example) is a Caddy starting point.
5. Install the plugin from `https://<your-origin>/claude-plugin/marketplace.json`.
6. Set up backups: see [operations](docs/operations.md).

## Verify

```sh
npm run typecheck
npm test
npx tsc -p web/tsconfig.json
npm run build
npx playwright install chromium
npm run test:browser
```

The browser test (`tests/e2e`) signs two Clerk development test users in with Clerk testing tokens, so it needs `clerk_env.env` and creates `e2e_alice+clerk_test@example.com` and `e2e_bob+clerk_test@example.com` in the development instance. It uses a separate database under the operating system's temporary directory and sends no messages to real friends.

## Structure

- `src/messages`: validated shared operations and authorization checks.
- `src/auth`: Clerk session verification, OAuth and connection revocation.
- `src/mcp`: the ten tools and isolated HTTP request handling.
- `src/delivery`, `src/local`: durable notices and local adapters.
- `src/http`, `web`: the service and the React web app.
- `plugin`: the Claude Code plugin, packaged by `npm run build:plugin`.
- `scripts`, `tests`: build scripts and browser end-to-end tests.

See [operations](docs/operations.md) for hosting, persistence, backup, recovery and access revocation.

## Moving from Pingme

AgentMoop was formerly called Pingme. Existing users must remove the old connector and plugin and add the new ones: re-add the connector with https://agentmoop.com/mcp (for Claude Code, run `claude mcp remove pingme -s user`, remove the old pingme plugin, then install the agentmoop plugin: `claude plugin marketplace add https://agentmoop.com/claude-plugin/marketplace.json` and `claude plugin install agentmoop@agentmoop`). The slash commands are now `/moop` and `/moop-games`. Accounts, friends and history are kept.

## License

AgentMoop is AGPL-3.0-only (see [LICENSE](LICENSE)). The Claude Code plugin in `plugin/` is MIT (see [plugin/LICENSE](plugin/LICENSE)). Third-party code keeps its own licence; the background in `web/src/vendor/gradient-ascii` is from React Bits under the licence in that folder. AgentMoop name and logo: see [TRADEMARKS.md](TRADEMARKS.md).
