<script setup lang="ts">
import type { DiagramSide } from '~/config/injection-keys'
import { inject, onMounted } from 'vue'
import { DIAGRAM } from '~/config/injection-keys'

// An arrow between two `::Node` ids; drawn by the enclosing `:::Diagram`.
interface Props {
  from: string
  to: string
  label?: string
  dashed?: boolean
  /** Fragment step; defaults to the later of the two nodes. */
  step?: string | number
  /** Sides to leave and enter by, `from,to` (`top` | `right` | `bottom` | `left`); geometry decides when absent. */
  anchors?: string
  route?: 'curve' | 'orthogonal'
}

const props = defineProps<Props>()
const registry = inject(DIAGRAM, null)

onMounted(() => {
  registry?.registerEdge({
    from: props.from,
    to: props.to,
    label: props.label,
    dashed: props.dashed,
    step: props.step === undefined || props.step === '' ? undefined : Number(props.step),
    anchors: props.anchors ? (props.anchors.split(',').map(v => v.trim() || undefined) as [DiagramSide | undefined, DiagramSide | undefined]) : undefined,
    route: props.route,
  })
})
</script>

<template>
  <span
    class="diagram-edge-source"
    hidden
  />
</template>
