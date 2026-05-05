import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

/** GitHub project Pages URL is /<repo>/; derive from GITHUB_REPOSITORY in CI. */
function pagesBase() {
  if (process.env.GITHUB_ACTIONS !== 'true') return '/'
  const repo = process.env.GITHUB_REPOSITORY?.split('/')?.[1]
  return repo ? `/${repo}/` : '/'
}

export default defineConfig({
  base: pagesBase(),
  plugins: [vue(), tailwindcss()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
  },
})
