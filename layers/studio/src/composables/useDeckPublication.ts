import type { DeckDraftSource } from '#shared/presentations'
import type { Ref } from 'vue'
import type { Fetcher } from '../api'
import { useQuery } from '@pinia/colada'
import { deckApi } from '../api'
import { historyQuery } from '../queries'
import { draftUnpublished } from '../utils/draft-publication'
import { requestErrorMessage } from '../utils/request-error'

interface DeckPublicationOptions {
  slug: string
  /** The text in the editor. */
  raw: Ref<string>
  /** The draft as the page loaded it. */
  source: DeckDraftSource | null | undefined
  writable: Ref<boolean>
  /** In collab mode the shared document holds the draft and saves it on every edit. */
  collab: Ref<boolean>
  /** Whether the shared document synced, before which its text is unknown. */
  docSynced: Ref<boolean>
  requestFetch: Fetcher
  onPublished: () => Promise<void>
}

/**
 * The publication state of the draft in the editor (whether the visitors see it,
 * the lines it changed, the version they see) and its two writes: the explicit
 * save of the solo editor, and publishing.
 */
export function useDeckPublication(options: DeckPublicationOptions) {
  const { slug, raw, collab, docSynced } = options
  const { t, locale } = useI18n()
  const toast = useToast()
  const { track } = useStudioEvent()

  const lastSaved = ref('')
  // Solo concurrency token: the draft stamp we loaded, echoed on save so the
  // server refuses to overwrite someone else's newer draft (409).
  const draftStamp = ref<number | null>(options.source?.stamp ?? null)
  // The served text, to tell whether the draft holds changes the visitors do not see yet.
  const publishedRaw = ref<string | null>(options.source?.publishedRaw ?? null)
  const publishedAt = ref<number | null>(options.source?.publishedAt ?? null)
  // The served version when the draft was loaded, sent with a save that loaded no draft.
  let loadedVersion = options.source?.publishedVersion ?? null
  // The fetched markdown seeds `raw`, which the preview and the status bar read
  // at once. Solo mode edits it; in collab mode the server seeds the Y.Text, the
  // one source of the editor, and `raw` follows it once the document syncs.
  if (options.source) {
    raw.value = options.source.content
    if (!collab.value)
      lastSaved.value = options.source.content
  }

  // In solo mode the draft is only "unsaved" when it differs from what the server has.
  const dirty = computed(() => !collab.value && raw.value !== lastSaved.value)
  const draft = computed(() => collab.value && !docSynced.value ? null : raw.value)
  const neverPublished = computed(() => publishedRaw.value === null)
  const unpublished = computed(() => draftUnpublished(draft.value, publishedRaw.value))

  // The versions are numbered in the order of their publication; the history
  // lists the newest first.
  const historyQ = useQuery({ ...historyQuery(options.requestFetch, slug), enabled: () => options.writable.value })
  const versionNumber = computed(() => {
    const versions = (historyQ.data.value ?? []).filter(entry => entry.kind === 'version')
    const index = versions.findIndex(entry => entry.current)
    return index === -1 ? null : versions.length - index
  })

  const publishedAtLabel = computed(() =>
    publishedAt.value ? new Date(publishedAt.value).toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' }) : null)
  const publicationHint = computed(() => {
    if (neverPublished.value)
      return t('editor.publication.hintNeverPublished')
    const date = publishedAtLabel.value
    const version = versionNumber.value
    if (unpublished.value) {
      if (date && version)
        return t('editor.publication.hintUnpublishedVersion', { date, version })
      return date ? t('editor.publication.hintUnpublishedSince', { date }) : t('editor.publication.hintUnpublished')
    }
    if (date && version)
      return t('editor.publication.hintUpToDateVersion', { date, version })
    return date ? t('editor.publication.hintUpToDateSince', { date }) : t('editor.publication.hintUpToDate')
  })

  /** Re-read the published state after someone (maybe this client) published. */
  async function refreshPublished() {
    const res = await deckApi.loadDraft($fetch, slug)
    publishedRaw.value = res.publishedRaw ?? null
    publishedAt.value = res.publishedAt ?? null
  }

  /** A restored version reaches a collab room through Yjs; the solo editor re-reads the draft it replaced. */
  async function reloadDraft(stamp: number | null) {
    if (collab.value)
      return
    const fresh = await deckApi.loadDraft($fetch, slug)
    raw.value = fresh.content
    lastSaved.value = fresh.content
    draftStamp.value = stamp
    loadedVersion = fresh.publishedVersion
  }

  async function writeDraft() {
    const saved = raw.value
    const res = await deckApi.saveDraft($fetch, slug, { raw: saved, stamp: draftStamp.value, publishedVersion: loadedVersion })
    draftStamp.value = res.stamp ?? null
    lastSaved.value = saved
  }

  // Guard re-entry: these use $fetch directly, without a mutation's own in-flight
  // lock, so a double-click would fire two PUTs and race the state.
  const saveState = ref<'idle' | 'saving' | 'error'>('idle')
  async function save() {
    if (saveState.value === 'saving')
      return
    saveState.value = 'saving'
    try {
      await writeDraft()
      saveState.value = 'idle'
      toast.add({ title: t('editor.save.saved'), icon: 'i-lucide-check', color: 'success' })
    }
    catch (e: any) {
      saveState.value = 'error'
      // A 409 means someone saved this draft after we loaded it.
      toast.add({
        title: e?.statusCode === 409 || e?.data?.data?.conflict || e?.data?.conflict
          ? t('editor.save.conflict')
          : requestErrorMessage(e, e?.message || t('editor.save.failed')),
        icon: 'i-lucide-triangle-alert',
        color: 'error',
      })
    }
  }

  const publishState = ref<'idle' | 'publishing' | 'error'>('idle')
  async function publish() {
    if (publishState.value === 'publishing')
      return
    publishState.value = 'publishing'
    try {
      // Solo mode: make sure the draft carries the current text before deriving.
      if (!collab.value)
        await writeDraft()
      await deckApi.publish($fetch, slug)
      track('deck-published', {})
      publishedRaw.value = raw.value
      publishedAt.value = Date.now()
      publishState.value = 'idle'
      historyQ.refetch()
      await options.onPublished()
    }
    catch (e: any) {
      publishState.value = 'error'
      toast.add({ title: requestErrorMessage(e, e?.message || t('editor.publication.failed')), icon: 'i-lucide-triangle-alert', color: 'error' })
    }
  }

  return {
    publishedRaw,
    dirty,
    neverPublished,
    unpublished,
    publicationHint,
    saveState,
    publishState,
    save,
    publish,
    refreshPublished,
    reloadDraft,
  }
}
