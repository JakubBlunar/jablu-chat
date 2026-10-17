# Scalability and reliability backlog

Part of the [Jablu documentation](./README.md).

These are planned initiatives, not implemented features or capacity guarantees.
The recommended order is measurement, durable delivery, then worker isolation.
Client efficiency can proceed independently once measurements are available.

## Completed foundation

Notification delivery already has batched permission and preference lookups,
bulk durable writes in batches of 100 recipients, atomic coalesced and mention
counters, batched retention cleanup, and push delivery limited to 20 concurrent
requests per API process. PostgreSQL regression tests cover 5,000 recipients.

See [notification fan-out and resource limits](./NOTIFICATIONS.md#fan-out-and-resource-limits).
These correctness tests are not a sustained-load benchmark. The push consumer
and message-notification fan-out still share the API process and database.

## Planned work

| ID | Priority | Status | Initiative |
| --- | --- | --- | --- |
| [SCAL-001](#scal-001-load-testing-and-observability) | P1 | Planned | Load testing and observability |
| [SCAL-002](#scal-002-durable-retry-safe-notification-jobs) | P1 | Planned | Durable, retry-safe notification jobs |
| [SCAL-003](#scal-003-separate-notification-worker) | P1 | Planned | Separate notification worker |
| [SCAL-004](#scal-004-live-update-and-client-refresh-efficiency) | P2 | Planned | Live-update and client refresh efficiency |
| [SCAL-005](#scal-005-operational-safeguards-and-overload-behavior) | P2 | Planned | Operational safeguards and overload behavior |

P1 establishes measurable, reliable delivery. P2 reduces amplification and
improves operations. No additional server, clustering or API replicas are
assumed; add infrastructure only when measurements justify it.

## SCAL-001: Load testing and observability

**Goal:** Measure the real cost of background work and verify that ordinary
requests stay responsive while notifications are being delivered.

**Scope**

- Build a repeatable load-test harness against an isolated test deployment.
- Combine normal browsing/history requests with steady text chat, large-group
  fan-out, mass mentions and reconnect bursts.
- Include a channel with 5,000 members while varying how many are connected:
  offline members still contribute durable-notification work.
- Record API p95/p99 latency, errors, message acknowledgement and live-delivery
  latency, queue depth and oldest-job age, database connection wait time and slow
  queries, event-loop delay, CPU and memory.
- Distinguish text/socket capacity from voice/video and media bandwidth.

**Acceptance criteria**

- Document workloads, dataset/group sizes, message rates, test duration,
  concurrent connections, hardware and software versions so runs are comparable.
- Save a baseline and define latency, error and queue-recovery budgets before
  using the harness to approve later optimizations.
- Measure normal API requests during fan-out, not just notification throughput.
- Verify whether queue depth and memory stabilize under sustained load and how
  long the backlog takes to drain after a burst.
- Do not include message content, push endpoints, credentials or unbounded
  per-user labels in metrics.

**Prerequisites:** None. This is the recommended next implementation.

## SCAL-002: Durable, retry-safe notification jobs

**Goal:** Survive restarts and partial failures without losing notification
work or incrementing counts twice.

**Scope**

- Replace fire-and-forget delivery with durable jobs for applicable message and
  non-message producers.
- Make job creation atomic with the originating database change, for example
  through a transactional outbox.
- Replace destructive dequeue-before-processing with claim/acknowledgement,
  recovery of interrupted jobs, retry backoff and visible failed-job handling.
- Define event-level deduplication and ordering for each recipient. A coalesced
  conversation/channel key alone is not sufficient to identify a retried event.
- Retain expiry handling for time-sensitive notifications such as calls.

**Acceptance criteria**

- A restart after message commit but before processing does not lose the job.
- A crash after a partial recipient batch can be retried without duplicating
  durable records or incrementing coalesced counters again.
- Test recovery after database, Redis and transport failures, including bounded
  retries and an inspectable terminal-failure state.
- Preserve permission checks, muting, quiet hours, read boundaries and delivery
  ordering; define push's at-least-once/duplicate-delivery expectations explicitly.
- Use the SCAL-001 workload to check delivery latency and queue recovery.

**Prerequisites:** Define delivery/idempotency semantics before worker extraction;
use the SCAL-001 baseline for performance validation.

## SCAL-003: Separate notification worker

**Goal:** Keep fan-out and push transport off the API's JavaScript event loop.

**Scope**

- Add a separately runnable worker, initially on the same VPS.
- Process durable notification jobs with bounded concurrency and a separate,
  explicitly budgeted database connection pool.
- Define how workers obtain current engagement, permissions and preferences;
  do not trust stale authorization information stored in queued payloads.
- Route committed badge/socket updates back to connected clients rather than
  relying on the API's in-process event bus.
- Support graceful shutdown and interrupted-job recovery.

**Acceptance criteria**

- No duplicate consumers or inline fan-out remain in the API accidentally.
- Worker restarts do not lose jobs or corrupt counts, including partial batches.
- Cross-device badges and push suppression still work across process boundaries.
- Worker saturation remains within the API latency/error budgets from SCAL-001.
- Document worker deployment, pool/concurrency limits, health checks and shutdown.
- Explain that process isolation does not isolate shared CPU, database, disk or
  bandwidth; do not present a same-VPS worker as a complete resource guarantee.

**Prerequisites:** SCAL-002 delivery guarantees and the SCAL-001 baseline.

## SCAL-004: Live-update and client refresh efficiency

**Goal:** Avoid turning one socket event into a burst of redundant API requests.

**Scope**

- Measure existing badge/read-state throttling and refresh behavior before
  adding more coalescing.
- Coalesce repeated invalidations and avoid refetching unchanged data.
- Audit recipient scope for message, mention and presence broadcasts.
- Smooth reconnect and presence bursts while retaining eventual consistency.

**Acceptance criteria**

- Measure socket traffic and follow-up HTTP requests per event before and after.
- Reduce amplification under the SCAL-001 scenarios without losing final state.
- Preserve unread counts, cross-device read cleanup, notification navigation,
  permission filtering and reconnect reconciliation.
- Check large mention lists and multiple sessions per user, not just one client.

**Prerequisites:** SCAL-001 measurements. Can proceed independently of SCAL-002
and SCAL-003.

## SCAL-005: Operational safeguards and overload behavior

**Goal:** Detect saturation early and let background work slow down before
ordinary requests become unusable.

**Scope**

- Alert on growing/aging queues, exhausted database pools, high error rates and
  event-loop delay using thresholds informed by SCAL-001.
- Monitor database, attachment and Redis disk/memory growth and document
  retention and backup/restore expectations.
- Define backpressure and failure reporting instead of silently dropping work.
- Document graceful shutdown, retry inspection and safe recovery procedures.

**Acceptance criteria**

- Alerts distinguish a temporary burst from a sustained, non-draining backlog.
- Deliberate overload and service interruptions produce visible, documented
  behavior with bounded concurrency and retry activity.
- Recovery follows SCAL-002 idempotency rules rather than blindly replaying
  partially completed fan-outs.
- Operational procedures include safe shutdown and recovery of the SCAL-003
  worker once it exists.
- Update the [deployment guide](./DEPLOYMENT.md) with delivered monitoring,
  limits and recovery instructions.

**Prerequisites:** SCAL-001 for thresholds; coordinate job recovery and worker
procedures with SCAL-002 and SCAL-003.
