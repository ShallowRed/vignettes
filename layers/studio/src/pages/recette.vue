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
      { text: 'Catalogue : seule « Publique » apparaît.', to: '/' },
      { text: `« Mot de passe » demande « ${RECETTE_PASSWORD} » puis s'ouvre.`, to: '/slides/recette-mdp' },
      { text: '« Privée » renvoie à la connexion.', to: '/slides/recette-privee' },
      { text: '« Non listée » s\'ouvre par lien direct.', to: '/slides/recette-non-listee' },
      { text: '« Corbeille » est introuvable.', to: '/slides/recette-corbeille' },
    ],
  },
  {
    key: 'viewer',
    title: 'Lecteur sans accès',
    steps: [
      { text: 'Même catalogue que le visiteur.', to: '/' },
      { text: '« Privée » est refusée (accès interdit).', to: '/slides/recette-privee' },
      { text: 'Le dossier partagé se présente vide.', to: '/projects/recette-partage' },
    ],
  },
  {
    key: 'collab',
    title: 'Collaborateur',
    steps: [
      { text: 'Dossier partagé : « Publique », « Mot de passe », « Brouillon », chacune avec le crayon, et le bouton « Nouvelle présentation ».', to: '/projects/recette-partage' },
      { text: 'Éditeur de « Publique » : « Brouillon synchronisé » ; dans un second onglet, le texte tapé apparaît avec l\'initiale du pair.', to: '/edit/recette-public' },
      { text: 'Une image collée dans l\'éditeur s\'insère.', to: '/edit/recette-public' },
      { text: 'Après une modification, « Modifications non publiées » dans l\'en-tête et sur la carte ; « Publier » remet à jour.', to: '/edit/recette-public' },
      { text: '« Mot de passe » s\'ouvre sans mot de passe.', to: '/slides/recette-mdp' },
      { text: '« Lecture seule » s\'ouvre, sans crayon sur sa carte.', to: '/' },
      { text: '« Privée » est refusée ; aucune carte ne propose métadonnées ni partage.', to: '/slides/recette-privee' },
    ],
  },
  {
    key: 'expired',
    title: 'Accès expiré',
    steps: [
      { text: 'Comme le lecteur sans accès : « Publique » seule visible.', to: '/' },
      { text: 'L\'éditeur de « Publique » est refusé.', to: '/edit/recette-public' },
    ],
  },
  {
    key: 'editor',
    title: 'Éditeur global',
    steps: [
      { text: 'Tout le jeu de données, « Brouillon » compris, avec crayon et métadonnées.', to: '/' },
      { text: 'La corbeille contient « Corbeille », restaurable.', to: '/trash' },
      { text: 'La page des comptes est refusée ; les panneaux de partage sont en lecture seule.', to: '/users' },
    ],
  },
  {
    key: 'owner',
    title: 'Owner',
    steps: [
      { text: `Comptes : les cinq personas et l'invité « ${RECETTE_INVITED_HANDLE} ».`, to: '/users' },
      { text: 'Accès du dossier partagé : collaborateur (éditeur), accès expiré (expiré), invité (lecture). Modifier, ajouter par e-mail, retirer.', to: '/projects/recette-partage' },
    ],
  },
]

const breadcrumb = [
  { label: 'Accueil', to: '/' },
  { label: 'Recette' },
]
useHead({ title: 'Recette · Vignettes' })
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
      <span class="text-sm text-muted">jeu de données et comptes de test</span>
    </div>

    <UAlert
      v-if="statusCode === 404"
      icon="i-lucide-eye-off"
      color="neutral"
      variant="subtle"
      title="Kit de recette désactivé sur cet environnement"
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
        :description="`Laissez-passer de ${data.owner}, valable 12 heures.`"
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
          Deux dossiers, huit présentations (un par statut), cinq comptes, un invité. Préfixe <code>recette-</code> ;
          la réinitialisation ne touche rien d'autre.
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
                Le laissez-passer reste valable pour revenir ici.
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
