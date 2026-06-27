import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '현장관리 (Site Management)',
  description: '프리미엄 건설 현장 비용 및 작업일보 관리 시스템',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#556b2f" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="현장관리" />
      </head>
      <body className="bg-background text-on-background font-body-md overflow-x-hidden pb-24">
        {children}
      </body>
    </html>
  )
}
