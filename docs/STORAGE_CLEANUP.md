# Jablu storage audit and manual cleanup

`STORAGE_LIMIT_GB` is a soft budget for the Jablu instance. Other applications on
the VPS do not influence Jablu's deletion decisions. Uploads continue when the
budget is exceeded. The operator reviews a dated plan in Superadmin > Storage
and explicitly starts it. `CLEANUP_ENABLED` schedules reports only.

## Accounted storage

The usage figure adds uploads, the current PostgreSQL database's allocated size,
closed log archives in `CLEANUP_LOG_ARCHIVE_DIR` if configured, and the distinct
directories in `STORAGE_EXTRA_DIRS` (semicolon-separated). Compose defaults the
extra directories to Jablu's update and download volumes. They are measured but
their contents are not deleted by generic cleanup.

Use a database dedicated to Jablu. PostgreSQL WAL, Redis persistence, Docker
images, Docker-managed JSON logs, other apps and OS files are not included.
The UI displays this scope explicitly. Keep Docker log rotation enabled in
Compose. Never mount the Docker engine's log directory into the cleanup service.
Optional archive paths must exist inside the API container and refer to
Jablu-owned data. Canonical roots must be distinct and may not overlap. Symbolic
links within a root and unreadable storage cause the scan to fail instead of
reporting incomplete usage.

Removing database rows normally makes space reusable inside PostgreSQL; it does
not guarantee immediate OS disk reclamation. The cleanup never runs
`VACUUM FULL`. Its result separates actual unlinked file bytes from remaining
instance usage.

## Reviewed scopes

- **Run Audit:** pressure-driven cleanup toward `CLEANUP_TARGET_PERCENT` of the
  budget (90% by default). Old unattached uploads come first, then eligible old
  message groups if enabled, attachment-only cleanup, unreferenced uploads and
  old closed log archives. The worker stops between individual planned items.
  A message/thread or original-plus-thumbnail pair is one indivisible item;
  reclaiming it can take usage somewhat below the target.
- **Review Deleted Messages:** explicitly purge the reviewed soft-deleted
  messages regardless of the byte budget. Newly removed messages after the
  audit are not added. Pinned/archived protection still applies; roots with live
  replies are preserved. The old unreviewed purge endpoint rejects requests.
- **Review Old Logs:** explicitly purge reviewed old database audit-log rows,
  completed/expired audit history and closed log archives regardless of budget.
  Current `*.log` files are preserved. Only archives ending in `.gz`, `.old`,
  or a numeric rotation suffix are considered, and they must pass the age check.
  No arbitrary directory cleanup occurs.

Inspect **Preview Planned Items** and the affected message/attachment counts
before confirmation. Log-record counts appear as old log/history records;
unlinked files include thumbnails and previews. File byte estimates exclude
known shared references and deduplicate paths. Live revalidation can reduce
what is actually deleted.

## Protection and bounded plans

Defaults preserve pinned messages and archived channels while allowing eligible
DMs. Attachment-only cleanup keeps the message itself, including blank bodies,
titles, polls, embeds and relationships. A message group can be deleted only
when every member and attachment passes the fixed audit cutoff, with no recent
edits or replies. Groups larger than 500 messages are conservatively skipped.
Text-only history is never erased as a fallback for pressure that its deletion
cannot resolve. Whole-message deletion defaults to disabled.

Every reviewed plan is stored in the database, expires after 24 hours and holds
at most `CLEANUP_MAX_ITEMS` items (default 5000), with an additional 8 MiB manifest
bound. It retains fingerprints instead of copies of message content/embeds.
Additional cleanup requires a
new audit. Old aggregate-only reports cannot execute. Changed roots or retention
settings require a new review; expired recovery can finish already claimed file
work without beginning more source deletions. Other ready plans are superseded
after a run.

Orphan files must be older than `CLEANUP_ORPHAN_HOURS`; this also protects
uploads between writing the file and committing their database row. Message and
attachment rows are locked and revalidated before claiming deletion. Shared
references include previews, webhook snapshots, group avatars, game icons and
links/embeds. URI-normalized ownership checks use database expression indexes;
the paged reference inventory is capped at 500,000 distinct paths rather than
loading complete message/attachment records into memory. Reused activity icons
refresh their modification time. The worker
checks file identity and refuses replacements or changed files.

## Progress and recovery

Execution returns HTTP 202 once its worker owns the plan. The UI polls durable
progress; closing the page does not cancel work. A dedicated PostgreSQL session
lock permits only one cleanup worker per database, including audit dismissal.
If the worker exits, the lock releases automatically. Reading audit history
marks an abandoned executing run interrupted when no worker holds the lock.

The worker commits deletion ownership before unlinking files. Permission/I/O
failures leave the remaining files in a durable retry record even if their
source message/attachment has already been removed. **Resume / Recover** retries
that same plan. Fix the underlying filesystem access problem first. Recovery
never blindly deletes files whose identity changed; investigate such a file
instead of repeatedly replacing it. Audits owning recovery work cannot be
dismissed or removed by history retention.

`partial` means eligible data did not meet the target. The UI shows remaining
usage and the stopping reason (protected/changed candidates, plan limit, or
exhausted eligible data). It does not expand to younger or protected data.
Progress counts committed items. Freed-byte counters are conservative: a crash
after unlink but before its database acknowledgment can undercount that file on
retry; it cannot cause that file to be deleted twice. Final usage is remeasured.

## Settings

| Variable                   | Default       | Meaning                                                |
| -------------------------- | ------------- | ------------------------------------------------------ |
| `STORAGE_LIMIT_GB`         | `100`         | Positive instance budget, GiB units                    |
| `CLEANUP_TARGET_PERCENT`   | `90`          | Finite percentage in the range 1–100                   |
| `CLEANUP_MIN_AGE_DAYS`     | `90`          | Minimum inactive age for live messages/attachments     |
| `CLEANUP_ORPHAN_HOURS`     | `24`          | Grace period for unattached uploads/unreferenced files |
| `CLEANUP_DELETED_AGE_DAYS` | `30`          | Grace after removal for pressure-mode deleted messages |
| `CLEANUP_LOG_AGE_DAYS`     | `90`          | Database log/history and archive age                   |
| `CLEANUP_DELETE_MESSAGES`  | `false`       | Allow eligible message groups in pressure cleanup      |
| `CLEANUP_SKIP_ARCHIVED`    | `true`        | Protect archived channels; DMs remain eligible         |
| `CLEANUP_PROTECT_PINNED`   | `true`        | Protect pinned messages and their thread files         |
| `CLEANUP_MAX_ITEMS`        | `5000`        | Plan bound, integer 1–50000                            |
| `STORAGE_EXTRA_DIRS`       | empty in code | Additional distinct measured directories               |
| `CLEANUP_LOG_ARCHIVE_DIR`  | empty         | Explicit directory of closed rotated archives          |
| `CLEANUP_ENABLED`          | `false`       | Schedule reports only                                  |
| `CLEANUP_CRON`             | `0 3 * * *`   | Audit schedule in server timezone                      |

Age settings must be finite and at least 1; boolean settings accept exactly
`true` or `false`. Defaults in code, example configuration and Compose agree.

## Migration and local validation

Apply the normal Prisma deployment migrations and restart the API before using
the new UI. Migration `20261027140000_storage_cleanup_safety` adds durable plans
and deletion timestamps. Historical soft removals receive the migration time
as their deletion timestamp so their grace period is not guessed from creation.
It does not delete application data. New removals record their actual time.
Migration `20261027143000_storage_cleanup_references` adds URL normalization and
ownership indexes. The index is verified by EXPLAIN against 5,000 fixture rows.
Plans and ownership checkpoints need database write space; a completely full
database volume may need operational headroom before safe deletion can start.

The PostgreSQL/file integration suite requires an explicitly local disposable
database named `cleanup_test` or `cleanup_test_*`. It commits fixture changes
to verify crash/retry ownership and resets that disposable database between
tests. Never point it at development or production application data.

```powershell
docker run --detach --rm --name chat-cleanup-implementation-20261027 --publish 127.0.0.1:55432:5432 --env POSTGRES_USER=cleanup_test --env POSTGRES_PASSWORD=cleanup_test --env POSTGRES_DB=cleanup_test postgres:16-alpine
# Once PostgreSQL is accepting connections, create the synthetic test schema.
$migrationFiles = Get-ChildItem apps/server/prisma/migrations -Directory |
  Sort-Object Name | ForEach-Object { Join-Path $_.FullName 'migration.sql' }
$sql = ($migrationFiles | ForEach-Object { Get-Content -Raw -LiteralPath $_ }) -join "`n"
$sql | docker exec -i chat-cleanup-implementation-20261027 psql -U cleanup_test -d cleanup_test -v ON_ERROR_STOP=1 -q
if ($LASTEXITCODE -ne 0) { throw 'Test schema creation failed' }

$env:CLEANUP_TEST_DATABASE_URL = 'postgresql://cleanup_test:cleanup_test@127.0.0.1:55432/cleanup_test'
pnpm --filter @chat/server test -- --runInBand cleanup.safety-audit.integration.spec.ts
pnpm --filter @chat/server test -- --runInBand cleanup.service.spec.ts cleanup.safety-audit.spec.ts
pnpm --filter @chat/web test -- --runInBand StorageTab.safety-audit.test.tsx
```

For optional testing of actual local development data, start the disposable
container named `chat-cleanup-implementation-20261027` on port 55432 (as the test
database setup above), then run `node apps/server/test/clone-cleanup-local.cjs`
from the repository root. This reads `chat-postgres-1` with `pg_dump`, restores
to `cleanup_test_snapshot` only, applies the two new migrations to that copy,
and copies local uploads into the ignored `.tmp-tests/cleanup-local-copy-20261027`
directory. It refuses to overwrite an existing copy and skips new migrations
already recorded in the copied migration history. This helper assumes the source
local database already has the preceding repository migrations.

```powershell
$env:CLEANUP_SNAPSHOT_DATABASE_URL = 'postgresql://cleanup_test:cleanup_test@127.0.0.1:55432/cleanup_test_snapshot'
$env:CLEANUP_SNAPSHOT_UPLOAD_DIR = 'F:\Projects\chat\.tmp-tests\cleanup-local-copy-20261027\uploads'
pnpm --filter @chat/server test -- --runInBand cleanup.local-copy.integration.spec.ts
```

Linux filesystem failure checks use the actual cleanup file primitive as an
unprivileged user inside a disposable 128 KiB tmpfs, with source files mounted
read-only. From the repository root (adjust the two absolute source paths):

```powershell
docker run --rm --read-only --user 1000:1000 --tmpfs /fixture:rw,size=131072,mode=1777 --mount type=bind,source=F:/Projects/chat/apps/server/src/cleanup/cleanup-files.ts,target=/code/cleanup-files.ts,readonly --mount type=bind,source=F:/Projects/chat/apps/server/test/cleanup-files.linux.cjs,target=/code/check.cjs,readonly node:24.14.1-alpine node --experimental-strip-types /code/check.cjs
```

Backups are outside this cleanup workflow.
