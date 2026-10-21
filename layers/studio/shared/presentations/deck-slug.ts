import { isDeckSlug } from '@vignettes/core/deck'
import { z } from 'zod'

/** A deck slug in a request body: also the rule of an alias and of a frozen bundle name. */
export const DeckSlugSchema = z.string().refine(isDeckSlug, 'Invalid slug')
