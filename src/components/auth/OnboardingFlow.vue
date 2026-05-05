<script setup>
import { ref } from 'vue'
import { usePost } from '../../composables/usePost.js'
import { normalizeUsername } from '../../protocol/utils.js'

const emit = defineEmits(['done'])
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
  <div>
    <div v-if="step < 3">
      <h3 class="font-semibold mb-4">Claim your profile</h3>
      <p class="text-gray-500 text-xs mb-3">One transaction publishes your username and display name on the post catalog.</p>
      <input
        v-model="username"
        placeholder="username (required)"
        class="w-full border rounded-lg px-3 py-2 mb-3 text-sm"
      />
      <input
        v-model="displayName"
        placeholder="Display name (optional)"
        class="w-full border rounded-lg px-3 py-2 mb-4 text-sm"
      />
      <button
        class="w-full py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700"
        @click="register"
      >
        Claim on NimFeed
      </button>
      <p v-if="error" class="mt-2 text-red-500 text-sm">{{ error }}</p>
      <p class="mt-2 text-gray-400 text-xs">Costs a small amount of Luna to sign.</p>
    </div>
    <div v-else class="text-center py-4 text-gray-500">Signing profile claim…</div>
  </div>
</template>
