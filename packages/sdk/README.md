# @jablu/sdk

TypeScript SDK for building bots on the [Jablu](https://github.com/YOUR_USERNAME/jablu-chat) chat platform.

## Installation

```bash
npm install @jablu/sdk
```

## Quick Start

```typescript
import { BotClient } from '@jablu/sdk'

const bot = new BotClient({
  token: process.env.BOT_TOKEN!,
  serverUrl: process.env.SERVER_URL!,   // e.g. "https://chat.example.com"
})

bot.registerCommands([
  { name: 'ping', description: 'Check if the bot is alive' },
])

bot.onCommand('ping', async (ctx) => {
  await ctx.reply('Pong!')
})

bot.on('ready', (data) => {
  console.log(`Logged in as ${data.user.username}`)
})

await bot.connect()
```

## Creating a Bot

1. Open your Jablu instance and go to **Settings > Bots**.
2. Click **Create Bot**, choose a username and display name.
3. Copy the bot token — you will need it for `BotClient`.
4. Add the bot to a server from the server's **Bot** settings page (search by username).

## Core Concepts

### BotClient

The main entry point. Manages the WebSocket connection, REST API calls, slash commands, and local storage.

```typescript
const bot = new BotClient({
  token: 'bot_abc123...',
  serverUrl: 'https://chat.example.com',
  storagePath: './data/my-bot.db', // optional, defaults to ./data/bot-storage.db
})
```

### Slash Commands

Bots declare commands at startup. The SDK automatically syncs them with the server on connect.

#### Registration

```typescript
bot.registerCommands([
  { name: 'help', description: 'Show available commands' },
  {
    name: 'greet',
    description: 'Greet a user',
    parameters: [
      { name: 'name', type: 'string', description: 'Who to greet', required: true },
    ],
  },
  {
    name: 'setup',
    description: 'Configure the bot for this channel',
    requiredPermission: 'MANAGE_CHANNELS', // only visible to users with this permission
  },
])
```

#### Handling Commands

```typescript
bot.onCommand('greet', async (ctx) => {
  const name = ctx.args.name ?? 'world'
  await ctx.reply(`Hello, ${name}!`)
})
```

The `CommandContext` object provides:

| Property          | Type                   | Description                                           |
| ----------------- | ---------------------- | ----------------------------------------------------- |
| `serverId`        | `string \| null`       | Server ID (null in DMs)                               |
| `conversationId`  | `string \| null`       | DM conversation ID (null in servers)                   |
| `channelId`       | `string`               | Channel or conversation ID                             |
| `commandName`     | `string`               | The invoked command name                               |
| `args`            | `Record<string, string>` | Parsed arguments                                     |
| `user`            | `object`               | Invoking user (`id`, `username`, `displayName`)        |
| `isDm`            | `boolean`              | Whether the command was invoked in a DM                |
| `userPermissions` | `bigint`               | Invoker's channel permission bitmask                   |
| `reply(content)`  | `(string) => Promise`  | Send a reply to the current channel/DM                 |

#### Permission-Gated Commands

Use `requiredPermission` to restrict who can see and invoke a command. The server enforces this — users without the permission won't see the command in autocomplete and the server will reject invocations.

```typescript
import { Permission, hasPermission } from '@jablu/sdk'

bot.registerCommands([
  { name: 'setup', description: 'Admin-only setup', requiredPermission: 'MANAGE_CHANNELS' },
])

bot.onCommand('setup', async (ctx) => {
  // Double-check in the handler if needed
  if (!hasPermission(ctx.userPermissions, Permission.MANAGE_CHANNELS)) {
    await ctx.reply('You need the Manage Channels permission.')
    return
  }
  await ctx.reply('Channel configured!')
})
```

Valid permission keys: `MANAGE_CHANNELS`, `MANAGE_MESSAGES`, `KICK_MEMBERS`, `BAN_MEMBERS`, `MANAGE_ROLES`, `MANAGE_SERVER`, `SEND_MESSAGES`, `MENTION_EVERYONE`, `MANAGE_EMOJIS`, `MANAGE_EVENTS`, `MANAGE_WEBHOOKS`, `ADMINISTRATOR`, `VIEW_CHANNEL`, `MUTE_MEMBERS`.

### Events

Listen for real-time events from the server:

```typescript
bot.on('ready', (data) => { /* connected */ })
bot.on('messageCreate', (message) => { /* new server message */ })
bot.on('dmMessageCreate', (message) => { /* new DM message */ })
bot.on('serverRemoved', (data) => { /* bot was removed from a server */ })
bot.on('disconnected', () => { /* connection lost, auto-reconnects */ })
bot.on('error', (err) => { /* connection error */ })
```

#### Event Reference

| Event              | Payload                                                                  |
| ------------------ | ------------------------------------------------------------------------ |
| `ready`            | `{ user: { id, username, displayName }, servers: [{ id, name, channels }] }` |
| `messageCreate`    | `BotMessage` — server channel message                                    |
| `dmMessageCreate`  | `BotDmMessage` — direct message                                         |
| `serverRemoved`    | `{ serverId: string }`                                                   |
| `disconnected`     | _(no payload)_                                                           |
| `error`            | `Error`                                                                  |

### REST API

Send messages and manage content through the REST client:

```typescript
await bot.sendMessage(channelId, 'Hello!')
await bot.sendDmMessage(conversationId, 'Hi there!')
await bot.editMessage(channelId, messageId, 'Updated content')
await bot.deleteMessage(channelId, messageId)
```

The underlying `RestClient` is also accessible via `bot.rest` for lower-level access.

### Storage

The SDK includes a lightweight SQLite key-value store for persistent bot-side configuration. No server-side schema changes needed — bots own their data.

```typescript
// Store a value
bot.storage.set('channel:abc123:sources', ['steam', 'epic'])

// Retrieve it
const sources = bot.storage.get<string[]>('channel:abc123:sources')

// Check existence
bot.storage.has('channel:abc123:sources') // true

// Delete
bot.storage.delete('channel:abc123:sources')

// List by prefix
const allChannels = bot.storage.list('channel:*')
// => [{ key: 'channel:abc123:sources', value: ['steam', 'epic'] }, ...]
```

Storage is persisted to a local SQLite file. Set the path via `storagePath` in `BotClientOptions`.

## API Reference

### BotClient

| Method / Property   | Description                                    |
| ------------------- | ---------------------------------------------- |
| `connect()`         | Connect to the server, sync commands, return when ready |
| `disconnect()`      | Disconnect and clean up resources              |
| `registerCommands(defs)` | Register slash command definitions         |
| `onCommand(name, handler)` | Register a handler for a command        |
| `on(event, listener)` | Listen for a gateway event                   |
| `off(event, listener)` | Remove an event listener                    |
| `sendMessage(channelId, content)` | Send a message to a server channel |
| `sendDmMessage(conversationId, content)` | Send a DM             |
| `editMessage(channelId, messageId, content)` | Edit a message   |
| `deleteMessage(channelId, messageId)` | Delete a message          |
| `user`              | Current bot user info (after connect)          |
| `servers`           | List of servers the bot is in (after connect)  |
| `storage`           | `BotStorage` instance                          |
| `rest`              | `RestClient` instance                          |
| `gateway`           | `GatewayClient` instance                       |

### BotStorage

| Method              | Description                                    |
| ------------------- | ---------------------------------------------- |
| `set(key, value)`   | Store a JSON-serializable value                |
| `get<T>(key)`       | Retrieve a value (returns `null` if missing)   |
| `has(key)`          | Check if a key exists                          |
| `delete(key)`       | Remove a key                                   |
| `list(prefix)`      | List all entries matching a prefix pattern      |
| `close()`           | Close the database connection                  |

## Full Example

See [`apps/bot/`](../../apps/bot/) in the Jablu repository for a complete working bot (FreeGameBot) that demonstrates:

- Slash command registration with parameters and permissions
- Channel-specific configuration using `BotStorage`
- Periodic tasks (polling external APIs)
- Source filtering and deduplication
- Permission-gated admin commands (`/setup`, `/stop`, `/sources`)
- User-facing commands (`/deals`, `/status`, `/help`)

## Environment Variables

| Variable      | Description                           |
| ------------- | ------------------------------------- |
| `BOT_TOKEN`   | Bot authentication token              |
| `SERVER_URL`  | Jablu server URL (e.g. `https://chat.example.com`) |

## License

This SDK is part of the Jablu project and is licensed under the [Elastic License 2.0 (ELv2)](../../LICENSE).
