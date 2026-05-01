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
    <html lang="ko" className="dark">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-background text-on-background font-body-md overflow-x-hidden pb-24">
        {children}
      </body>
    </html>
  )
}
