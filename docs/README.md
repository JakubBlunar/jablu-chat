# Jablu documentation

The [project README](../README.md) covers features, quick start and local
development. These guides cover deployment, behavior, architecture and planned
work.

## Guides

| Guide | Contents |
| --- | --- |
| [Deployment](./DEPLOYMENT.md) | VPS setup, Docker, TLS, configuration, backups and troubleshooting |
| [Desktop releases](./RELEASING.md) | Building, signing, publishing and updating the desktop app |
| [Notifications](./NOTIFICATIONS.md) | Engagement, preferences, durable records, push, fan-out limits and regression tests |
| [Direct conversations](./CONVERSATIONS.md) | DM media, search, personal controls and group management |
| [Backlog](./BACKLOG.md) | Prioritized scalability and reliability initiatives with acceptance criteria |

The [activity tracking guide](./ACTIVITY_TRACKING.md) covers detection, recovery,
privacy enforcement, and verification. The [original investigation](./ACTIVITY_TRACKING_REVIEW.md)
records the stale game-status failures and their reproductions.

Moving the guides does not change application, script, Compose or environment
file locations. Follow each guide's working-directory notes when running
commands.

## Component documentation

Keep documentation that is specific to a package or source directory beside it:

- [Bot SDK](../packages/sdk/README.md)
- [Web localization](../apps/web/src/i18n/README.md)
- [Desktop release workflow example](../.github/release-workflow-example.md)

## Maintaining these docs

- Add project-wide guides here and link them from this index.
- Use relative links to other guides and repository files.
- Keep implemented behavior in the relevant guide; keep proposals in the
  [backlog](./BACKLOG.md) until they are delivered.
- When a backlog entry is completed, record its outcome and update the relevant
  guide and tests.
