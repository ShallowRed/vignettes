<template>
  <div class="tailwind-app min-h-dvh bg-muted">
    <AppHeader />
    <UMain>
      <UContainer class="py-8">
        <slot />
      </UContainer>
    </UMain>
  </div>
</template>
