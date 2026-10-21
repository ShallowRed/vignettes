import { computed, ref, watch } from 'vue'

/**
 * The slug field of a creation modal: the slug follows the title until the
 * person types one of their own. Bind `slug` to the field. `fill` derives the
 * slug from the title, and from then on the slug follows the title again: the
 * wand of the field calls it, and so does the modal when it opens
 * (`onReset` of `useFormModal`). An emptied field follows the title again too.
 */
export function useDerivedSlug(state: { slug: string }, title: () => string, derive: (title: string) => string) {
  const edited = ref(false)

  watch(title, (value) => {
    if (!edited.value)
      state.slug = derive(value)
  })

  const slug = computed({
    get: () => state.slug,
    set: (value: string) => {
      state.slug = value
      edited.value = value !== '' && value !== derive(title())
    },
  })

  function fill() {
    state.slug = derive(title())
    edited.value = false
  }

  // A modal mounted already open gets no reset: its slug starts derived here.
  fill()

  return { slug, fill }
}
