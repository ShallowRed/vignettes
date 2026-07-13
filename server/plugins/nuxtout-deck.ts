/**
 * When building a bundle, turn a prerendered deck into a self-contained
 * Reveal-only page. Only ADDS what a standalone Reveal page needs — never strips
 * tags. Reveal.js + the theme are copied in by the Makefile.
 */

import { readBundleConfig } from '#shared/build'
import { DEFAULT_REVEAL_CONFIG, rebaseAssetUrls } from '#shared/render'

// Iframe scaler, inlined after Reveal.initialize (a separate <script src> gets
// detached by Reveal). Mirrors public/scaled-frame.js; reads client size rather
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

export default defineNitroPlugin((nitroApp) => {
  const bundle = readBundleConfig()
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

  nitroApp.hooks.hook('render:html', (html) => {
    // Rebase _nuxt/*.css links so they resolve under the bundle, not the origin root.
    html.head = html.head.map(s => s.replace(/(href=")\/(_nuxt\/[^"]+\.css)/g, `$1${prefix}/$2`))

    html.head.push(
      `<link rel="stylesheet" href="${prefix}/reveal/reveal.css">`,
      `<link rel="stylesheet" href="${prefix}/themes/${theme}.css">`,
    )
    html.bodyAppend.push(
      `<script src="${prefix}/reveal/reveal.js"></script>`,
      `<script>Reveal.initialize(${revealInitExpr});\n${INLINE_SCALER}</script>`,
    )
    // Rebase the deck's own root-absolute asset URLs under the bundle prefix.
    html.body = html.body.map(chunk => rebaseAssetUrls(chunk, prefix))
  })
})
