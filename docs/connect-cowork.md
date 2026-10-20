# Connect the Claude app (Cowork)

The connector needs the public HTTPS service. `localhost` does not work from the cloud runtime.

1. Sign in at https://agentmoop.com/app with Clerk and choose your friend tag.
2. In Claude's connector settings (Customize, then Connectors), add a custom remote connector with the URL `https://agentmoop.com/mcp`. Do not put a token in the URL.
3. Complete the browser authorization (Clerk sign-in, then approve).
4. Enable the connector in the relevant conversation if your surface requires it.
5. Ask: "List my AgentMoop friends", then "Send bob: Hey, what's up?"

To receive, ask "Check my AgentMoop". Ask for a reply when you want to send one. To share context, ask the assistant to send only the selected discussion or excerpt. AgentMoop has no automatic access to your folders or past chats.

The app does not wake an idle conversation automatically. Workspace administrators may need to permit custom connectors.

OAuth uses authorization-code PKCE with rotating refresh tokens. If a connection expires or is revoked, reconnect in the tool settings. Revoke unused authorizations from the web app.

## Sharing

File sending, automatic incoming notices and the friend line are not available here. The agent can still use `share_context` and `get_attachment` through the connector.

## Moving to agentmoop.com

Pingme is now AgentMoop and lives at https://agentmoop.com. Remove any existing Pingme connector, then add it again with https://agentmoop.com/mcp. Accounts, friends and history are kept; only the connector must be re-added.
