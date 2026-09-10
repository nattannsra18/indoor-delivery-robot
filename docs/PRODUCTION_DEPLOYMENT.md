# Production TLS and network deployment

The production boundary is a single Caddy endpoint. Browsers and Robot Agents
connect only to HTTPS/WSS on ports 443 (TCP/UDP). Caddy forwards `/api`, `/ws`,
and `/health` to FastAPI and all other requests to Next.js. FastAPI, Next.js,
and PostgreSQL do not publish host ports.

```text
Browser / Robot Agent
        |
    HTTPS / WSS :443
        |
      Caddy
      /   \
 Next.js  FastAPI ---- PostgreSQL
          private Docker network
```

## Public-domain deployment

Prerequisites:

- A Linux host with Docker Engine and Docker Compose v2.
- Ports 80 and 443 allowed through the host firewall. Do not expose 3000,
  5432, or 8000.
- An A/AAAA DNS record for the deployment hostname pointing to the host.
- Time synchronization enabled on the server and every robot SBC.

Prepare configuration:

```bash
cd deploy/production
cp .env.production.example .env.production
openssl rand -base64 36  # database password
openssl rand -base64 36  # administrator password
openssl rand -base64 48  # enrollment bootstrap token
```

Replace every example value. URL-encode the database password inside
`DATABASE_URL`, keep `CADDYFILE=./Caddyfile`, then deploy:

```bash
./deploy.sh
```

For a host using UFW, expose only SSH and the TLS edge (adjust the SSH rule to
match the host's administration policy):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
sudo ufw status verbose
```

Caddy obtains and renews the public certificate automatically. Verify both the
browser and Robot Agent route:

```bash
curl --fail --show-error https://robot.example.com/health
openssl s_client -connect robot.example.com:443 -servername robot.example.com </dev/null
```

A new production database starts without demo robots, maps, stations, or tasks.
The bootstrap administrator is the only application record created
automatically. Robots appear after an Agent submits a pairing request and an
administrator approves it.

Configure each Robot Agent with the same public origin. The Agent converts the
HTTPS origin to WSS for its WebSocket transport:

```bash
server_url:=https://robot.example.com
```

Never copy `ROBOT_ENROLLMENT_TOKEN` into the browser or a robot's permanent
credential file. Use it only for initial enrollment; each paired robot then
uses its own revocable credential.

## Private-LAN deployment

When public DNS and an ACME certificate are unavailable, set a hostname that
all clients can resolve and use:

```dotenv
APP_DOMAIN=delivery-robot.internal
CADDYFILE=./Caddyfile.internal
FRONTEND_URL=https://delivery-robot.internal
CORS_ALLOWED_ORIGINS=https://delivery-robot.internal
TRUSTED_HOSTS=delivery-robot.internal
```

The internal Caddy CA must be installed as a trusted root on every browser host
and robot SBC. After first startup, export it from the named volume:

```bash
docker compose --env-file deploy/production/.env.production \
  -f deploy/production/compose.yml \
  cp proxy:/data/caddy/pki/authorities/local/root.crt ./caddy-local-root.crt
```

Install `caddy-local-root.crt` in the operating-system trust store on every
client, then restart the browser and Robot Agent. Do not disable TLS
verification in the Robot Agent as a workaround.

## Security behavior

- Production startup fails if secure cookies, robot authentication, explicit
  trusted hosts, HTTPS origins, or a sufficiently long enrollment token are
  missing.
- `ALLOW_LEGACY_ROBOT_TOKEN=false` is mandatory. Operational sockets accept
  only per-robot credentials and the Agent Protocol v1 handshake.
- Enrollment and claim requests are rate-limited per client address. Caddy is
  the only service allowed to forward client addresses to Uvicorn.
- Caddy sets HSTS, clickjacking, MIME-sniffing, referrer, and browser permission
  headers and limits request bodies to 2 MB.
- PostgreSQL and the application containers are reachable only through Docker
  networks; only Caddy publishes ports.

## Operations

```bash
docker compose --env-file deploy/production/.env.production \
  -f deploy/production/compose.yml ps
docker compose --env-file deploy/production/.env.production \
  -f deploy/production/compose.yml logs --follow proxy backend
docker compose --env-file deploy/production/.env.production \
  -f deploy/production/compose.yml pull
./deploy/production/deploy.sh
```

Back up the `postgres_data` volume and protect the production environment file
with owner-only permissions. Credential rotation and revocation remain the
preferred response if a robot credential may have been exposed.
