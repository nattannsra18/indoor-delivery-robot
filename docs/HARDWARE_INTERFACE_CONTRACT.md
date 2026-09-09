# Hardware Interface Contract v1.0

This contract defines the boundary between a robot's hardware/ROS stack and
the Indoor Delivery Robot Agent. A new chassis is compatible when it satisfies
this contract without changes to the web application, FastAPI, or the core
Agent protocol. Hardware-specific values remain in drivers, controller
configuration, URDF, and the robot profile.

Normative terms **MUST**, **SHOULD**, and **MAY** follow RFC 2119 usage. The
contract targets Ubuntu 24.04 and ROS 2 Jazzy. Equivalent interfaces may use
different names when they are mapped through the Robot Profile.

## System boundary

```text
Web -> FastAPI -> WSS -> Robot Agent -> ROS 2 / Nav2 -> hardware drivers
```

The Agent consumes stable ROS interfaces. It MUST NOT contain motor-driver,
encoder, LiDAR-vendor, or microcontroller-specific logic. A robot whose
autonomy stack is not Nav2-compatible requires a separate adapter below the
Agent boundary.

## Identity and configuration

Every physical robot MUST provide:

- A chassis serial number that remains stable across SBC reinstalls.
- A unique Robot Registry credential stored outside the profile and source
  tree with owner-only permissions.
- A versioned Robot Profile containing ROS names, frames, capabilities, map
  storage, and timing policy.
- `hardware_contract_mode=physical` so Agent readiness requires fresh battery
  and physical E-stop state instead of accepting simulation fallbacks.
- A unique ROS namespace when multiple robots share one DDS domain.
- An `active_map_id` matching the map selected by the robot's Map Server.

Changing wheel radius, wheel separation, encoder resolution, motor direction,
PID gains, serial ports, sensor calibration, or URDF transforms MUST increment
the robot profile/configuration revision used by the deployment process.

## Required ROS interfaces

| ID | Interface | ROS type | Minimum contract |
|---|---|---|---|
| HIC-T01 | Odometry | `nav_msgs/msg/Odometry` | Fresh data on the profile's `odom_topic`; `header.frame_id=odom`; `child_frame_id` is the configured base frame; pose and twist use SI units. |
| HIC-T02 | LiDAR | `sensor_msgs/msg/LaserScan` | Fresh scans usable by Nav2 costmaps; finite angle metadata; frame connected to the base; range limits match the sensor. |
| HIC-T03 | Occupancy map | `nav_msgs/msg/OccupancyGrid` | Map frame, non-zero resolution, consistent origin, and transient-local/reliable delivery from Map Server or SLAM. |
| HIC-T04 | Localization pose | `geometry_msgs/msg/PoseWithCovarianceStamped` | AMCL pose in the map frame with meaningful covariance and current timestamps. |
| HIC-T05 | Navigation path | `nav_msgs/msg/Path` | Current Nav2 global path in the map frame. |
| HIC-T06 | Diagnostics | `diagnostic_msgs/msg/DiagnosticArray` | At least 1 Hz while online; stable names/hardware IDs; sensor, controller, localization, battery, and safety health. |
| HIC-T07 | Velocity command | `geometry_msgs/msg/Twist` | The base controller consumes the configured command topic in SI units and stops on zero command or command timeout. |
| HIC-T08 | Battery state | `sensor_msgs/msg/BatteryState` | Real sensor data for physical robots; valid percentage and power-supply status. A fixed simulated percentage MUST NOT be labelled as sensor data. |
| HIC-T09 | Physical E-stop state | `std_msgs/msg/Bool` plus diagnostics | The profile's topic (default `/safety/physical_estop`) publishes `true` while latched. Circuit health is also reported independently of the web software stop. Loss of the safety controller MUST fail safe. |

Recommended data rates and acceptance freshness are:

| Signal | Recommended rate | Maximum age during operation |
|---|---:|---:|
| Odometry | 20 Hz or faster | 0.5 s |
| LiDAR | 5 Hz or faster | 1.0 s |
| AMCL pose | 2 Hz or faster while moving | 1.0 s |
| Diagnostics | 1 Hz or faster | 3.0 s |
| Battery state | 1 Hz or faster | 5.0 s |
| Physical E-stop state | event-driven plus 1 Hz heartbeat | 2.0 s |

The current Agent Profile Validator uses a configurable freshness threshold
for Agent readiness. Hardware acceptance uses the stricter per-signal limits
above.

## TF contract

Exactly one authority MUST publish each dynamic edge in this chain:

```text
map -> odom -> base_footprint (or configured base_frame) -> base_link
                                                      -> LiDAR frame
                                                      -> camera frames
```

- AMCL or SLAM publishes `map -> odom`; never both at the same time.
- The odometry source publishes `odom -> base_frame` continuously.
- `robot_state_publisher` or a static transform publisher provides the base
  and sensor mounting transforms.
- Frame names MUST be consistent across messages, URDF, Nav2, and the Robot
  Profile. The TF tree MUST contain no loops or competing authorities.
- All timestamps MUST use one clock policy. Physical deployments MUST not use
  simulation time.

## Nav2, localization, and mapping

| ID | Interface | ROS type | Requirement |
|---|---|---|---|
| HIC-A01 | Navigate | `nav2_msgs/action/NavigateToPose` | Required for the `navigation` capability. |
| HIC-A02 | Route preview | `nav2_msgs/action/ComputePathToPose` | Required for delivery validation and distance-aware assignment. |
| HIC-S01 | Load map | `nav2_msgs/srv/LoadMap` | Required for map switching. |
| HIC-S02 | AMCL lifecycle | `lifecycle_msgs/srv/GetState` | AMCL MUST be `ACTIVE` before navigation. |
| HIC-S03 | Global localization | `std_srvs/srv/Empty` | Required for browser-based global relocalization. |
| HIC-P01 | Initial pose | `geometry_msgs/msg/PoseWithCovarianceStamped` | Required for browser-based initial pose selection. |

All required Nav2 lifecycle nodes MUST be active before the Agent reports
`READY`. Mapping may intentionally pause AMCL/Nav2; during that period the
robot MUST not accept delivery assignments.

## Capability rules

| Capability | Required contract groups |
|---|---|
| `navigation` | HIC-T01, HIC-T02, HIC-T03, HIC-T04, HIC-T05, HIC-T07, TF chain, HIC-A01, HIC-A02 |
| `localization` | HIC-T02, HIC-T03, HIC-T04, TF chain, HIC-S02, HIC-S03, HIC-P01 |
| `mapping` | HIC-T01, HIC-T02, HIC-T03, HIC-T07, TF odom/base chain, writable map storage, HIC-S01 |
| `diagnostics` | HIC-T06 |

A physical delivery robot additionally MUST satisfy HIC-T08 and HIC-T09 even
if those are not advertised as optional capabilities.

## Safety contract

- A certified physical E-stop circuit MUST remove or inhibit motor torque
  independently of the SBC, network, FastAPI, and web software stop.
- The software Emergency Stop is an operational aid and MUST NOT be presented
  as a substitute for the physical circuit.
- The motor controller MUST implement a command watchdog. If valid velocity
  commands stop arriving, the chassis MUST reach zero velocity within its
  documented timeout.
- Releasing or resetting either stop MUST NOT resume an old navigation goal.
- Nav2 collision monitoring and speed limits are additional controls, not the
  primary E-stop mechanism.
- The Agent MUST report stale safety state as `NOT_READY`, and active physical
  E-stop state MUST prevent navigation commands from reaching the controller.

## Network and time contract

- The Agent initiates outbound `WSS` to the production endpoint on TCP 443.
- TLS certificate verification MUST remain enabled. Private deployments must
  install the Caddy internal CA on the SBC.
- Each robot uses its own revocable credential; bootstrap enrollment tokens
  are not permanent runtime credentials.
- The SBC MUST synchronize time before starting the Agent. Certificate checks,
  command expiry, and event ordering depend on a correct clock.
- The Agent MUST reconnect with bounded backoff after link loss. Expired,
  duplicate, foreign-robot, map-mismatched, and profile-mismatched commands
  MUST be rejected.

## Acceptance gates

The companion ROS repository includes an executable preflight for Gate B. Run
it after the complete robot bringup is active:

```bash
cd ~/amr-navigation-vision-diagnostics
source /opt/ros/jazzy/setup.bash
source install/setup.bash
./scripts/verify_hardware_contract.sh --physical
```

Use `--simulation` for Gazebo. That mode deliberately skips HIC-T08 and
HIC-T09, so it cannot produce physical-robot acceptance. Run `--help` to see
the environment variables available for profiles that remap ROS names.

### Gate A — Static integration review

- [ ] Serial number, namespace, profile version, and capabilities are unique
  and documented.
- [ ] Robot Profile contains every remapped topic, action, service, and frame.
- [ ] URDF dimensions and sensor transforms match the assembled chassis.
- [ ] Hardware secrets are absent from Git and profile files.
- [ ] Agent installer and systemd service use the intended workspace/profile.

### Gate B — ROS graph and Agent readiness

- [ ] All capability-dependent topics, actions, and services exist with the
  types in this contract.
- [ ] `map -> odom -> base_frame` is connected and has one authority per edge.
- [ ] Odometry, LiDAR, AMCL, diagnostics, battery, and safety state meet their
  freshness limits.
- [ ] Nav2 and AMCL lifecycle states are active.
- [ ] Robot Registry shows the expected profile, capabilities, active map, and
  no failed required validation check.

### Gate C — Bench test with wheels lifted

- [ ] Positive linear and angular commands turn every motor in the intended
  direction.
- [ ] Encoder signs and scale agree with commanded motion.
- [ ] Zero command and command loss stop all driven wheels.
- [ ] Physical and software E-stop tests do not resume an earlier command.
- [ ] Battery voltage, percentage, charging state, and low-battery diagnostics
  agree with an independent measurement.

### Gate D — Ground motion and localization

- [ ] A measured straight run validates distance scale and wheel separation.
- [ ] In-place rotation validates angular scale and IMU/odometry direction.
- [ ] LiDAR mounting orientation and obstacle position are correct in RViz.
- [ ] Wheel slip and localization covariance remain within the robot's
  documented operating envelope.
- [ ] Initial pose and global relocalization converge from representative
  locations.

### Gate E — Safety, network, and mission acceptance

- [ ] Stopping distance is measured at every allowed speed and recorded below.
- [ ] Physical E-stop removes/inhibits motor torque and is effective during SBC
  or network failure.
- [ ] Wi-Fi roaming, access-point loss, FastAPI restart, and Agent reconnect are
  tested during an active mission.
- [ ] Credential revoke disconnects the Agent and blocks reconnect.
- [ ] A complete pickup/delivery mission succeeds repeatedly without manual
  ROS or RViz intervention.

## Hardware-only acceptance record

These values cannot be certified in simulation and MUST be completed for each
physical chassis before production use.

| Measurement | Result | Required evidence |
|---|---|---|
| Motor direction and polarity | Pending physical test | Bench-test log/video |
| Encoder scale and sign | Pending physical test | Commanded vs measured distance |
| Wheel slip | Pending physical test | Floor/load test results |
| LiDAR mounting and blind zone | Pending physical test | RViz capture and measurements |
| Physical TF dimensions | Pending physical test | URDF-to-chassis checklist |
| Stopping distance by speed/load | Pending physical test | Distance table and test conditions |
| Wi-Fi roaming/recovery | Pending physical test | Disconnect/reconnect event log |
| Physical E-stop circuit | Pending certified review | Wiring diagram and safety test record |

Record the tested robot serial number, profile revision, firmware versions,
date, operator, floor surface, payload, battery state, and evidence links with
every completed acceptance run. A passed simulation is evidence for software
integration only; it does not waive any hardware-only gate.
