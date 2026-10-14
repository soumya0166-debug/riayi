import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import '@/styles/components.css';
import '@/styles/chat.css';
import '@/styles/landing.css';
import '@/styles/auth.css';
import '@/styles/settings.css';
import { AuthProvider } from '@/features/auth/AuthContext';
import { ChatProvider } from '@/features/chat/ChatContext';
import { siteConfig } from '@/config/site';

export const metadata: Metadata = {
  title: `${siteConfig.name} - ${siteConfig.tagline}`,
  description: siteConfig.description,
  keywords: ['AI', 'Artificial Intelligence', 'RIYAI', 'Personal Assistant', 'LLM', 'Reasoning'],
  authors: [{ name: 'RIYAI Team' }],
  metadataBase: new URL(siteConfig.url),
  openGraph: {
    title: `${siteConfig.name} - ${siteConfig.tagline}`,
    description: siteConfig.description,
    siteName: siteConfig.name,
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#090a0f',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <AuthProvider>
          <ChatProvider>{children}</ChatProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
