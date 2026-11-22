import type { Room } from 'livekit-client'

type Tile = { kind: 'participant' | 'screen'; id: string }

export class VoiceTileFocus {
  selected: string | null = null
  private screens = new Set<string>()

  update(tiles: Tile[]) {
    const screens = new Set(tiles.filter((tile) => tile.kind === 'screen').map((tile) => tile.id))
    if (!tiles.some((tile) => tile.id === this.selected)) {
      this.selected = [...screens].find((id) => !this.screens.has(id)) ?? null
    }
    this.screens = screens
    return this.selected
  }
}

// A call owns its selection while the user visits other channels.
const selections = new WeakMap<Room, VoiceTileFocus>()
export function focusForRoom(room: Room) {
  let selection = selections.get(room)
  if (!selection) {
    selection = new VoiceTileFocus()
    selections.set(room, selection)
  }
  return selection
}
