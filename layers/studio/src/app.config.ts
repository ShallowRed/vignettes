export default defineAppConfig({
  ui: {
    colors: {
      primary: 'blue',
      neutral: 'neutral',
    },
    // At Nuxt UI's 75 %, a disabled button reads as active in dark mode.
    button: {
      slots: {
        base: 'disabled:opacity-50 aria-disabled:opacity-50',
      },
    },
    radioGroup: {
      variants: {
        variant: {
          card: { item: 'cursor-pointer transition-colors hover:bg-elevated/50' },
        },
      },
    },
  },
})
