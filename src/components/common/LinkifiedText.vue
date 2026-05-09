<script setup>
import { computed } from 'vue'
import { segmentsForLinkifiedText } from '../../utils/linkifyText.js'

const props = defineProps({
  text: { type: String, default: '' },
})

const segments = computed(() => segmentsForLinkifiedText(props.text))
</script>

<template>
  <span>
    <template v-for="(seg, i) in segments" :key="i">
      <a
        v-if="seg.type === 'link'"
        :href="seg.href"
        target="_blank"
        rel="noopener noreferrer"
        class="break-all font-medium text-[var(--nf-primary)] underline decoration-[var(--nf-primary)]/40 underline-offset-[3px] hover:decoration-[var(--nf-primary)]"
        @click.stop
      >
        {{ seg.label }}
      </a>
      <template v-else>{{ seg.value }}</template>
    </template>
  </span>
</template>
