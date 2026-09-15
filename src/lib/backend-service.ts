import { apiRequest } from './api';
import type { OptimizeMode } from '@/pages/resume-optimizer/page';

export interface ResumeOptimizationPayload {
  resumeContent: string;
  jobRequirements: string;
  optimizeMode: OptimizeMode;
  model: string;
  keywordMatch: boolean;
  jobTitle?: string;
  company?: string;
  resumePageImages?: string[];
}

export interface BackendOptimizationResult {
  id: string;
  originalContent: string;
  optimizedContent: string;
  highlightedContent?: string | null;
  keywords: string[];
  improvements: string[];
  matchScore: number;
  mode: OptimizeMode;
  model?: string;
  jobTitle?: string | null;
  company?: string | null;
  createdAt: string;
}

export async function createResumeOptimization(payload: ResumeOptimizationPayload) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 190000);

  try {
    const data = await apiRequest<{ success: true; result: BackendOptimizationResult }>('/resume-optimizations', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return data.result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('AI 优化等待超时，请稍后再试，或先选择单个简历模块优化');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function listResumeOptimizations() {
  const data = await apiRequest<{ success: true; items: Array<{
    id: string;
    job_title: string | null;
    company: string | null;
    job_requirements: string;
    resume_content: string;
    optimize_mode: OptimizeMode;
    model: string;
    optimized_content: string;
    highlighted_content: string | null;
    keywords: string[];
    improvements: string[];
    match_score: number;
    status: 'completed' | 'failed';
    created_at: string;
  }> }>('/resume-optimizations');
  return data.items;
}

export interface InterviewReviewPayload {
  company: string;
  position: string;
  industry: string;
  date: string;
  model: string;
  questions: { question: string; answer: string }[];
}

export async function createInterviewReview(payload: InterviewReviewPayload) {
  const data = await apiRequest<{ success: true; review: unknown }>('/interview-reviews', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.review;
}

export async function listInterviewReviews() {
  const data = await apiRequest<{ success: true; items: unknown[] }>('/interview-reviews');
  return data.items;
}
