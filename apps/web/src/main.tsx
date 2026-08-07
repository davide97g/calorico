import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/hooks/use-auth'
import { initPwa } from '@/lib/pwa'
import { initSentry } from '@/lib/sentry'
import { lockZoom } from '@/lib/zoom'
import App from './App'
import './index.css'

// Before the tree renders, so a crash on first paint is still reported.
initSentry()
lockZoom()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        {/* The app lives under /app. The site root is the static landing page
            in public/, served by nginx and never touched by the router. */}
        <BrowserRouter basename="/app">
          <AuthProvider>
            <App />
            <Toaster position="top-center" />
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)

initPwa()
