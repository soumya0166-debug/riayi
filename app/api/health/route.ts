import { NextResponse } from 'next/server';
import { geminiProvider } from '@/services/ai/providers/geminiProvider';

export async function GET() {
  const isConfigured = geminiProvider.isConfigured();

  return NextResponse.json({
    status: isConfigured ? 'healthy' : 'degraded',
    platform: 'RIYAI',
    description: 'Centralized Google Gemini AI service active.',
    provider: {
      id: geminiProvider.id,
      name: geminiProvider.name,
      configured: isConfigured,
      model: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
    },
    timestamp: new Date().toISOString(),
  });
}
