import { serveDeckAsset } from '../../utils/deck-assets'

/** `/backgrounds/**` of the content space; the application's own files under `public/backgrounds` are static and served first. */
export default defineEventHandler(event => serveDeckAsset(event, 'backgrounds'))
