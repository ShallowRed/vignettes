import type { Extension } from '@codemirror/state'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { Peer } from '../utils/editor-peers'
import { REFUSAL_REASONS, STOPPING_CLOSES } from '#shared/collab/close-reasons'
import { keymap } from '@codemirror/view'
import { collabUndoKeys, collabWriteGate } from '../utils/collab-write-gate'
import { awarenessPeers, peerColor } from '../utils/editor-peers'
import { useAppSession } from './useAppSession'

// The server acknowledges each keystroke within a moment; the indicator shows
// the pending state only when it lasts, so it stays still while someone types.
const SAVING_DELAY_MS = 1200

/**
 * The shared draft of a deck (Yjs + Hocuspocus), started on mount when `enabled`.
 * The collab stack is imported on the client only, so the server render and the
 * solo editor never load it. The Y.Text is the live document: it is mirrored
 * into `raw` for the preview, and y-codemirror.next drives the editor and the
 * remote carets through `extensions`.
 */
export function useCollabDraft(slug: string, raw: Ref<string>, enabled: MaybeRefOrGetter<boolean>) {
  const { t } = useI18n()
  const { user } = useAppSession()

  const status = ref<'connecting' | 'connected' | 'disconnected'>('connecting')
  // Why the shared draft stopped for good: the server refused the room, or
  // refused it for a published version past the deck limit, or it closed the
  // connection of this tab, whose document holds another lineage than the stored
  // draft, or whose room passed the deck limit. The page offers to reload, or to
  // switch to solo for a deck past the limit.
  const ended = ref<'refused' | 'tooLong' | 'closed' | null>(null)
  // The text of this tab when the draft stopped, for whoever wants to copy it.
  const localText = ref('')
  const docSynced = ref(false)
  const synced = ref(true)
  // The other connected people, one entry per account.
  const peers = ref<Peer[]>([])
  const extensions = shallowRef<Extension[]>([])
  let onPublished = () => {}
  let cleanup: (() => void) | null = null

  async function start() {
    const [{ Doc }, { HocuspocusProvider }, { yCollab, yUndoManagerKeymap, yRemoteSelectionsTheme }, { DECK_TEXT_FIELD }] = await Promise.all([
      import('yjs'),
      import('@hocuspocus/provider'),
      import('y-codemirror.next'),
      import('#shared/collab/ydoc'),
    ])

    const ydoc = new Doc()
    // Same-origin endpoint: the session cookie rides the upgrade request, so the
    // server authorizes the connection there without a token.
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const provider = new HocuspocusProvider({
      // The deck rides the query so the upgrade can authorize it (per-deck grant)
      // before Hocuspocus reveals the document name.
      url: `${wsProtocol}://${window.location.host}/collab?deck=${encodeURIComponent(slug)}`,
      name: slug,
      document: ydoc,
    })

    const ytext = ydoc.getText(DECK_TEXT_FIELD)
    // Retrying would meet the same answer: the provider stops, and the editor
    // keeps the text it has.
    const stop = (reason: 'refused' | 'tooLong' | 'closed') => {
      localText.value = ytext.toString()
      ended.value = reason
      status.value = 'disconnected'
      provider.destroy()
    }

    provider.on('status', (e: { status: string }) => {
      if (!ended.value)
        status.value = e.status === 'connected' ? 'connected' : 'connecting'
    })
    // The server refuses to load the room (no deck, a deck too long, another deck
    // than the one this socket was opened for, or storage unavailable).
    provider.on('authenticationFailed', ({ reason }: { reason: string }) => stop(reason === REFUSAL_REASONS.tooLong ? 'tooLong' : 'refused'))
    provider.on('close', ({ event }: { event: { reason?: string } }) => {
      if (event.reason && STOPPING_CLOSES.includes(event.reason))
        stop('closed')
    })
    provider.on('disconnect', () => {
      status.value = 'disconnected'
    })
    provider.on('synced', () => {
      docSynced.value = true
    })
    // Edits the server has to acknowledge: the header shows them as pending.
    provider.on('unsyncedChanges', (e: { number: number }) => {
      synced.value = e.number === 0
    })
    // The publish endpoint broadcasts to the room, and every client re-reads its
    // publication state.
    provider.on('stateless', ({ payload }: { payload: string }) => {
      try {
        if (JSON.parse(payload)?.type === 'published')
          onPublished()
      }
      catch {}
    })

    const syncRaw = () => {
      raw.value = ytext.toString()
    }
    ytext.observe(syncRaw)

    const login = user.value?.login
    provider.awareness?.setLocalStateField('user', {
      name: user.value?.name || login || t('editor.page.anonymousPeer'),
      color: peerColor(login),
      login,
    })
    provider.awareness?.on('change', () => {
      const states = provider.awareness?.getStates()
      peers.value = states && provider.awareness ? awarenessPeers(states, provider.awareness.clientID, login) : []
    })

    // yCollab wires sync + local awareness; yRemoteSelectionsTheme is
    // y-codemirror.next's own styling for remote carets/selections.
    extensions.value = [
      collabWriteGate(ydoc, () => docSynced.value && !ended.value),
      yCollab(ytext, provider.awareness),
      yRemoteSelectionsTheme,
      keymap.of(collabUndoKeys(yUndoManagerKeymap)),
    ]

    cleanup = () => {
      ytext.unobserve(syncRaw)
      provider.destroy()
      ydoc.destroy()
    }
  }

  const savingShown = ref(false)
  let savingTimer: ReturnType<typeof setTimeout> | undefined
  watch(synced, (value) => {
    clearTimeout(savingTimer)
    if (value)
      savingShown.value = false
    else
      savingTimer = setTimeout(() => savingShown.value = true, SAVING_DELAY_MS)
  })

  /** The state of the draft in the header: connection, then acknowledgement of the edits. */
  const indicator = computed(() => {
    if (status.value === 'disconnected')
      return { icon: 'i-lucide-cloud-off', class: 'text-error', labelClass: 'text-error', label: t('editor.collab.offline') }
    if (status.value !== 'connected' || !docSynced.value)
      return { icon: 'i-lucide-loader-circle', class: 'text-dimmed animate-spin', labelClass: 'text-muted', label: t('editor.collab.connecting') }
    if (savingShown.value)
      return { icon: 'i-lucide-cloud-upload', class: 'text-warning', labelClass: 'text-muted', label: t('editor.collab.saving') }
    return { icon: 'i-lucide-cloud-check', class: 'text-muted', labelClass: 'text-muted', label: t('editor.collab.synced') }
  })

  onMounted(() => {
    if (toValue(enabled))
      start()
  })
  onBeforeUnmount(() => {
    clearTimeout(savingTimer)
    cleanup?.()
  })

  return {
    status,
    ended,
    localText,
    docSynced,
    peers,
    extensions,
    indicator,
    /** Called when someone, maybe this tab, published the deck. */
    onPublished: (callback: () => void) => {
      onPublished = callback
    },
  }
}
