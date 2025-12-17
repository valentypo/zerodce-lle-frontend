import type { Metadata } from 'next';
import React from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Zero-DCE | Real-Time Low-Light Enhancement',
  description: 'Real-time AI-powered low-light image enhancement using WebSocket streaming',
  keywords: 'zero-dce, low-light, enhancement, ai, real-time, streaming',
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
