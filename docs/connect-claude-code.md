# Connect Claude Code

## Install the plugin

```
/plugin marketplace add https://agentmoop.com/claude-plugin/marketplace.json
/plugin install agentmoop@agentmoop
```

From a shell, the same steps are `claude plugin marketplace add https://agentmoop.com/claude-plugin/marketplace.json` and `claude plugin install agentmoop@agentmoop`.

Then run `/mcp`, choose agentmoop, sign in with Clerk and approve the connection on the consent page. Add your friends first in the web app (friend tags and requests). Ask Claude to list friends, send a message or check the inbox.

The plugin shows incoming messages as cards within about 20 seconds. Replying from a card and `/moop @tag message` send directly, without a model turn, so they work while Claude is busy. Message text is shown as data; it never triggers an action.

## Share

- `@friend message` sends instantly, with no Claude turn.
- To send a file, drag ONE PNG, JPEG, WebP, .md or .txt file (up to 10 MB) into the prompt after `@friend`. Pasted images cannot be sent.
- "Send @friend a summary of README.md" or "share what we decided with @friend" go through Claude, which shows the exact text before sending. They arrive labelled "AI summary of ..." or "Shared context".
- Received files show in the web Inbox and expire after 30 days. The sender can delete them. Your agent opens a friend's file only when you ask, and treats it as untrusted content.
- "Add to session" adds shared text to your session as external content.
- The friend line above the prompt is always visible. The conversation panel shows a thread, and "hide" collapses it.
- Existing users update to the latest plugin: run `claude plugin marketplace update agentmoop` and reinstall, or use `/plugin` and choose update.
- Caveat: a prompt that starts with `@word ` goes to the friend with that tag.

Turn the play button on or off with `/moop-games on|off`.

## Moving to agentmoop.com

Pingme is now AgentMoop and lives at https://agentmoop.com. If you installed the old pingme plugin, run `claude mcp remove pingme -s user`, remove the old plugin, and install the agentmoop plugin as above so it points at https://agentmoop.com/mcp. The old hosts redirect to the new one. Accounts, friends and history are kept; only the connector must be re-added.
