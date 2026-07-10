<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

let dialogSequence = 0
const instanceId = ++dialogSequence

const props = defineProps({
  open: { type: Boolean, required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  panelClass: { type: String, default: '' },
  closeOnBackdrop: { type: Boolean, default: true },
})

const emit = defineEmits(['close'])
const panel = ref(null)
const previouslyFocusedElement = ref(null)
const titleId = `nq-dialog-title-${instanceId}`
const descriptionId = `nq-dialog-description-${instanceId}`
let previousBodyOverflow = ''
let bodyScrollLocked = false

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableElements() {
  return [...(panel.value?.querySelectorAll(focusableSelector) ?? [])].filter(
    (element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true',
  )
}

function emitClose() {
  emit('close')
}

function closeFromBackdrop() {
  if (props.closeOnBackdrop) emitClose()
}

function trapFocus(event) {
  const elements = focusableElements()
  if (!elements.length) {
    event.preventDefault()
    panel.value?.focus()
    return
  }

  const first = elements[0]
  const last = elements[elements.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previouslyFocusedElement.value = document.activeElement
      previousBodyOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      bodyScrollLocked = true
      await nextTick()
      focusableElements()[0]?.focus() ?? panel.value?.focus()
      return
    }

    if (!bodyScrollLocked) return
    document.body.style.overflow = previousBodyOverflow
    bodyScrollLocked = false
    await nextTick()
    previouslyFocusedElement.value?.focus()
    previouslyFocusedElement.value = null
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (bodyScrollLocked) document.body.style.overflow = previousBodyOverflow
  previouslyFocusedElement.value?.focus()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="nq-dialog">
      <div
        v-if="open"
        class="nq-dialog-backdrop"
        @click.self="closeFromBackdrop"
        @keydown.esc="emitClose"
      >
        <section
          ref="panel"
          class="nq-dialog-panel nf-card"
          :class="panelClass"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="description ? descriptionId : undefined"
          tabindex="-1"
          @keydown.tab="trapFocus"
        >
          <header class="nq-dialog-header">
            <div>
              <h2 :id="titleId" class="nq-h2">{{ title }}</h2>
              <p v-if="description" :id="descriptionId" class="nq-dialog-description">
                {{ description }}
              </p>
            </div>
            <button class="nq-dialog-close nf-focus" type="button" aria-label="Close" @click="emitClose">
              &#215;
            </button>
          </header>

          <div class="nq-dialog-content">
            <slot />
          </div>

          <footer v-if="$slots.actions" class="nq-dialog-actions">
            <slot name="actions" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.nq-dialog-backdrop {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  background: rgb(15 25 65 / 58%);
}

.nq-dialog-panel {
  width: 100%;
  max-width: 360px;
  max-height: calc(100dvh - 32px);
  overflow: auto;
  padding: 24px;
  color: var(--nimiq-blue);
}

.nq-dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.nq-dialog-header h2,
.nq-dialog-description {
  margin: 0;
}

.nq-dialog-description {
  margin-top: 8px;
  color: var(--nf-muted);
}

.nq-dialog-close {
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  color: currentColor;
  background: transparent;
  font: inherit;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
}

.nq-dialog-close:hover {
  background: var(--nf-soft);
}

.nq-dialog-content {
  margin-top: 20px;
}

.nq-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.nq-dialog-enter-active,
.nq-dialog-leave-active {
  transition: opacity 0.2s var(--nimiq-ease);
}

.nq-dialog-enter-from,
.nq-dialog-leave-to {
  opacity: 0;
}
</style>
