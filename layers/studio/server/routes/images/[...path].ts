import { serveDeckAsset } from '../../utils/deck-assets'

/**
 * `/images/**` of the content space, served with the visibility of the decks
 * referencing the file; the application's own files under `public/images` are
 * static and served first.
 */
export default defineEventHandler(event => serveDeckAsset(event, 'images', { gated: true }))
