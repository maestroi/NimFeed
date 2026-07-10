<script setup>
import { computed, ref, watch } from 'vue'
import { useUiStore } from '../../stores/ui.js'
import { useAuthStore } from '../../stores/auth.js'
import { useDonate } from '../../composables/useDonate.js'
import { rpc } from '../../chain/rpc.js'
import { LUNA_PER_NIM } from '../../protocol/constants.js'
import AddressIdenticon from '../common/AddressIdenticon.vue'
import NqDialog from '../common/NqDialog.vue'

const PRESET_AMOUNTS = [100, 1000, 10000, 50000]

const ui = useUiStore()
const auth = useAuthStore()

const selectedPreset = ref(null)
const customAmount = ref('')
const pending = ref(false)
const error = ref(null)
const balanceNim = ref(null)

const target = computed(() => ui.tipTarget)

const amount = computed(() => {
  if (customAmount.value !== '') return Number(customAmount.value)
  return selectedPreset.value
})

const insufficientBalance = computed(
  () => balanceNim.value != null && !!amount.value && amount.value > balanceNim.value,
)

watch(target, async (value) => {
  if (value) {
    selectedPreset.value = PRESET_AMOUNTS[0]
    customAmount.value = ''
    error.value = null
    balanceNim.value = null
    if (auth.address) {
      try {
        const account = await rpc.getAccountByAddress(auth.address)
        if (account?.balance != null) balanceNim.value = account.balance / LUNA_PER_NIM
      } catch {
        // balance display is best-effort
      }
    }
  }
})

function pickPreset(value) {
  selectedPreset.value = value
  customAmount.value = ''
}

function close() {
  ui.tipTarget = null
}

async function send() {
  if (!target.value || !amount.value || pending.value) return
  pending.value = true
  error.value = null
  try {
    await useDonate(target.value.address).tip(amount.value)
    close()
  } catch (e) {
    error.value = e?.message || 'Failed to send tip'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <NqDialog :open="!!target" title="Send a tip" @close="close">
    <template #default>
      <template v-if="target">
      <div class="flex items-center gap-3 mb-2">
        <AddressIdenticon :address="target.address" img-class="h-10 w-10" />
        <p class="nf-mono break-all text-xs text-[var(--nf-muted)]">
          {{ target.label || target.address }}
        </p>
      </div>

      <p class="mb-4 text-xs text-[var(--nf-muted)]">
        Your balance: {{ balanceNim != null ? `${balanceNim.toLocaleString()} NIM` : '…' }}
      </p>

      <div class="mb-4 grid grid-cols-4 gap-2" role="group" aria-label="Tip amount">
        <button
          v-for="preset in PRESET_AMOUNTS"
          :key="preset"
          type="button"
          :aria-pressed="customAmount === '' && selectedPreset === preset"
          :class="[
            'nf-focus nf-press rounded-lg border px-2 py-2 text-xs font-semibold',
            customAmount === '' && selectedPreset === preset
              ? 'border-[var(--nf-primary)] nq-blue-bg text-white'
              : 'border-[var(--nf-border)] text-[var(--nf-text)] hover:bg-[var(--nf-soft)]',
          ]"
          @click="pickPreset(preset)"
        >
          {{ preset.toLocaleString() }}
        </button>
      </div>

      <label class="block text-[11px] font-semibold text-[var(--nf-muted)] mb-1">Custom amount (NIM)</label>
      <input
        v-model="customAmount"
        type="number"
        min="0"
        step="any"
        placeholder="Custom amount"
        class="nf-focus nf-input mb-4 w-full rounded-lg px-3 py-2 text-sm"
      />

      <button
        type="button"
        class="nf-focus nq-button light-blue w-full"
        :disabled="!amount || pending || insufficientBalance"
        @click="send"
      >
        {{ pending ? 'Sending…' : `Send ${amount ? amount.toLocaleString() : ''} NIM`.trim() }}
      </button>

      <div aria-live="polite">
        <p v-if="insufficientBalance" class="mt-3 text-sm nf-danger-text" role="alert">Insufficient balance.</p>
        <p v-else-if="error" class="mt-3 text-sm nf-danger-text" role="alert">{{ error }}</p>
        <p v-else-if="pending" class="mt-3 text-sm text-[var(--nf-muted)]">Sending tip…</p>
      </div>

      </template>
    </template>
    <template #actions>
      <button type="button" class="nf-focus px-3 py-2 text-sm font-semibold text-[var(--nf-muted)]" @click="close">
        Cancel
      </button>
    </template>
  </NqDialog>
</template>
