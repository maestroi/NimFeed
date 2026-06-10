import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router.js'
import { db } from './db/schema.js'
import './style.css'

function showBootError(title, detail) {
  const root = document.getElementById('app')
  if (!root) return
  root.innerHTML = `
    <div style="max-width: 32rem; margin: 2rem auto; padding: 0 1rem; font-family: Muli, sans-serif; color: #1f2348;">
      <h1 style="font-size: 1.25rem; margin: 0 0 0.75rem;">${title}</h1>
      <p style="margin: 0 0 1rem; line-height: 1.5; color: #5d6287;">
        Try a hard refresh first. If the page stays blank, clear site data for this origin
        (Application → Storage → Clear site data) and reload.
      </p>
      <pre style="overflow: auto; padding: 0.75rem; border-radius: 0.5rem; background: #f5f8ff; font-size: 0.8rem;">${detail}</pre>
    </div>`
}

async function bootstrap() {
  try {
    await db.open()
  } catch (err) {
    console.error('[NimFeed] IndexedDB failed to open', err)
    showBootError('NimFeed could not open local storage', err?.message ?? String(err))
    return
  }

  createApp(App).use(createPinia()).use(router).mount('#app')
}

bootstrap()
