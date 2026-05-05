import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', component: () => import('./components/feed/FeedView.vue') },
  { path: '/profile/:address', component: () => import('./components/profile/ProfileView.vue') },
  {
    path: '/thread/:address/:postId',
    name: 'thread',
    component: () => import('./components/post/PostThreadView.vue'),
  },
  { path: '/post', component: () => import('./components/post/PostComposer.vue') },
  { path: '/search', component: () => import('./components/search/UserSearch.vue') },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})
