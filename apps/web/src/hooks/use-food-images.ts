import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { compressImage } from '@/lib/image-compress'
import { queryKeys } from '@/hooks/use-diary'
import type { FoodImage } from '@/lib/types'

export const foodImageKeys = {
  list: (foodId: string) => ['foods', foodId, 'images'] as const,
}

export interface FoodImagesResponse {
  items: FoodImage[]
  /** False when no R2 bucket is configured, which hides the camera button. */
  uploadEnabled: boolean
}

export function useFoodImages(foodId: string | null | undefined) {
  return useQuery({
    queryKey: foodImageKeys.list(foodId ?? ''),
    queryFn: () => api<FoodImagesResponse>(`/foods/${foodId}/images`),
    enabled: Boolean(foodId),
  })
}

interface UploadTicket {
  key: string
  uploadUrl: string
  expiresIn: number
  headers: Record<string, string>
}

/**
 * Compress, upload, register — in that order.
 *
 * The file goes to R2 directly with the presigned PUT the API hands out, so a
 * 3 MB camera shot never travels through the VPS. What we do send is the
 * re-encoded version: a few hundred KB, EXIF stripped by the canvas round-trip.
 */
export function useUploadFoodImage(foodId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (file: File): Promise<FoodImage> => {
      const image = await compressImage(file)

      const ticket = await api<UploadTicket>(`/foods/${foodId}/images/upload-url`, {
        method: 'POST',
        body: { contentType: image.contentType, bytes: image.blob.size },
      })

      const put = await fetch(ticket.uploadUrl, {
        method: 'PUT',
        headers: ticket.headers,
        body: image.blob,
      })
      if (!put.ok) throw new Error('upload_failed')

      return api<FoodImage>(`/foods/${foodId}/images`, {
        method: 'POST',
        body: {
          key: ticket.key,
          width: image.width,
          height: image.height,
        },
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: foodImageKeys.list(foodId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.food(foodId) })
    },
  })
}

export function useDeleteFoodImage(foodId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (imageId: string) =>
      api(`/foods/${foodId}/images/${imageId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: foodImageKeys.list(foodId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.food(foodId) })
    },
  })
}
