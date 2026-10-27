import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  canonicalChannelRules,
  explainChannelAccess,
  setChannelRuleState,
  type ChannelAccessContext,
  type ChannelAccessRule,
  type ChannelPermissionState
} from '@chat/shared'
import { api, ApiError } from '@/lib/api'
import { useChannelPermissionsStore } from '@/stores/channel-permissions.store'

export function useChannelAccess(serverId: string, channelId: string, enabled: boolean) {
  const { t } = useTranslation('channels')
  const [context, setContext] = useState<ChannelAccessContext | null>(null)
  const [rules, setRules] = useState<ChannelAccessRule[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const request = useRef<AbortController | null>(null)
  const load = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError(null)
    try {
      const data = await api.getChannelAccess(serverId, channelId, { signal: controller.signal })
      if (controller.signal.aborted) return
      setContext(data)
      setRules(data.overrides)
      setConflict(false)
    } catch {
      if (!controller.signal.aborted) setError(t('access.loadFailed'))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [serverId, channelId, t])
  useEffect(() => {
    if (enabled) void load()
    return () => request.current?.abort()
  }, [enabled, load])
  const dirty = !!context && canonicalChannelRules(rules) !== canonicalChannelRules(context.overrides)
  const audience = useMemo(
    () =>
      context?.members.map((member) => ({
        member,
        access: explainChannelAccess(context, member, rules),
        original: explainChannelAccess(context, member, context.overrides)
      })) ?? [],
    [context, rules]
  )
  const impact = useMemo(
    () => ({
      gained: audience.filter((row) => row.access.canView && !row.original.canView).length,
      lost: audience.filter((row) => !row.access.canView && row.original.canView).length,
      sending: audience.filter(
        (row) => row.access.canView && row.original.canView && row.access.canSend !== row.original.canSend
      ).length,
      members: audience.filter((row) => row.access.status !== row.original.status)
    }),
    [audience]
  )
  const setPermission = (roleId: string, flag: bigint, state: ChannelPermissionState) => {
    if (saving) return
    setRules((previous) => {
      const existing = previous.find((rule) => rule.roleId === roleId)
      const next = setChannelRuleState(existing ?? { roleId, allow: '0', deny: '0' }, flag, state)
      const others = previous.filter((rule) => rule.roleId !== roleId)
      return BigInt(next.allow) === 0n && BigInt(next.deny) === 0n ? others : [...others, next]
    })
  }
  const discard = () => {
    if (saving || !context) return
    setRules(context.overrides)
    setError(null)
  }
  const save = async () => {
    if (!context || !dirty || saving || conflict) return !dirty
    setSaving(true)
    setError(null)
    try {
      const saved = await api.saveChannelAccess(serverId, channelId, {
        overrides: rules,
        expectedOverrides: context.overrides
      })
      setContext((previous) => (previous ? { ...previous, overrides: saved.overrides } : previous))
      setRules(saved.overrides)
      void useChannelPermissionsStore.getState().fetchChannelPermissions(serverId, true)
      return true
    } catch (error) {
      const stale = error instanceof ApiError && error.status === 409
      setConflict(stale)
      setError(t(stale ? 'access.conflict' : 'access.saveFailed'))
      return false
    } finally {
      setSaving(false)
    }
  }
  return {
    context,
    rules,
    loading,
    saving,
    error,
    conflict,
    dirty,
    audience,
    impact,
    load,
    setPermission,
    discard,
    save,
    removeRule: (roleId: string) => {
      if (!saving) setRules((previous) => previous.filter((rule) => rule.roleId !== roleId))
    }
  }
}
