// Ghost buttons sit on a bg-elevated rail, whose default ghost hover (also
// bg-elevated) is invisible; bump the hover a step to bg-accented so every
// control gives clear feedback. tailwind-merge lets this win over the variant.
// The popovers of the toolbar keep the same hover.
export const btnHover = 'hover:bg-accented'

// The active choice of a segmented row on the same rail takes the surface of
// the page, with an outline, while it is hovered and pressed too.
export const btnActive = 'bg-default text-highlighted shadow-xs ring ring-default hover:bg-default active:bg-default'

// The width of the menus of the toolbar, inside a phone screen.
export const menuWidth = 'w-88 max-w-[calc(100vw-1rem)]'
