export default defineAppConfig({
  ui: {
    colors: {
      primary: 'blue',
      neutral: 'neutral',
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
