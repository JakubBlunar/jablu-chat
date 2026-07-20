import type { GameDetectable } from '@chat/shared'

/**
 * Small curated list of non-Steam games identified by executable name.
 * Steam games are detected locally via the Steam client, so this list only
 * needs to cover popular standalone / other-launcher titles. Executable names
 * must be lowercased.
 */
export const GAME_DETECTABLES: GameDetectable[] = [
  { name: 'Minecraft', executables: ['minecraft.exe', 'javaw.exe'] },
  { name: 'League of Legends', executables: ['league of legends.exe'] },
  { name: 'VALORANT', executables: ['valorant.exe', 'valorant-win64-shipping.exe'] },
  { name: 'Fortnite', executables: ['fortniteclient-win64-shipping.exe'] },
  { name: 'Grand Theft Auto V', executables: ['gta5.exe', 'gtav.exe'] },
  { name: 'Roblox', executables: ['robloxplayerbeta.exe'] },
  { name: 'World of Warcraft', executables: ['wow.exe'] },
  { name: 'Overwatch 2', executables: ['overwatch.exe'] },
  { name: 'Call of Duty', executables: ['cod.exe', 'modernwarfare.exe'] },
  { name: 'Apex Legends', executables: ['r5apex.exe'] },
  { name: 'Genshin Impact', executables: ['genshinimpact.exe'] },
  { name: 'Diablo IV', executables: ['diablo iv.exe'] },
  { name: 'Path of Exile', executables: ['pathofexile.exe', 'pathofexile_x64.exe'] },
  { name: 'osu!', executables: ['osu!.exe'] },
  { name: 'EA Sports FC', executables: ['fc25.exe', 'fc24.exe'] }
]
