import type { MediaRefusal } from '@vignettes/core/media'
import type { Translate } from '../config/editor-reference'
import { IMAGE_FORMAT_NAMES, MAX_MEDIA_MEGABYTES } from '@vignettes/core/media'
import { requestErrorMessage } from './request-error'

/**
 * The toast of an image the upload refused: the file in the title, the cause in
 * the description, worded in the interface language from the reason the server
 * gives, otherwise the server's own message.
 */
export function imageUploadFailure(error: unknown, file: File, t: Translate, locale: string): { title: string, description?: string } {
  const title = t('editor.imageUpload.failed', { name: file.name })
  const reason = (error as { data?: { data?: { reason?: MediaRefusal } } } | null)?.data?.data?.reason
  if (reason === 'type')
    return { title, description: t('editor.imageUpload.type', { formats: IMAGE_FORMAT_NAMES.join(', ') }) }
  if (reason === 'size') {
    const megabytes = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
    return { title, description: t('editor.imageUpload.size', { size: megabytes.format(file.size / 2 ** 20), limit: MAX_MEDIA_MEGABYTES }) }
  }
  if (reason === 'content')
    return { title, description: t('editor.imageUpload.content') }
  if (reason === 'storage')
    return { title, description: t('editor.imageUpload.storage') }
  return { title, description: requestErrorMessage(error, '') || undefined }
}
