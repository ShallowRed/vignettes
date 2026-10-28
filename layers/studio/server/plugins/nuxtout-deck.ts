/**
 * When building a bundle, turn a prerendered deck into a self-contained
 * Reveal-only page: its stylesheets become depth-relative, and Reveal is
 * initialized by an inline script. Reveal.js and the theme are copied in by
 * `@vignettes/freeze`.
 */

import { DEFAULT_REVEAL_CONFIG, rebaseAssetUrls, scrollViewFrames, scrollViewLinks } from '@vignettes/core/render'
import { serverConfig } from '../utils/config'

// Iframe scaler, inlined after Reveal.initialize (a separate <script src> gets
// detached by Reveal). Mirrors scaled-frame.js of @vignettes/storybook; reads client size rather
// than CSS `cqh` (broken in Firefox).
const INLINE_SCALER = `(function(){
var SEL='.slide-media-pane.is-scaled,.story-frame__media.is-scaled';
function m(p){var f=p.querySelector('iframe');if(!f)return;var w=p.clientWidth,h=p.clientHeight;if(!w||!h)return;
var pw=parseFloat(getComputedStyle(p).getPropertyValue('--preview-width'))||1440;var s=w/pw;
f.style.position='absolute';f.style.top='0';f.style.left='0';f.style.width=pw+'px';f.style.height=(s>0?h/s:h)+'px';
f.style.transform='scale('+s+')';f.style.transformOrigin='top left';}
var ro=typeof ResizeObserver!=='undefined'?new ResizeObserver(function(es){es.forEach(function(e){m(e.target)})}):null;
function scan(){document.querySelectorAll(SEL).forEach(function(p){m(p);if(ro){ro.observe(p);}});}
// Reveal.initialize() is async — retry via rAF until panes have a size.
var tries=0;function tick(){scan();if(++tries<20){requestAnimationFrame(tick);}}
requestAnimationFrame(tick);
if(window.Reveal&&Reveal.on){Reveal.on('ready',scan);Reveal.on('slidechanged',scan);Reveal.on('resize',scan);}
})();`

// The bundle has no Vue runtime, so this script lifts the loading veil that
// RevealPresentation renders, once Reveal is ready and the fonts are loaded, or
// after 4 seconds.
const LIFT_VEIL = `function liftVeil(){var v=document.querySelector('.deck-veil');`
  + `if(v)v.classList.add('deck-veil--lifted');}setTimeout(liftVeil,4000);`

export default defineNitroPlugin((nitroApp) => {
  const bundle = serverConfig().bundle
  if (!bundle.enabled)
    return

  const theme = bundle.theme
  // Depth-relative prefix (deck HTML sits two dirs below the bundle root) keeps
  // the bundle location-agnostic: works at `/frozen/<alias>/`, the origin root, anywhere.
  const prefix = '../..'

  // Prefer the per-deck config RevealPresentation serialised onto
  // `.reveal[data-reveal-config]`; without it the bundle used wrong margins.
  const { autoPlayMedia, preloadIframes, ...defaultConfig } = DEFAULT_REVEAL_CONFIG
  const defaultInit = JSON.stringify(defaultConfig)
  const revealInitExpr
    = `(function(){var el=document.querySelector('.reveal[data-reveal-config]');`
      + `try{return el?JSON.parse(el.getAttribute('data-reveal-config')):${defaultInit};}`
      + `catch(e){return ${defaultInit};}})()`

  // Nuxt writes its own stylesheet links against the app base (`/` or the
  // bundle's URL); both forms become depth-relative so the bundle resolves them
  // wherever it is served from.
  const base = bundle.baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const nuxtCss = new RegExp(`(href=")(?:${base}|/)(_nuxt/[^"]+\\.css)`, 'g')
  const themeLink = /<link[^>]*\sdata-deck-theme[^>]*>/g

  nitroApp.hooks.hook('render:html', (html) => {
    // The app's theme link is root-absolute; the bundle links its own copy below.
    html.head = html.head.map(s => s.replace(nuxtCss, `$1${prefix}/$2`).replace(themeLink, ''))

    html.head.push(`<link rel="stylesheet" href="${prefix}/reveal/reveal.css">`)
    if (theme)
      html.head.push(`<link rel="stylesheet" href="${prefix}/themes/${theme}.css">`)
    html.bodyAppend.push(
      `<script src="${prefix}/reveal/reveal.js"></script>`,
      `<script>${LIFT_VEIL}\nReveal.initialize(Object.assign(${revealInitExpr}, { plugins: [${scrollViewLinks}, ${scrollViewFrames}] }))`
      + `.then(function(){return document.fonts.ready;}).then(liftVeil);\n${INLINE_SCALER}</script>`,
    )
    // Rebase the deck's own root-absolute asset URLs under the bundle prefix.
    html.body = html.body.map(chunk => rebaseAssetUrls(chunk, prefix))
  })
})
