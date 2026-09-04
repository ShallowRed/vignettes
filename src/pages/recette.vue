<script setup lang="ts">
import type { RecettePersona } from '#shared/recette/personas'
import { RECETTE_INVITED_HANDLE, RECETTE_PASSWORD } from '#shared/recette/personas'

/**
 * Staging acceptance kit (owner only, staging and dev): reset the `recette-*`
 * data set, open the app as a persona, follow the scenario checklists. The
 * server refuses everything outside staging/dev, so this page then reads 404.
 */
interface Status {
  owner: string
  current: { login: string | null, role: string }
  seeded: boolean
  personas: RecettePersona[]
}

const requestFetch = useRequestFetch()
const { data, error, refresh } = await useAsyncData('recette-status', () => requestFetch<Status>('/api/recette/status'))
const statusCode = computed(() => (error.value as any)?.statusCode as number | undefined)
const toast = useToast()

const seeding = ref(false)
async function seed() {
  seeding.value = true
  try {
    const summary = await $fetch<{ folders: number, decks: number, accounts: number }>('/api/recette/seed', { method: 'POST' })
    toast.add({ title: 'Jeu de données réinitialisé', description: `${summary.decks} présentations, ${summary.folders} dossiers, ${summary.accounts} comptes`, icon: 'i-lucide-check', color: 'success' })
    await refresh()
  }
  catch (e: any) {
    toast.add({ title: e?.statusMessage || 'Réinitialisation impossible', icon: 'i-lucide-triangle-alert', color: 'error' })
  }
  finally {
    seeding.value = false
  }
}

const personaLink = (key: string, redirect = '/') => `/auth/recette?as=${key}&redirect=${encodeURIComponent(redirect)}`

interface Step {
  text: string
  to?: string
}

/** What each account must observe. Links open the page to check. */
const SCENARIOS: { key: string, title: string, steps: Step[] }[] = [
  {
    key: 'anonymous',
    title: 'Visiteur non connecté',
    steps: [
      { text: 'Le catalogue montre « Recette · Publique » et rien d\'autre du jeu de données.', to: '/' },
      { text: `« Mot de passe » demande le mot de passe « ${RECETTE_PASSWORD} », puis s'ouvre.`, to: '/slides/recette-mdp' },
      { text: '« Privée » renvoie vers la page de connexion.', to: '/slides/recette-privee' },
      { text: '« Non listée » s\'ouvre par son lien direct.', to: '/slides/recette-non-listee' },
      { text: '« Corbeille » répond « introuvable ».', to: '/slides/recette-corbeille' },
    ],
  },
  {
    key: 'viewer',
    title: 'Lecteur sans accès',
    steps: [
      { text: 'Même catalogue que le visiteur ; le dossier partagé n\'apparaît pas.', to: '/' },
      { text: '« Privée » est refusée (accès interdit, pas une demande de connexion).', to: '/slides/recette-privee' },
      { text: 'Le dossier partagé ouvert par son lien se présente comme vide ou privé.', to: '/projects/recette-partage' },
    ],
  },
  {
    key: 'collab',
    title: 'Collaborateur',
    steps: [
      { text: 'Le dossier partagé liste « Publique », « Mot de passe » et « Brouillon », chacune avec le crayon.', to: '/projects/recette-partage' },
      { text: 'Le bouton « Nouvelle présentation » est présent dans ce dossier, et le choix de dossier se limite à celui-ci.', to: '/projects/recette-partage' },
      { text: 'L\'éditeur de « Publique » affiche « Temps réel ». Ouvrez-le dans un second onglet : le texte tapé apparaît des deux côtés, avec le nom du pair.', to: '/edit/recette-public' },
      { text: 'Coller ou déposer une image dans l\'éditeur l\'insère (upload autorisé par l\'accès au dossier).', to: '/edit/recette-public' },
      { text: '« Mot de passe » s\'ouvre sans demander le mot de passe.', to: '/slides/recette-mdp' },
      { text: '« Lecture seule » s\'ouvre, mais sa carte n\'a pas de crayon.', to: '/' },
      { text: '« Privée » est refusée.', to: '/slides/recette-privee' },
      { text: 'Aucune carte n\'offre la modification des métadonnées ni le partage.', to: '/' },
    ],
  },
  {
    key: 'expired',
    title: 'Accès expiré',
    steps: [
      { text: 'Se comporte comme le lecteur sans accès : dossier partagé invisible, « Publique » seule visible.', to: '/' },
      { text: 'L\'éditeur de « Publique » est refusé.', to: '/edit/recette-public' },
    ],
  },
  {
    key: 'editor',
    title: 'Éditeur global',
    steps: [
      { text: 'Tout le jeu de données est listé, « Brouillon » compris, avec crayon et métadonnées.', to: '/' },
      { text: 'La corbeille contient « Corbeille », restaurable.', to: '/trash' },
      { text: 'La page des comptes est refusée.', to: '/users' },
      { text: 'Les panneaux de partage sont en lecture seule.', to: '/projects/recette-partage' },
    ],
  },
  {
    key: 'owner',
    title: 'Owner',
    steps: [
      { text: `Les comptes listent les cinq personas et l'invité « ${RECETTE_INVITED_HANDLE} » (badge invité).`, to: '/users' },
      { text: 'L\'accès au dossier partagé montre le collaborateur (éditeur), l\'accès expiré (expiré) et l\'invité (lecture).', to: '/projects/recette-partage' },
      { text: 'Modifier un accès en ligne, en ajouter un à la volée par e-mail Google, le retirer.', to: '/projects/recette-partage' },
    ],
  },
]

const breadcrumb = [
  { label: 'Accueil', to: '/' },
  { label: 'Recette' },
]
useHead({ title: 'Recette · Nuxt Slides' })
</script>

<template>
  <div class="flex flex-col gap-6">
    <UBreadcrumb :items="breadcrumb" />

    <div class="flex items-center gap-3">
      <UIcon
        name="i-lucide-flask-conical"
        class="size-5 text-warning"
      />
      <h1 class="text-xl font-semibold text-highlighted">
        Recette
      </h1>
      <span class="text-sm text-muted">jeu de données et personas de test</span>
    </div>

    <UAlert
      v-if="statusCode === 404"
      icon="i-lucide-eye-off"
      color="neutral"
      variant="subtle"
      title="Le kit de recette n'est pas activé sur cet environnement"
      description="Il n'existe qu'en staging et en développement."
    />

    <UAlert
      v-else-if="statusCode === 403 || statusCode === 401"
      icon="i-lucide-lock"
      color="warning"
      variant="subtle"
      title="Connectez-vous avec un compte owner pour ouvrir le kit"
      :actions="[{ label: 'Se connecter', icon: 'i-lucide-log-in', to: '/login?redirect=/recette' }]"
    />

    <template v-else-if="data">
      <UAlert
        icon="i-lucide-user"
        color="neutral"
        variant="subtle"
        :title="`Connecté en tant que ${data.current.login ?? 'personne'} (${data.current.role})`"
        :description="`Kit ouvert par ${data.owner}. Le laissez-passer vaut 12 heures dans ce navigateur.`"
        :actions="data.current.login !== data.owner
          ? [{ label: 'Revenir à mon compte', icon: 'i-lucide-undo-2', to: personaLink('me', '/recette'), external: true }]
          : []"
      />

      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon
              name="i-lucide-database"
              class="size-4 text-muted"
            />
            <span class="font-medium">Jeu de données</span>
            <UBadge
              :color="data.seeded ? 'success' : 'neutral'"
              variant="subtle"
              :label="data.seeded ? 'en place' : 'absent'"
            />
            <div class="flex-1" />
            <UButton
              :label="data.seeded ? 'Réinitialiser' : 'Créer'"
              icon="i-lucide-refresh-cw"
              size="sm"
              :loading="seeding"
              @click="seed"
            />
          </div>
        </template>
        <p class="text-sm text-muted">
          Deux dossiers (« Dossier partagé », « Dossier privé »), huit présentations couvrant chaque statut
          (publique, mot de passe, brouillon, privée, non listée, archivée, lecture seule dans Divers, corbeille),
          cinq comptes et un invité. Tout porte le préfixe <code>recette-</code> ; la réinitialisation ne touche
          rien d'autre.
        </p>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon
              name="i-lucide-users"
              class="size-4 text-muted"
            />
            <span class="font-medium">Ouvrir l'application en tant que</span>
          </div>
        </template>
        <ul class="divide-y divide-default">
          <li
            v-for="persona in data.personas"
            :key="persona.key"
            class="flex items-start gap-4 py-3"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-highlighted">{{ persona.label }}</span>
                <UBadge
                  :label="persona.role"
                  color="neutral"
                  variant="outline"
                  size="sm"
                />
              </div>
              <p class="text-sm text-muted">
                {{ persona.summary }}
              </p>
            </div>
            <UButton
              label="Se connecter"
              icon="i-lucide-log-in"
              color="neutral"
              variant="subtle"
              size="sm"
              :to="personaLink(persona.key)"
              external
            />
          </li>
          <li class="flex items-start gap-4 py-3">
            <div class="flex-1 min-w-0">
              <span class="font-medium text-highlighted">Visiteur non connecté</span>
              <p class="text-sm text-muted">
                Se déconnecter ; le laissez-passer reste valable pour revenir ici.
              </p>
            </div>
            <UButton
              label="Se déconnecter"
              icon="i-lucide-log-out"
              color="neutral"
              variant="subtle"
              size="sm"
              to="/auth/logout"
              external
            />
          </li>
        </ul>
      </UCard>

      <UCard
        v-for="scenario in SCENARIOS"
        :key="scenario.key"
      >
        <template #header>
          <div class="flex items-center gap-3">
            <span class="font-medium">{{ scenario.title }}</span>
            <div class="flex-1" />
            <UButton
              v-if="scenario.key !== 'anonymous'"
              label="Se connecter"
              icon="i-lucide-log-in"
              color="neutral"
              variant="ghost"
              size="xs"
              :to="personaLink(scenario.key, scenario.steps[0]?.to ?? '/')"
              external
            />
          </div>
        </template>
        <ol class="flex flex-col gap-2 list-decimal pl-5 text-sm">
          <li
            v-for="(step, i) in scenario.steps"
            :key="i"
          >
            <span>{{ step.text }}</span>
            <ULink
              v-if="step.to"
              :to="step.to"
              class="ml-2 text-primary"
              target="_blank"
            >
              ouvrir
            </ULink>
          </li>
        </ol>
      </UCard>
    </template>
  </div>
</template>
