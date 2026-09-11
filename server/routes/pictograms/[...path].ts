import { serveDeckAsset } from '../../utils/deck-assets'

/** `/pictograms/**` of the content space; the application's own files under `public/pictograms` are static and served first. */
export default defineEventHandler(event => serveDeckAsset(event, 'pictograms'))
