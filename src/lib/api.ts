const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const TOKEN_KEY = 'job_assistant_token';
const USER_KEY = 'job_assistant_user';

export interface CurrentUser {
  id: string;
  email: string;
  phone?: string;
  displayName: string;
  plan: 'free' | 'pro' | 'ultimate';
  createdAt: string;
}

export interface AuthResponse {
  success: true;
  user: CurrentUser;
  token: string;
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function getStoredUser(): CurrentUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: CurrentUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event('auth-change'));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event('auth-change'));
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success === false) {
    if (response.status === 401) {
      clearSession();
    }
    throw new Error(data?.error || `请求失败：${response.status}`);
  }

  return data as T;
}

export async function login(account: string, password: string): Promise<AuthResponse> {
  const data = await apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ account, password }),
  });
  setSession(data.token, data.user);
  return data;
}

export async function register(
  account: string,
  password: string,
  displayName: string | undefined,
  termsAccepted: boolean,
  smsCode?: string,
): Promise<AuthResponse> {
  const data = await apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      account,
      password,
      displayName,
      termsAccepted,
      agreementVersion: '2026-07-24',
      smsCode,
    }),
  });
  setSession(data.token, data.user);
  return data;
}

export async function sendSmsCode(phone: string) {
  return apiRequest<{ success: true; message: string }>('/auth/sms/send', {
    method: 'POST', body: JSON.stringify({ phone }),
  });
}

export async function getWechatLoginConfig(redirect = '/') {
  return apiRequest<{ success: true; enabled: boolean; startUrl: string | null }>(
    `/auth/wechat/config?redirect=${encodeURIComponent(redirect)}`,
  );
}

export async function getMe() {
  return apiRequest<{
    success: true;
    user: CurrentUser;
    usage: {
      resume_optimize_used: number;
      interview_review_used: number;
      period: string;
    };
    limits: {
      resumeOptimize: number;
      interviewReview: number;
      allowedModels: string[];
    };
  }>('/me');
}

export interface FetchedJobDescription {
  url: string;
  content: string;
  company: string;
  position: string;
  salary: string;
  location: string;
}

export async function fetchJobDescription(url: string) {
  const data = await apiRequest<{ success: true; job: FetchedJobDescription }>('/job-description/fetch', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
  return data.job;
}

export interface ManualOrderPayload {
  plan: 'pro' | 'ultimate';
  billingCycle: 'monthly' | 'yearly';
  contact?: string;
  remark?: string;
}

export async function createManualOrder(payload: ManualOrderPayload) {
  const data = await apiRequest<{
    success: true;
    order: {
      id: string;
      plan: 'pro' | 'ultimate';
      billing_cycle: 'monthly' | 'yearly';
      amount: number;
      currency: string;
      provider: string;
      status: 'pending' | 'approved' | 'rejected' | 'cancelled';
      contact: string;
      remark: string;
      created_at: string;
    };
  }>('/orders/manual', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.order;
}

export async function listOrders() {
  const data = await apiRequest<{ success: true; items: unknown[] }>('/orders');
  return data.items;
}

export type AdminDataType = 'users' | 'orders' | 'events' | 'optimizations';

export async function adminRequest<T>(path: string, adminToken: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('x-admin-token', adminToken);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success === false) {
    throw new Error(data?.error || `请求失败：${response.status}`);
  }
  return data as T;
}

export async function listAdminData(type: AdminDataType, adminToken: string, search = '', limit = 50) {
  const params = new URLSearchParams({ type, search, limit: String(limit) });
  const data = await adminRequest<{ success: true; type: AdminDataType; items: Record<string, unknown>[] }>(
    `/admin/data?${params.toString()}`,
    adminToken,
  );
  return data.items;
}

export async function updateAdminOrder(
  id: string,
  adminToken: string,
  status: 'pending' | 'approved' | 'rejected' | 'cancelled',
  adminNote = '',
) {
  const data = await adminRequest<{ success: true; order: Record<string, unknown> }>(`/admin/orders/${id}`, adminToken, {
    method: 'PATCH',
    body: JSON.stringify({ status, adminNote }),
  });
  return data.order;
}
