import { UI_THEMES } from '../../../layers/studio/src/utils/ui-themes'

// The theme on trial sets an attribute of the root element. The page is
// generated without it, so a script in the head sets it from the cookie before
// the first paint.
export default defineNuxtPlugin(() => {
  const { trials, theme } = useUiTheme()
  if (!trials)
    return
  const themes = JSON.stringify(UI_THEMES.filter(id => id !== 'vignettes'))
  useHead({
    htmlAttrs: {
      'data-ui-theme': () => theme.value === 'vignettes' ? undefined : theme.value,
    },
    script: [{
      tagPosition: 'head',
      innerHTML: `(()=>{const c=Object.fromEntries(document.cookie.split('; ').map(p=>p.split('=')));if(${themes}.includes(c.ui_theme))document.documentElement.dataset.uiTheme=c.ui_theme})()`,
    }],
  })
})
