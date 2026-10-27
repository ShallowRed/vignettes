<script setup lang="ts">
// One command of the deck controls bar: an icon, or an icon and a label for the
// command the bar puts forward, with a tooltip naming the command and its key.
// `pressed` stays undefined on a command that is no toggle, so the button has no `aria-pressed`.
withDefaults(defineProps<{
  label: string
  shortcut?: string
  /** A link instead of a button. */
  to?: string
  /** Shows the label beside the icon. */
  primary?: boolean
  /** Draws a dot on the icon, for a state worth noticing. */
  badge?: boolean
  /** A command that turns a setting on and off, shown pressed while it is on. */
  pressed?: boolean
  /** The text of the tooltip when it says more than the label, such as the state of a toggle. */
  tip?: string
}>(), { pressed: undefined })

defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <component
    :is="to ? 'a' : 'button'"
    :href="to"
    :type="to ? undefined : 'button'"
    class="deck-control"
    :class="{ 'deck-control--primary': primary, 'deck-control--pressed': pressed }"
    :aria-label="label"
    :aria-pressed="pressed"
    @click="$emit('click', $event)"
  >
    <slot />
    <span
      v-if="primary"
      class="deck-control__label"
    >{{ label }}</span>
    <span
      v-if="badge"
      class="deck-control__badge"
    />
    <span
      class="deck-control__tip"
      role="tooltip"
    >{{ tip ?? label }}<kbd v-if="shortcut">{{ shortcut }}</kbd></span>
  </component>
</template>

<style scoped>
.deck-control {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 36px;
  height: 36px;
  padding: 0 8px;
  font: 600 14px/1 system-ui, sans-serif;
  color: #fff;
  text-decoration: none;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 7px;
}

.deck-control:hover,
.deck-control:focus-visible {
  color: #fff;
  text-decoration: none;
  background: rgba(255, 255, 255, 0.14);
  outline: none;
}

.deck-control :deep(svg),
.deck-control :deep(.iconify) {
  width: 18px;
  height: 18px;
  flex: none;
}

.deck-control--pressed {
  color: #8fb8ff;
  background: rgba(255, 255, 255, 0.14);
}

.deck-control--pressed:hover,
.deck-control--pressed:focus-visible {
  color: #8fb8ff;
  background: rgba(255, 255, 255, 0.24);
}

.deck-control--primary {
  padding: 0 12px 0 10px;
  color: #16161a;
  background: #fff;
}

.deck-control--primary:hover,
.deck-control--primary:focus-visible {
  color: #16161a;
  background: #e8e8ec;
}

.deck-control__badge {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 7px;
  height: 7px;
  background: #f5a524;
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(22, 22, 26, 0.86);
}

.deck-control__tip {
  position: absolute;
  top: calc(100% + 10px);
  left: 50%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 9px;
  font-size: 13px;
  font-weight: 500;
  width: max-content;
  max-width: min(240px, calc(100vw - 32px));
  white-space: normal;
  color: #fff;
  pointer-events: none;
  background: #16161a;
  border-radius: 6px;
  opacity: 0;
  transform: translateX(-50%);
  transition: opacity 120ms ease;
}

.deck-control:hover .deck-control__tip,
.deck-control:focus-visible .deck-control__tip {
  opacity: 1;
  transition-delay: 300ms;
}

.deck-control__tip kbd {
  padding: 1px 5px;
  font: 600 11px system-ui, sans-serif;
  background: rgba(255, 255, 255, 0.16);
  border-radius: 4px;
}
</style>
