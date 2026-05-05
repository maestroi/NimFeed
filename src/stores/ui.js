import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
  const loginModalOpen = ref(false)
  const composerOpen = ref(false)
  /** @type {import('vue').Ref<{ author: string, post_id: string } | null>} */
  const composerReplyTo = ref(null)
  const filterNoClaim = ref(true)
  const filterMinAgBlocks = ref(10)
  const activeTab = ref('global')

  return {
    loginModalOpen,
    composerOpen,
    composerReplyTo,
    filterNoClaim,
    filterMinAgBlocks,
    activeTab,
  }
})
