import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Permission,
  getChannelRuleState,
  type Channel,
  type ChannelAccessStatus,
  type ChannelPermissionState
} from '@chat/shared'
import { Button, Input, Select } from '@/components/ui'
import { ChannelSettingsTabs } from './ChannelSettingsTabs'
import type { useChannelAccess } from './hooks/useChannelAccess'

type AccessModel = ReturnType<typeof useChannelAccess>
type AudienceRow = AccessModel['audience'][number]

function AccessTrace({ row, voice }: { row: AudienceRow; voice: boolean }) {
  const { t } = useTranslation('channels')
  const { member, access } = row
  const name = member.displayName ?? member.username
  const sources = (permission: 'view' | 'send') => {
    const source = access[permission]
    return (
      <div className="space-y-1">
        <p className="font-medium text-gray-200">
          {t(`access.${permission === 'view' ? 'viewChannel' : 'sendMessages'}`)}
        </p>
        <p>{t(source.baseAllowed ? 'access.serverAllowed' : 'access.serverDenied')}</p>
        {source.deniedBy.length > 0 && (
          <p>{t('access.deniedBy', { roles: source.deniedBy.map((role) => role.name).join(', ') })}</p>
        )}
        {source.allowedBy.length > 0 && (
          <p>{t('access.allowedBy', { roles: source.allowedBy.map((role) => role.name).join(', ') })}</p>
        )}
        {source.allowedBy.length > 0 && source.deniedBy.length > 0 && (
          <p className="text-amber-300">{t('access.allowWins')}</p>
        )}
        {!source.allowedBy.length && !source.deniedBy.length && <p>{t('access.inheritedResult')}</p>}
      </div>
    )
  }
  return (
    <section className="rounded-lg bg-surface-darkest p-4" aria-label={t('access.explanation')}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">{t('access.whyAccess', { name })}</h3>
        <span className="text-sm text-gray-200">
          {t(voice && access.canView ? 'access.canSeeJoin' : `access.status.${access.status}`)}
        </span>
      </div>
      {access.bypass ? (
        <p className="text-sm text-gray-300">{t(`access.${access.bypass}Explanation`)}</p>
      ) : (
        <div className="space-y-4 text-xs leading-relaxed text-gray-400">
          {sources('view')}
          {!voice && access.canView && sources('send')}
          {!access.canView && <p className="text-gray-200">{t('access.hiddenExplanation')}</p>}
        </div>
      )}
    </section>
  )
}

export function ChannelAccessEditor({
  channel,
  access,
  canManage
}: {
  channel: Channel
  access: AccessModel
  canManage: boolean
}) {
  const { t } = useTranslation('channels')
  const [view, setView] = useState<'audience' | 'inspector'>('audience')
  const panelId = useId()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | ChannelAccessStatus>('all')
  const [limit, setLimit] = useState(50)
  const [memberId, setMemberId] = useState('')
  const [roleId, setRoleId] = useState('')
  const [showImpact, setShowImpact] = useState(false)
  const voice = channel.type === 'voice'
  const { context, rules, audience } = access
  const selected = audience.find((row) => row.member.userId === memberId) ?? audience[0]
  const selectedRole =
    context?.roles.find((role) => role.id === roleId) ??
    context?.roles.find((role) => role.isDefault) ??
    context?.roles[0]
  const visibleCount = audience.filter((row) => row.access.canView).length
  const bypassCount = audience.filter((row) => row.access.bypass).length
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return audience.filter(
      (row) =>
        (filter === 'all' || (voice && filter === 'readWrite' ? row.access.canView : row.access.status === filter)) &&
        (!query ||
          [row.member.displayName, row.member.username, ...row.access.roles.map((role) => role.name)].some((value) =>
            value?.toLocaleLowerCase().includes(query)
          ))
    )
  }, [audience, filter, search, voice])
  const stateControl = (id: string, flag: bigint, label: string) => (
    <Select
      aria-label={label}
      size="sm"
      wrapperClassName="w-full sm:w-36"
      value={getChannelRuleState(
        rules.find((rule) => rule.roleId === id),
        flag
      )}
      disabled={access.saving || access.conflict}
      onChange={(event) => access.setPermission(id, flag, event.target.value as ChannelPermissionState)}
    >
      <option value="inherit">{t('access.inherit')}</option>
      <option value="allow">{t('permissions.allow')}</option>
      <option value="deny">{t('permissions.deny')}</option>
    </Select>
  )
  if (!canManage) return <p className="py-6 text-sm text-gray-400">{t('access.manageRolesRequired')}</p>
  if (access.loading || (!context && !access.error))
    return (
      <p className="py-6 text-sm text-gray-400" role="status">
        {t('access.loading')}
      </p>
    )
  if (!context)
    return (
      <div className="space-y-3 py-6">
        <p role="alert" className="text-sm text-red-400">
          {access.error}
        </p>
        <Button variant="secondary" onClick={() => void access.load()}>
          {t('access.retry')}
        </Button>
      </div>
    )
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-gray-400">{t('access.resolutionOrder')}</p>
        <p className="mt-1 text-xs text-gray-500">{t('access.categoryHint')}</p>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-2" aria-live="polite">
        <div>
          <h3 className="text-lg font-semibold text-white">
            {t('access.audienceCount', { visible: visibleCount, total: audience.length })}
          </h3>
          <p className="mt-1 text-xs text-gray-400">{t('access.bypassCount', { count: bypassCount })}</p>
        </div>
        <span className="rounded bg-surface-darkest px-2 py-1 text-xs text-gray-300">
          {t(visibleCount === audience.length ? 'access.everyoneVisible' : 'access.restricted')}
        </span>
      </div>
      {channel.isArchived && <p className="text-sm text-amber-300">{t('access.archivedNotice')}</p>}
      <ChannelSettingsTabs
        label={t('access.views')}
        value={view}
        onChange={setView}
        options={[
          { value: 'audience', label: t('access.audience'), panelId: `${panelId}-audience` },
          { value: 'inspector', label: t('access.inspector'), panelId: `${panelId}-inspector` }
        ]}
      />
      {view === 'audience' ? (
        <div id={`${panelId}-audience`} role="tabpanel" aria-label={t('access.audience')} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <Input
              id={`${panelId}-search`}
              type="search"
              label={t('access.searchMembers')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setLimit(50)
              }}
            />
            <Select
              id={`${panelId}-filter`}
              label={t('access.filter')}
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as typeof filter)
                setLimit(50)
              }}
            >
              <option value="all">{t('access.allMembers')}</option>
              <option value="readWrite">{t(voice ? 'access.canSeeJoin' : 'access.status.readWrite')}</option>
              {!voice && <option value="readOnly">{t('access.status.readOnly')}</option>}
              <option value="hidden">{t('access.status.hidden')}</option>
            </Select>
          </div>
          <div className="divide-y divide-white/5" aria-label={t('access.memberResults')}>
            {filtered.slice(0, limit).map((row) => (
              <button
                key={row.member.userId}
                type="button"
                aria-pressed={selected?.member.userId === row.member.userId}
                onClick={() => setMemberId(row.member.userId)}
                className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-md px-3 py-3 text-left transition ${selected?.member.userId === row.member.userId ? 'bg-primary/15' : 'hover:bg-white/5'}`}
              >
                <span className="min-w-0">
                  <span className="block break-words text-sm font-medium text-white">
                    {row.member.displayName ?? row.member.username}
                    {row.member.displayName && row.member.displayName !== row.member.username && (
                      <span className="ml-1 text-xs font-normal text-gray-400">@{row.member.username}</span>
                    )}
                  </span>
                  <span className="mt-0.5 block break-words text-xs text-gray-400">
                    {row.access.bypass
                      ? t(`access.${row.access.bypass}`)
                      : row.access.roles
                          .filter((role) => !role.isDefault)
                          .map((role) => role.name)
                          .join(' + ') || '@everyone'}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-right text-xs ${row.access.canView ? 'text-emerald-400' : 'text-gray-500'}`}
                >
                  {t(voice && row.access.canView ? 'access.canSeeJoin' : `access.status.${row.access.status}`)}
                </span>
              </button>
            ))}
            {!filtered.length && <p className="py-6 text-sm text-gray-400">{t('access.noMembers')}</p>}
          </div>
          {filtered.length > limit && (
            <Button variant="secondary" onClick={() => setLimit((previous) => previous + 50)}>
              {t('access.showMore')}
            </Button>
          )}
          {selected && <AccessTrace row={selected} voice={voice} />}
          <Button variant="secondary" onClick={() => setView('inspector')}>
            {t('access.editRules')}
          </Button>
        </div>
      ) : (
        <div id={`${panelId}-inspector`} role="tabpanel" aria-label={t('access.inspector')} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-[170px_minmax(0,1fr)]">
            <div className="flex flex-wrap content-start gap-1 sm:flex-col" aria-label={t('access.chooseRole')}>
              {context.roles.map((role) => (
                <button
                  type="button"
                  key={role.id}
                  aria-pressed={selectedRole?.id === role.id}
                  className={`min-h-10 break-words rounded-md px-3 py-2 text-left text-sm ${selectedRole?.id === role.id ? 'bg-primary/20 text-white' : 'text-gray-400 hover:bg-white/5'}`}
                  onClick={() => setRoleId(role.id)}
                >
                  {role.name}
                  {rules.some((rule) => rule.roleId === role.id) && (
                    <span className="ml-1 text-primary" aria-label={t('access.hasOverrides')}>
                      •
                    </span>
                  )}
                </button>
              ))}
            </div>
            {selectedRole && (
              <div className="min-w-0 space-y-4">
                <div>
                  <h3 className="break-words text-sm font-semibold text-white">{selectedRole.name}</h3>
                  <p className="mt-1 text-xs text-gray-400">{t('access.inheritHint')}</p>
                </div>
                <label className="flex flex-col justify-between gap-2 border-b border-white/5 pb-3 sm:flex-row sm:items-center">
                  <span className="text-sm text-gray-300">{t('access.viewChannel')}</span>
                  {stateControl(
                    selectedRole.id,
                    Permission.VIEW_CHANNEL,
                    t('access.viewForRole', { role: selectedRole.name })
                  )}
                </label>
                {!voice && (
                  <label className="flex flex-col justify-between gap-2 border-b border-white/5 pb-3 sm:flex-row sm:items-center">
                    <span className="text-sm text-gray-300">{t('access.sendMessages')}</span>
                    {stateControl(
                      selectedRole.id,
                      Permission.SEND_MESSAGES,
                      t('access.sendForRole', { role: selectedRole.name })
                    )}
                  </label>
                )}
                <p className="text-xs leading-relaxed text-amber-300">{t('access.conflictHint')}</p>
                {rules.some((rule) => rule.roleId === selectedRole.id) && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={access.saving || access.conflict}
                    onClick={() => access.removeRule(selectedRole.id)}
                  >
                    {t('access.resetRole')}
                  </Button>
                )}
              </div>
            )}
          </div>
          {selected && (
            <>
              <Select
                id={`${panelId}-preview`}
                label={t('access.previewMember')}
                value={selected.member.userId}
                onChange={(event) => setMemberId(event.target.value)}
              >
                {audience.map((row) => (
                  <option value={row.member.userId} key={row.member.userId}>
                    {row.member.displayName ?? row.member.username} (@{row.member.username})
                  </option>
                ))}
              </Select>
              <AccessTrace row={selected} voice={voice} />
            </>
          )}
        </div>
      )}
      <div className="space-y-2 border-t border-white/10 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!access.dirty && (
            <p className="text-xs text-gray-400" role="status">
              {t('access.saved')}
            </p>
          )}
          {access.dirty && (
            <Button variant="secondary" size="sm" disabled={access.saving} onClick={access.discard}>
              {t('access.discard')}
            </Button>
          )}
        </div>
        {access.dirty && access.impact.members.length > 0 && (
          <>
            <button
              type="button"
              className="min-h-9 text-xs text-primary hover:underline"
              aria-expanded={showImpact}
              onClick={() => setShowImpact((previous) => !previous)}
            >
              {t('access.reviewImpact')}
            </button>
            {showImpact && (
              <ul className="space-y-1 text-xs text-gray-400">
                {access.impact.members.slice(0, 50).map((row) => (
                  <li key={row.member.userId}>
                    {row.member.displayName ?? row.member.username}:{' '}
                    {t(voice && row.original.canView ? 'access.canSeeJoin' : `access.status.${row.original.status}`)} →{' '}
                    {t(voice && row.access.canView ? 'access.canSeeJoin' : `access.status.${row.access.status}`)}
                  </li>
                ))}
                {access.impact.members.length > 50 && (
                  <li>{t('access.moreAffected', { count: access.impact.members.length - 50 })}</li>
                )}
              </ul>
            )}
          </>
        )}
        {access.error && (
          <p className="text-sm text-red-400" role="alert">
            {access.error}
          </p>
        )}
        {access.conflict && (
          <Button variant="secondary" onClick={() => void access.load()}>
            {t('access.reload')}
          </Button>
        )}
      </div>
    </div>
  )
}
