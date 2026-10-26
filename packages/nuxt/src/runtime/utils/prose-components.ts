import type { Component } from 'vue'
import ProseA from '@nuxtjs/mdc/runtime/components/prose/ProseA.vue'
import ProseBlockquote from '@nuxtjs/mdc/runtime/components/prose/ProseBlockquote.vue'
import ProseCode from '@nuxtjs/mdc/runtime/components/prose/ProseCode.vue'
import ProseEm from '@nuxtjs/mdc/runtime/components/prose/ProseEm.vue'
import ProseHr from '@nuxtjs/mdc/runtime/components/prose/ProseHr.vue'
import ProseImg from '@nuxtjs/mdc/runtime/components/prose/ProseImg.vue'
import ProseLi from '@nuxtjs/mdc/runtime/components/prose/ProseLi.vue'
import ProseOl from '@nuxtjs/mdc/runtime/components/prose/ProseOl.vue'
import ProseP from '@nuxtjs/mdc/runtime/components/prose/ProseP.vue'
import ProsePre from '@nuxtjs/mdc/runtime/components/prose/ProsePre.vue'
import ProseScript from '@nuxtjs/mdc/runtime/components/prose/ProseScript.vue'
import ProseStrong from '@nuxtjs/mdc/runtime/components/prose/ProseStrong.vue'
import ProseTable from '@nuxtjs/mdc/runtime/components/prose/ProseTable.vue'
import ProseTbody from '@nuxtjs/mdc/runtime/components/prose/ProseTbody.vue'
import ProseTd from '@nuxtjs/mdc/runtime/components/prose/ProseTd.vue'
import ProseTh from '@nuxtjs/mdc/runtime/components/prose/ProseTh.vue'
import ProseThead from '@nuxtjs/mdc/runtime/components/prose/ProseThead.vue'
import ProseTr from '@nuxtjs/mdc/runtime/components/prose/ProseTr.vue'
import ProseUl from '@nuxtjs/mdc/runtime/components/prose/ProseUl.vue'

/**
 * The prose components of MDC, by the tag they render. A host application may
 * register its own under the same global names (a documentation site wraps a
 * code block with a copy button), which would render the same deck differently
 * from one host to another, so the slides use these ones.
 */
export const proseComponents: Record<string, Component> = {
  a: ProseA,
  blockquote: ProseBlockquote,
  code: ProseCode,
  em: ProseEm,
  hr: ProseHr,
  img: ProseImg,
  li: ProseLi,
  ol: ProseOl,
  p: ProseP,
  pre: ProsePre,
  script: ProseScript,
  strong: ProseStrong,
  table: ProseTable,
  tbody: ProseTbody,
  td: ProseTd,
  th: ProseTh,
  thead: ProseThead,
  tr: ProseTr,
  ul: ProseUl,
}
