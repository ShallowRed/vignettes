# @vignettes/typographie

French orthotypography applied to rendered text: a non-breaking space before the double punctuation marks, French quotes, and the spacing the language asks for.

```bash
pnpm add @vignettes/typographie
```

```ts
import { vFrenchTypography } from '@vignettes/typographie'

app.directive('french-typography', vFrenchTypography)
```

```vue
<div v-french-typography="lang.startsWith('fr')">
…
</div>
```

The directive walks the text nodes of the subtree at mount, skipping code and form fields, and keeps watching it so content added later is treated too. `v-french-typography="false"` leaves the text untouched, which is what a deck in another language wants.

`@vignettes/nuxt` registers it for you.
