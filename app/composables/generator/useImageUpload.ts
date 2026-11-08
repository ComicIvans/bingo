import { useGenerator } from '~/composables/generator/useGenerator'
import { pickFile } from '~/utils/generator/files'
import { IMAGE_ACCEPT } from '~/utils/generator/images'

/**
 * Asks for an image file and adds it to the design, with a toast either way.
 * Shared by the image library and every image picker.
 */
export function useImageUpload() {
  const { images } = useGenerator()
  const toast = useToast()
  const uploading = ref(false)

  /** Id of the new image, or null when cancelled or rejected. */
  async function upload(successDescription: string): Promise<string | null> {
    const file = await pickFile(IMAGE_ACCEPT)
    if (!file) return null
    uploading.value = true
    try {
      const id = await images.add(file)
      toast.add({
        title: 'Imagen añadida',
        description: successDescription,
        color: 'success',
        icon: 'i-lucide-image-plus',
      })
      return id
    } catch (e) {
      toast.add({
        title: 'No se pudo añadir la imagen',
        description: e instanceof Error ? e.message : undefined,
        color: 'error',
        icon: 'i-lucide-circle-x',
      })
      return null
    } finally {
      uploading.value = false
    }
  }

  return { upload, uploading }
}
