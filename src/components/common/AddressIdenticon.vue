<script setup>
import { onMounted, ref, watch } from 'vue'
import Identicons from '@nimiq/identicons'
import identiconsSvgUrl from '@nimiq/identicons/dist/identicons.min.svg?url'

const identiconsWithSvgPath = Identicons
identiconsWithSvgPath.svgPath = identiconsSvgUrl

const props = defineProps({
  address: { type: String, required: false, default: '' },
  imgClass: { type: String, required: false, default: 'h-10 w-10' },
})

const imageUrl = ref(Identicons.placeholderToDataUrl('#d7deeb', 1))

async function render() {
  if (!props.address) {
    imageUrl.value = Identicons.placeholderToDataUrl('#d7deeb', 1)
    return
  }
  try {
    imageUrl.value = await Identicons.toDataUrl(props.address)
  } catch {
    imageUrl.value = Identicons.placeholderToDataUrl('#d7deeb', 1)
  }
}

onMounted(render)
watch(() => props.address, render)
</script>

<template>
  <img :class="[imgClass, 'rounded-full']" :src="imageUrl" alt="" />
</template>
