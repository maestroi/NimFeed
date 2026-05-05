import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useFeedStore = defineStore('feed', () => {
  const posts = ref([])
  const loading = ref(false)
  const hasMore = ref(true)

  function setPosts(newPosts) {
    posts.value = newPosts
  }
  function appendPosts(more) {
    posts.value = [...posts.value, ...more].slice(0, 50)
  }
  function updatePost(author, post_id, fields) {
    const idx = posts.value.findIndex((p) => p.author === author && p.post_id === post_id)
    if (idx !== -1) posts.value[idx] = { ...posts.value[idx], ...fields }
  }
  function clear() {
    posts.value = []
    hasMore.value = true
  }
  function setLoading(v) {
    loading.value = v
  }
  function setHasMore(v) {
    hasMore.value = v
  }

  return {
    posts,
    loading,
    hasMore,
    setPosts,
    appendPosts,
    updatePost,
    clear,
    setLoading,
    setHasMore,
  }
})
