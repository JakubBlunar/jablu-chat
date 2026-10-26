import { useReadStateStore } from '@/stores/readState.store'
import { createRefreshScheduler } from './refreshScheduler'

const scheduler = createRefreshScheduler(() => useReadStateStore.getState().fetchAll(), 1500)
export const requestReadStateRefresh = scheduler.request
export const cancelReadStateRefresh = scheduler.cancel
