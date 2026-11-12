<template>
  <div class="pprev-overlay" @click.self="emit('close')">
    <div class="pprev-panel" role="dialog" aria-modal="true" aria-label="球员照片预览">
      <header class="pprev-hd">
        <div class="pprev-titles">
          <h3>球员照片</h3>
          <p class="pprev-sub">{{ title || '' }}</p>
        </div>
        <button class="pprev-x" type="button" aria-label="关闭" @click="emit('close')">×</button>
      </header>

      <div class="pprev-stage">
        <img :src="src" alt="" />
      </div>

      <footer class="pprev-ft">
        <span class="pprev-tip">修改后会重新裁切，播出构图与照片一致。</span>
        <span class="spacer"></span>
        <button class="btn ghost sm" type="button" @click="emit('close')">关闭</button>
        <label class="btn primary sm">
          修改照片
          <input type="file" accept="image/*" style="display: none" @change="onPick" />
        </label>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';

defineProps<{ src: string; title?: string }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'pick', file: File): void }>();

function onPick(e: Event): void {
  const input = e.target as HTMLInputElement;
  const file = input.files && input.files[0];
  input.value = '';
  if (file) emit('pick', file);
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<style>
.pprev-overlay{position:fixed;inset:0;z-index:120;background:rgba(4,8,6,.72);backdrop-filter:blur(4px);
  display:grid;place-items:center;padding:20px}
.pprev-panel{width:min(440px,100%);max-height:calc(100vh - 40px);display:flex;flex-direction:column;
  background:var(--panel);border:1px solid var(--line);border-radius:16px;
  box-shadow:0 24px 60px rgba(0,0,0,.6);padding:16px 18px 14px}
.pprev-hd{display:flex;align-items:flex-start;gap:12px;margin-bottom:12px}
.pprev-titles{min-width:0}
.pprev-titles h3{font-size:16px;margin:0}
.pprev-sub{margin:3px 0 0;font-size:12px;color:var(--text-dim);line-height:1.45}
.pprev-x{margin-left:auto;width:30px;height:30px;flex:none;border-radius:8px;border:1px solid transparent;
  background:transparent;color:var(--text-mute);font-size:16px;line-height:1;cursor:pointer}
.pprev-x:hover{color:var(--text);border-color:var(--line)}
.pprev-stage{flex:1;min-height:0;display:grid;place-items:center;background:#08100c;
  border-radius:12px;overflow:hidden}
.pprev-stage img{max-width:100%;max-height:66vh;display:block;object-fit:contain}
.pprev-ft{display:flex;align-items:center;gap:8px;margin-top:14px}
.pprev-tip{font-size:11px;color:var(--text-mute);line-height:1.4}
.pprev-ft .spacer{flex:1}
</style>
