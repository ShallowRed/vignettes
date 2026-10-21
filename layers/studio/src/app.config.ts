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
    // A long tooltip wraps inside the window, a phone's included.
    tooltip: {
      slots: {
        content: 'h-auto max-w-[min(24rem,calc(100vw-2rem))]',
        text: 'whitespace-normal',
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
