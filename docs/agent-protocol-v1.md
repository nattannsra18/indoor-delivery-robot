# Robot Agent Protocol v1

This protocol keeps the web application independent from ROS 2 and robot hardware. A robot agent opens an outbound WSS connection to FastAPI, authenticates with its own credential, and translates control-plane messages into the configured ROS adapter.

## Trust boundaries

```text
Browser -> FastAPI control plane <- WSS <- Robot Agent -> Nav2 adapter -> ROS 2 / ros2_control
```

- Browsers never connect to ROS 2 directly.
- Every paired robot has an immutable server-issued UUID and an independent credential.
- FastAPI stores only credential hashes. The plaintext credential is returned once during claim.
- Physical emergency-stop and motion safety remain local to the robot. A web stop is an operational command, not a certified safety circuit.
- Hardware details such as wheel radius, encoder resolution, serial ports, and PID gains stay in robot-side profiles.

The companion ROS repository provides a simulator profile and a physical
SCUTTLE template under `amr_web_bridge/config/profiles`. These files select
identity, capabilities, and ROS interface names; credentials remain in the
Agent credential store and must never be committed into a profile.

## Enrollment and pairing

1. The agent calls `POST /api/robot-registry/enrollments` using the limited bootstrap credential.
2. FastAPI returns a short-lived eight-digit pairing code. The agent displays the code locally.
3. An administrator opens Robot Registry and verifies the serial number, SHA-256 hardware fingerprint, capabilities, and code shown by the robot.
4. The administrator approves the request by entering that code.
5. The agent claims the approved request using the same code and hardware fingerprint.
6. FastAPI returns an immutable `robot_id` and a one-time plaintext credential. The agent stores them in protected local storage.
7. Later boots reconnect automatically with that robot credential. Pairing codes cannot be reused.

The bootstrap credential authorizes enrollment only. It cannot connect as an operational robot.

## WebSocket handshake

Connect to `/ws/robots/{robot_id}` with the robot credential in an `Authorization: Bearer` header. Query-string tokens remain available only for the explicitly enabled legacy transition.

The first frame must arrive within five seconds:

```json
{
  "type": "agent_hello",
  "protocol_version": "1.0",
  "robot_id": "server-issued-uuid",
  "boot_id": "unique-id-for-this-boot",
  "agent_version": "0.1.0",
  "ros_distro": "jazzy",
  "profile_version": "scuttle-v1",
  "capabilities": ["navigation", "mapping", "localization"]
}
```

FastAPI rejects unknown protocol versions, mismatched robot identities, revoked credentials, and malformed hello frames before registering the connection.

After its ROS checks complete, the agent sends `agent_readiness` with a `READY`, `NOT_READY`, or `DEGRADED` status, the active map ID, and structured `validation_results`. Each result includes a stable `check_id`, category (`INTERFACE`, `DATA`, `TF`, `LIFECYCLE`, or `CAPABILITY`), status (`PASS`, `WARN`, or `FAIL`), human-readable message, and optional observed value. The legacy boolean `checks` object remains in the envelope for protocol compatibility. A failed required check must report `NOT_READY`, while a warning cannot report `READY`. Connection state and readiness remain independent.

The ROS validator evaluates declared capabilities only. It checks required Nav2 actions and services, fresh odometry, map, AMCL and diagnostics data, the `map -> odom -> base` TF chain, AMCL lifecycle state, and map storage configuration. The control plane stores the latest report and exposes it in Robot Registry so operators can see why a robot is not ready or degraded.

## Command lifecycle

New commands use an envelope containing `command_id`, `robot_id`, `issued_at`, `expires_at`, optional expected map/profile revisions, an action identifier, and an action-specific payload. Agents must reject expired commands and commands addressed to another robot.

The current navigation migration retains the established `command`, `task_id`,
`stage`, and `target` fields while adding the v1 protocol version, destination,
expiry, and expected profile. This lets the simulated fleet migrate without
changing the ROS navigation adapter in one deployment. New adapters should use
the versioned envelope fields and keep hardware-specific configuration in their
robot profile.

Agents report one or more lifecycle states:

```text
accepted | rejected -> started -> succeeded | failed
```

All status frames repeat the command ID, robot ID, protocol version, and timestamp. Command IDs are idempotency keys: receiving a duplicate must not repeat physical motion.

Navigation commands currently expire after 30 seconds. The Agent also checks an
optional expected map revision and expected profile version before queueing
motion. It keeps a bounded in-memory history of processed command IDs and emits
the v1 lifecycle alongside the legacy navigation result during migration.

## State model

The control plane keeps distinct dimensions rather than collapsing them into one `online` flag:

- Enrollment: `UNPAIRED`, `PENDING`, `PAIRED`, `REVOKED`
- Connectivity: connected or disconnected
- Readiness: `NOT_READY`, `READY`, `DEGRADED`
- Operation: the existing robot mission state, such as `IDLE` or `DELIVERING`

Simulation is enrolled through the same contract as physical robots. The legacy shared token exists only while the current simulator agent is migrated.
