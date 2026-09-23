<template>
  <div>
    <slot />
  </div>
</template>

<!-- No Tailwind CSS - Reveal.js has its own styling -->

<style>
.presentation-page {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* In Reveal's print view the deck is as tall as all its pages, so the frame
   follows its height and the pages start at the top of the document. */
html.reveal-print .presentation-page {
  display: block;
  width: auto;
  height: auto;
  overflow: visible;
}
</style>
