import { apiRequest } from './api';

export interface CareerPhotoPayload {
  imageDataUrl: string;
  gender: 'male' | 'female';
  style: string;
  prompt: string;
}

export interface CareerPhotoResult {
  imageUrl: string;
  model: string;
  prompt: string;
  mode?: 'edit' | 'generation';
}

export async function generateCareerPhoto(payload: CareerPhotoPayload) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 180000);

  try {
    const data = await apiRequest<{ success: true; result: CareerPhotoResult }>('/career-assets/photo', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return data.result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('形象照生成超时，请稍后再试。图片任务有时需要 1-3 分钟');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
