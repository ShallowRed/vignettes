<script setup lang="ts">
// `::pictogram-list` shows the pictograms the studio serves under
// `/pictograms`, each with the name a `Step` takes in `picto`.
const files = Object.keys(import.meta.glob('../../../../public/pictograms/**/*.svg'))

const names = files
  .map(file => file.replace(/^.*\/pictograms\//, '').replace(/\.svg$/, ''))
  .sort()
  .map(name => ({ name, folder: name.split('/')[0], file: name.split('/')[1] }))
</script>

<template>
  <ul class="pictogram-list">
    <li
      v-for="{ name, folder, file } in names"
      :key="name"
    >
      <img
        :src="`/pictograms/${name}.svg`"
        alt=""
        width="48"
        height="48"
        loading="lazy"
      >
      <code>{{ folder }}/<wbr>{{ file }}</code>
    </li>
  </ul>
</template>

<style scoped>
.pictogram-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
  gap: 1rem;
  margin-block: 1.5rem;
  padding: 0;
  list-style: none;
}

.pictogram-list li {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  font-size: 0.75rem;
  text-align: center;
}

/* The DSFR artwork is drawn for a light surface: in the dark mode of the
   site, each pictogram keeps a white tile. */
html.dark .pictogram-list img {
  box-sizing: content-box;
  padding: 0.5rem;
  border-radius: var(--ui-radius);
  background: #fff;
}

.pictogram-list code {
  overflow-wrap: break-word;
}
</style>
