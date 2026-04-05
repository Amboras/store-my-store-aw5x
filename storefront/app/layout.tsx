import './globals.css'
import type { Metadata } from 'next'
import { Cormorant_Garamond, DM_Sans } from 'next/font/google'
import { Providers } from './providers'
import Header from '@/components/layout/header'
import Footer from '@/components/layout/footer'
import AnnouncementBar from '@/components/layout/announcement-bar'
import { AnalyticsProvider } from '@/components/analytics-provider'
import CookieConsent from '@/components/cookie-consent'
import { Toaster } from 'sonner'
import { ElementPickerListener } from '@/components/element-picker-listener'
import { NavigationTracker } from '@/components/navigation-tracker'
import { Suspense } from 'react'

const heading = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-heading',
  display: 'swap',
})

const body = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Store — Modern Commerce',
    template: '%s | Store',
  },
  description: 'Discover curated products crafted with care. A modern ecommerce experience.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`} suppressHydrationWarning>
      <body>
        <Providers>
          <ElementPickerListener />
          <Suspense fallback={null}>
            <NavigationTracker />
          </Suspense>
          <AnnouncementBar />
          <Header />
          <main className="min-h-screen">
            <AnalyticsProvider>
              {children}
            </AnalyticsProvider>
          </main>
          <Footer />
          <CookieConsent />
          <Toaster position="bottom-right" richColors />
        </Providers>
      </body>
    </html>
  )
}
