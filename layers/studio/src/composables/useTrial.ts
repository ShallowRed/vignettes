import type { TrialFeature } from '#shared/trials'

/** Whether `feature`, a feature on trial, opens on this instance: the server of the page decides. */
export function useTrial(feature: TrialFeature) {
  const open = useState<TrialFeature[]>('trials', () => useRequestEvent()?.context.trials ?? [])
  return computed(() => open.value.includes(feature))
}
