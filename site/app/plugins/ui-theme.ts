import { UI_THEME_COOKIE, UI_THEMES } from '../../../layers/studio/src/utils/ui-themes'

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
      innerHTML: `(()=>{const c=Object.fromEntries(document.cookie.split('; ').map(p=>p.split('=')));const t=c[${JSON.stringify(UI_THEME_COOKIE.name)}];if(${themes}.includes(t))document.documentElement.dataset.uiTheme=t})()`,
    }],
  })
})
