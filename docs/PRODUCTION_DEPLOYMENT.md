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

`deploy.sh` now waits until the database, API, and frontend health checks pass.
Container logs are capped at five 10 MB files per service. PostgreSQL also
terminates sessions that remain idle inside a transaction for 30 seconds; this
is a last-resort lock safeguard, not a replacement for correct transaction
boundaries.

### Backups and restore drills

Create an owner-readable custom-format PostgreSQL backup outside the container:

```bash
./deploy/production/backup_postgres.sh
```

The optional second argument selects a backup directory, ideally an encrypted
EBS volume or a directory uploaded to an encrypted, versioned S3 bucket. The
script never deletes older backups automatically. Define retention in the
off-host storage policy only after recovery copies have been verified.

Test a restore against a disposable database before relying on a backup:

```bash
docker compose --env-file deploy/production/.env.production \
  -f deploy/production/compose.yml exec -T postgres \
  sh -c 'createdb --username="$POSTGRES_USER" indoor_delivery_restore_test'
docker compose --env-file deploy/production/.env.production \
  -f deploy/production/compose.yml exec -T postgres \
  sh -c 'pg_restore --exit-on-error --username="$POSTGRES_USER" \
  --dbname=indoor_delivery_restore_test' < BACKUP_FILE.dump
```

Drop only that explicitly named disposable database after validating record
counts and application migrations. Never run a restore over the live database
without a maintenance window and a separately verified backup.

### Availability monitoring

Docker health checks report failures but Docker Compose does not restart a
container merely because it is `unhealthy`. Install a one-minute system timer,
cron job, or external uptime monitor for the public endpoint. The repository
watchdog performs three bounded checks and restarts only the backend if all
checks fail:

```bash
./deploy/production/health_watchdog.sh \
  https://robot.example.com/health
```

Send its output to journald or CloudWatch Logs and alert on a failed recovery.
Also create CloudWatch alarms for EC2 status checks, CPU credit balance on
burstable instances, disk usage, and memory/swap through the CloudWatch Agent.
Use an external HTTPS monitor so a host-level or DNS failure is still visible.

### Stable address, domain, and secrets

- Associate an Elastic IP with the EC2 instance before production use. A normal
  public IPv4 address can change after stop/start.
- Replace the temporary `sslip.io` hostname with an owned DNS name. Point its A
  record to the Elastic IP, update every origin/host value in
  `.env.production`, validate with `check_config.py`, and redeploy so Caddy
  obtains the new certificate.
- Keep `.env.production` mode `0600`. For a long-lived deployment, store source
  secrets in AWS Systems Manager Parameter Store or Secrets Manager and render
  the environment file on the instance through a least-privilege IAM role.
  Never place AWS access keys or application secrets in Git.
- Keep SSH limited to the administrator's current IP and use Session Manager
  when possible. Only ports 80 and 443 are public application ingress.

### Safe update and rollback

Create a database backup first, then record the currently deployed revision and
deploy an explicit tested commit:

```bash
git rev-parse HEAD
./deploy/production/backup_postgres.sh
git fetch --prune origin
git switch --detach DEPLOY_COMMIT
./deploy/production/deploy.sh
curl --fail --show-error https://robot.example.com/health
```

If health or the smoke workflow fails, switch back to the recorded revision and
run `deploy.sh` again. Database migrations must remain backward compatible; if a
release requires a database rollback, restore only through the tested
maintenance procedure above.

Credential rotation and revocation remain the preferred response if a robot
credential may have been exposed.
