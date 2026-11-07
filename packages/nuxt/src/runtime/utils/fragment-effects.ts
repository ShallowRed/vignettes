/**
 * The classes a `:::Fragments` adds to each item besides `fragment`: the
 * Reveal effects its `effect` names, separated by spaces. `fade-in` is the
 * effect of a plain `fragment`.
 */
export function fragmentEffects(effect: string): string[] {
  return effect.split(/\s+/).filter(name => name && name !== 'fade-in')
}
