<script setup>
import { ref } from 'vue'
import { usePost } from '../../composables/usePost.js'
import { normalizeUsername } from '../../protocol/utils.js'
import NqDialog from '../common/NqDialog.vue'

const emit = defineEmits(['done', 'cancel'])
const { claimProfile } = usePost()
const username = ref('')
const displayName = ref('')
const step = ref(1)
const error = ref(null)

async function register() {
  error.value = null
  const uname = normalizeUsername(username.value.trim())
  if (!uname) {
    error.value = 'Choose a valid username (3–31 lowercase letters, digits, underscore).'
    return
  }
  step.value = 3
  try {
    await claimProfile(uname, displayName.value.trim() || '')
    emit('done')
  } catch (err) {
    error.value = err.message
    step.value = 2
  }
}
</script>

<template>
  <NqDialog
    :open="true"
    title="Claim your profile"
    description="One transaction publishes your username and display name on the post catalog."
    @close="emit('cancel')"
  >
    <div v-if="step < 3">
      <label for="onboarding-username" class="mb-1 block text-sm font-semibold">Username</label>
      <input
        id="onboarding-username"
        v-model="username"
        autocomplete="username"
        placeholder="username (required)"
        class="nf-focus nq-input mb-3 w-full text-sm"
      />
      <label for="onboarding-display-name" class="mb-1 block text-sm font-semibold">Display name</label>
      <input
        id="onboarding-display-name"
        v-model="displayName"
        autocomplete="name"
        placeholder="Display name (optional)"
        class="nf-focus nq-input mb-4 w-full text-sm"
      />
      <button
        class="nf-focus nq-button light-blue w-full"
        @click="register"
      >
        Claim on NimFeed
      </button>
      <p v-if="error" class="mt-2 text-sm nf-danger-text" role="alert">{{ error }}</p>
      <p class="mt-2 text-xs text-[var(--nf-subtle)]">Costs a small amount of Luna to sign.</p>
    </div>
    <div v-else class="py-4 text-center text-sm text-[var(--nf-muted)]" aria-live="polite">Signing profile claim…</div>
    <template #actions>
      <button type="button" class="nf-focus px-3 py-2 text-sm font-semibold text-[var(--nf-muted)]" style="min-height: 44px" @click="emit('cancel')">Cancel</button>
    </template>
  </NqDialog>
</template>
