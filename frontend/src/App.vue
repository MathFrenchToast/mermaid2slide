<script setup lang="ts">
import { ref, onMounted } from 'vue'

const file = ref<File | null>(null)
const isDragging = ref(false)
const isLoading = ref(false)
const errorMsg = ref<string | null>(null)
const turnstileToken = ref<string | null>(null)
const turnstileWidgetId = ref<string | null>(null)

const SITE_KEY = '1x00000000000000000000AA' // Testing site key for Turnstile

const onDragOver = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = true
}

const onDragLeave = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = false
}

const onDrop = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = false
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile.name.endsWith('.mermaid')) {
      file.value = droppedFile
      errorMsg.value = null
    } else {
      errorMsg.value = "Please upload a .mermaid file"
    }
  }
}

const onFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    file.value = target.files[0]
    errorMsg.value = null
  }
}

const renderTurnstile = () => {
  if (window.turnstile) {
    turnstileWidgetId.value = window.turnstile.render('#turnstile-container', {
      sitekey: SITE_KEY,
      callback: (token: string) => {
        turnstileToken.value = token
      },
      'error-callback': () => {
        errorMsg.value = "Captcha failed"
        turnstileToken.value = null
      }
    })
  } else {
    setTimeout(renderTurnstile, 100)
  }
}

onMounted(() => {
  renderTurnstile()
})

const onSubmit = async () => {
  if (!file.value) {
    errorMsg.value = "Please select a file"
    return
  }
  
  if (!turnstileToken.value) {
    errorMsg.value = "Please complete the captcha"
    return
  }

  isLoading.value = true
  errorMsg.value = null

  const formData = new FormData()
  formData.append('file', file.value)
  formData.append('cf-turnstile-response', turnstileToken.value)

  try {
    const response = await fetch('/api/convert', {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.error || "Conversion failed")
    }

    // Trigger download
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    
    // Attempt to extract filename from Content-Disposition header if possible
    const contentDisposition = response.headers.get('Content-Disposition')
    let filename = 'presentation.pptx'
    if (contentDisposition && contentDisposition.includes('filename=')) {
        const matches = /filename="([^"]*)"/.exec(contentDisposition)
        if (matches != null && matches[1]) {
            filename = matches[1]
        }
    } else {
       filename = file.value.name.replace('.mermaid', '.scene.pptx')
    }

    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
    
    // Reset form on success
    file.value = null
    turnstileToken.value = null
    if (window.turnstile && turnstileWidgetId.value) {
      window.turnstile.reset(turnstileWidgetId.value)
    }

  } catch (err: any) {
    errorMsg.value = err.message
  } finally {
    isLoading.value = false
  }
}

// Global declaration for window.turnstile
declare global {
  interface Window {
    turnstile: any
  }
}
</script>

<template>
  <div class="container">
    <h1>Mermaid to PPTX Converter</h1>
    <p>Upload your <code>.mermaid</code> file to convert it into an editable PowerPoint presentation.</p>

    <div 
      class="dropzone" 
      :class="{ 'is-dragging': isDragging }"
      @dragover="onDragOver" 
      @dragleave="onDragLeave" 
      @drop="onDrop"
    >
      <input 
        type="file" 
        id="file-upload" 
        accept=".mermaid" 
        @change="onFileChange" 
        style="display: none;" 
      />
      <label for="file-upload" class="dropzone-label">
        <span v-if="!file">Drag & Drop a .mermaid file here or click to browse</span>
        <span v-else>Selected: <strong>{{ file.name }}</strong></span>
      </label>
    </div>

    <div class="error" v-if="errorMsg">{{ errorMsg }}</div>

    <div class="captcha-wrapper">
      <div id="turnstile-container"></div>
    </div>

    <button :disabled="!file || !turnstileToken || isLoading" @click="onSubmit" class="submit-btn">
      <span v-if="isLoading">Converting...</span>
      <span v-else>Convert to PPTX</span>
    </button>
  </div>
</template>

<style scoped>
.container {
  max-width: 600px;
  margin: 0 auto;
  padding: 2rem;
  font-family: system-ui, -apple-system, sans-serif;
  text-align: center;
}

h1 {
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

p {
  color: #646c89;
  margin-bottom: 2rem;
}

.dropzone {
  border: 2px dashed #cbd5e1;
  border-radius: 8px;
  padding: 3rem 2rem;
  transition: all 0.2s ease;
  background-color: #f8fafc;
  cursor: pointer;
  margin-bottom: 1.5rem;
}

.dropzone.is-dragging {
  border-color: #3b82f6;
  background-color: #eff6ff;
}

.dropzone-label {
  cursor: pointer;
  color: #475569;
  font-size: 1.1rem;
}

.dropzone:hover {
  border-color: #94a3b8;
}

.captcha-wrapper {
  margin: 1.5rem 0;
  display: flex;
  justify-content: center;
  min-height: 65px; /* Prevent layout shift */
}

.submit-btn {
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 0.75rem 1.5rem;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
  width: 100%;
}

.submit-btn:hover:not(:disabled) {
  background-color: #2563eb;
}

.submit-btn:disabled {
  background-color: #94a3b8;
  cursor: not-allowed;
  opacity: 0.7;
}

.error {
  color: #ef4444;
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  padding: 0.75rem;
  border-radius: 6px;
  margin-bottom: 1.5rem;
}
</style>
