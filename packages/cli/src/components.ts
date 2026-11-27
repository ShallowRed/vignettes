import { registerDeckComponents } from '@vignettes/core/deck'
import { SCHEMA_COMPONENTS } from '@vignettes/schemas/components'
import { STORYBOOK_COMPONENTS } from '@vignettes/storybook/components'

/** Adds the components of the extension packages of the repository to those the checks know. */
export function registerKnownComponents(): void {
  registerDeckComponents([...SCHEMA_COMPONENTS, ...STORYBOOK_COMPONENTS])
}
