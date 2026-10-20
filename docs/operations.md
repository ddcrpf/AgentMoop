# Operate a self-hosted instance

## Hosting requirements

Use a container or Node 22 host with a **persistent writable volume**, one application instance and a stable HTTPS origin. This SQLite build is intentionally a small single-instance private service. Do not place the database on ephemeral filesystems or scale the container horizontally against separate local databases.

Set `PUBLIC_BASE_URL` to the exact origin, for example `https://moop.example.com`, without a path/query. It is used for host validation and OAuth discovery. The reverse proxy must preserve that Host header. Set `HOST=0.0.0.0` inside a container; keep the database volume mounted at `/app/data` and disable loopback HTTP mode in production.

`TRUST_PROXY_HOPS` must equal the known number of reverse proxies between the client and app. Only expose the service through that proxy. The proxy must replace forwarded client-IP headers, so users cannot forge rate-limit identities. Use provider-managed TLS and avoid request-body/access logging of secrets. Message routes must not be cached.

Example for a server that already has a TLS reverse proxy:

```sh
docker compose up --build -d
```

Set `PUBLIC_BASE_URL`, `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` (and optionally `TRUST_PROXY_HOPS`) in a private `.env` first; compose refuses to start without them. `PUBLIC_BASE_URL` is also a build argument: the image bakes the plugin marketplace and zip (served at `/claude-plugin/`) for that host, so rebuild when it changes. The Compose file exposes port 3434 on host loopback; configure the existing TLS proxy to forward to it. It does not create a domain or certificate.

The hosted product is AgentMoop at https://agentmoop.com. For your own instance, set `PUBLIC_BASE_URL` to your origin. [deploy/Caddyfile.example](../deploy/Caddyfile.example) shows a Caddy reverse proxy that serves `web/landing.html` at `/` and does not gzip `/api/events` (the live event stream). Use Clerk keys that match your environment (development keys for testing, a Clerk production instance for a public deployment).

The Compose service and volume keep their legacy `pingme` names from the former product name. Renaming the volume would orphan existing data, so leave them as they are.

Anyone with the link can create an account, but nobody can message them until they accept a friend request.

## Link pre-V1 accounts

Accounts created before Clerk are linked to a Clerk user. Have the person sign in once and stop at "Choose your friend tag", find their Clerk user id in the Clerk dashboard, then run:

```sh
docker compose exec -T pingme node dist/cli/admin.js link --handle NAME --clerk-user user_XXXX
```

It prints `Linked.` and the old history appears under that tag.

## Admin

Grant admin to a member by handle:

```sh
sudo docker compose exec -T pingme node dist/cli/admin.js grant --handle <handle>
```

## Backup and recovery

Use SQLite's online backup API, which captures a consistent snapshot including live WAL state:

```sh
npm run admin -- backup --output /PRIVATE/PATH/backup.db
```

Inside the container:

```sh
docker compose exec pingme node dist/cli/admin.js backup --output /app/data/backup-UNIQUE.db
```

Use a new filename each time. Backups contain private messages and token hashes. Keep encrypted copies outside the host and set a retention policy. Messages are kept until the operator deliberately changes the data. Attachments expire 30 days after they are sent; an hourly sweep deletes expired files, and uploads that were never sent are deleted after 1 hour.

Attachments live in `/app/data/attachments` and must be backed up and restored together with the database. Alongside `admin backup`, take a tar of `/app/data/attachments` (for example `tar czf attachments-UNIQUE.tgz -C /app/data attachments`).

Restore only during a planned shutdown, after separately preserving the current data directory and confirming the backup. Restore the database into a new data directory, switch the volume/configuration to it, and restart. Do not overwrite an unexamined live database or mix an old database with stale WAL/SHM files. Confirm login and conversation history on an isolated restored instance before switching the service.

## Scheduled off-server backups

Run the backup on a schedule (for example nightly with cron or a systemd timer): take the admin backup, tar the attachments folder, encrypt both (for example with `age` to your public key) and copy them off the server to storage the server cannot read or delete from, so a compromised host cannot destroy old backups. Delete old copies after a retention period you choose.

To restore, download the encrypted files, decrypt them with your private key, then follow the recovery rules above (restore into a new data directory during a planned shutdown):

```sh
age -d -i /PATH/TO/backup-age.key backup-UNIQUE.tar.age > backup-UNIQUE.tar
```

## Monitoring

- Uptime: poll `/healthz` from an external monitor (every few minutes) and alert when the response body does not contain `"status":"ok"`. The endpoint returns `{"status":"ok"}`, or `"status":"degraded"` when the data disk is 70% or more full, so one check covers both the site being down and a filling disk.
- Logs: the app writes to stdout/stderr. Send container logs to your log system and set a retention that suits you.

## Sign-in problems and revocation

Authentication and account recovery are handled by Clerk; use the Clerk dashboard to manage users. A signed-in user can revoke a single connector from the web app. Members remove a friend with the Remove button in the Friends panel on Home. Removing a friend stops new messages and history access until a new request is accepted.

## Live acceptance checklist

- Owner and friend sign in with Clerk, add each other by tag and authorize their own tools.
- Verify exact handle resolution, a plain greeting, selected context, and a reply.
- Verify a third account cannot read the conversation.
- Test offline recovery and connector revocation.
- Install the plugin from the marketplace URL and verify cards, in-card reply and `/moop`.
- Test any claimed live adapter in the actual selected existing session, including idle and active behavior.
- Verify the HTTPS Cowork connector separately; record account/version restrictions.
- Confirm the persistent volume survives an application restart and restore a backup to an isolated instance.

The app has no billing system and no built-in email or external notification service. Hosted resources and provider charges are separate decisions.
