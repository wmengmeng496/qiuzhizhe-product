import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const body = await request.json();
  return Response.json({
    optimizedContent: body.resumeContent || '',
    keywords: ['Supabase', 'AI Proxy'],
    improvements: ['已通过边缘函数代理请求'],
    matchScore: 80
  });
});
