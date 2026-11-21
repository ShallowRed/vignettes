<script setup lang="ts">
import type { DiagramSide } from '../injection-keys.ts'
import { inject, onMounted } from 'vue'
import { DIAGRAM } from '../injection-keys.ts'

// An arrow between two `::Node` ids; drawn by the enclosing `:::Diagram`.
interface Props {
  /**
   * `id` of the node the arrow leaves.
   * @fr `id` du nœud d'où part la flèche.
   */
  from: string
  /**
   * `id` of the node the arrow reaches.
   * @fr `id` du nœud où arrive la flèche.
   */
  to: string
  /**
   * Text on the arrow.
   * @fr Texte sur la flèche.
   */
  label?: string
  /**
   * Draws a dashed arrow, for an asynchronous message: the sender goes on without waiting for an answer.
   * @fr Dessine une flèche en pointillés, pour un message asynchrone : l'émetteur continue sans attendre de réponse.
   */
  dashed?: boolean
  /**
   * `false` leaves the arrowhead off, for the leg that reaches a flow box.
   * @fr `false` retire la pointe de la flèche, pour le tronçon qui arrive sur une pastille `flow`.
   */
  arrow?: boolean
  /**
   * Fragment step; defaults to the later of the two nodes.
   * @fr Étape d'apparition ; par défaut, celle du dernier des deux nœuds.
   */
  step?: string | number
  /**
   * Sides to leave and enter by, `from,to` (`top` | `right` | `bottom` | `left`); without it, the sides follow the position of the cards.
   * @fr Côtés de départ et d'arrivée, `from,to` (`top` | `right` | `bottom` | `left`) ; sans lui, les côtés suivent la position des cartes.
   */
  anchors?: string
  /**
   * Route of this arrow, over the `route` of the diagram.
   * @fr Tracé de cette flèche, qui remplace le `route` du diagramme.
   */
  route?: 'curve' | 'orthogonal'
}

const props = defineProps<Props>()
const registry = inject(DIAGRAM, null)

onMounted(() => {
  if (!props.from || !props.to)
    return
  registry?.registerEdge({
    from: props.from,
    to: props.to,
    label: props.label,
    dashed: props.dashed,
    arrow: props.arrow,
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
