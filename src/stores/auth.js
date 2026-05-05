import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getUser } from '../db/queries.js'
import { canonicalNqAddress } from '../protocol/address.js'

const LS_KEY = 'nimfeed_address'

export const useAuthStore = defineStore('auth', () => {
  const address = ref(localStorage.getItem(LS_KEY) ?? null)
  const displayName = ref(null)
  const username = ref(null)
  const hasClaimed = ref(false)

  const isLoggedIn = computed(() => !!address.value)
  /** @deprecated use hasClaimed */
  const registered = computed(() => hasClaimed.value)

  function setAddress(addr) {
    const next = addr ? canonicalNqAddress(addr) : null
    address.value = next
    if (next) localStorage.setItem(LS_KEY, next)
    else localStorage.removeItem(LS_KEY)
  }

  async function loadProfile() {
    if (!address.value) return
    const user = await getUser(canonicalNqAddress(address.value))
    if (user) {
      displayName.value = user.display_name
      username.value = user.username
      hasClaimed.value = !!user.username
    } else {
      displayName.value = null
      username.value = null
      hasClaimed.value = false
    }
  }

  function logout() {
    setAddress(null)
    displayName.value = null
    username.value = null
    hasClaimed.value = false
  }

  /** @deprecated */
  function setUser({ addr, display_name, uname, reg }) {
    setAddress(addr)
    displayName.value = display_name ?? null
    username.value = uname ?? null
    hasClaimed.value = !!reg || !!uname
  }

  /** @deprecated */
  function clearUser() {
    logout()
  }

  return {
    address,
    displayName,
    username,
    hasClaimed,
    registered,
    isLoggedIn,
    setAddress,
    loadProfile,
    logout,
    setUser,
    clearUser,
  }
})
