import { lazy, Suspense } from 'react'
import {
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { getPendingInvite } from '@/hooks/use-family'
import { useReportBuild } from '@/hooks/use-notifications'
import { BrandLoader } from '@/components/ui/brand-loader'
import TodayPage from '@/pages/today'
import LoginPage from '@/pages/login'
import RegisterPage from '@/pages/register'

// Everything past the dashboard is a separate chunk — the first paint on a
// phone only needs the diary.
const StatsPage = lazy(() => import('@/pages/stats'))
const AddFoodPage = lazy(() => import('@/pages/add-food'))
const FoodDetailPage = lazy(() => import('@/pages/food-detail'))
const FoodInfoPage = lazy(() => import('@/pages/food-info'))
const CreateFoodPage = lazy(() => import('@/pages/create-food'))
const EntryDetailPage = lazy(() => import('@/pages/entry-detail'))
const WeightPage = lazy(() => import('@/pages/weight'))
const ProfilePage = lazy(() => import('@/pages/profile'))
const OnboardingPage = lazy(() => import('@/pages/onboarding'))
const GroceryPage = lazy(() => import('@/pages/grocery'))
const PhotoReviewPage = lazy(() => import('@/pages/photo-review'))
const FamilyPage = lazy(() => import('@/pages/family'))
const JoinPage = lazy(() => import('@/pages/join'))
const ScansPage = lazy(() => import('@/pages/scans'))
const NotificationsPage = lazy(() => import('@/pages/notifications'))

function FullScreenLoader() {
  return (
    <div className="bg-background flex min-h-dvh items-center justify-center">
      <BrandLoader />
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading, needsOnboarding } = useAuth()
  const location = useLocation()

  if (isLoading) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  // A profile without body metrics cannot produce meaningful targets.
  if (needsOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }
  // An invite opened while signed out survives login and onboarding here.
  const pendingInvite = getPendingInvite()
  if (pendingInvite && !location.pathname.startsWith('/join/')) {
    return <Navigate to={`/join/${pendingInvite}`} replace />
  }
  return <>{children}</>
}

function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <FullScreenLoader />
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  // Mounted once for the whole session, which is exactly how often the build
  // this device runs needs reporting. See useReportBuild.
  const { user } = useAuth()
  useReportBuild(Boolean(user))

  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route
          path="/login"
          element={
            <RedirectIfAuthed>
              <LoginPage />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/register"
          element={
            <RedirectIfAuthed>
              <RegisterPage />
            </RedirectIfAuthed>
          }
        />

        <Route
          path="/"
          element={
            <RequireAuth>
              <TodayPage />
            </RequireAuth>
          }
        />
        <Route
          path="/onboarding"
          element={
            <RequireAuth>
              <OnboardingPage />
            </RequireAuth>
          }
        />
        <Route
          path="/stats"
          element={
            <RequireAuth>
              <StatsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/grocery"
          element={
            <RequireAuth>
              <GroceryPage />
            </RequireAuth>
          }
        />
        <Route
          path="/add"
          element={
            <RequireAuth>
              <AddFoodPage />
            </RequireAuth>
          }
        />
        <Route
          path="/food/new"
          element={
            <RequireAuth>
              <CreateFoodPage />
            </RequireAuth>
          }
        />
        <Route
          path="/food/:id"
          element={
            <RequireAuth>
              <FoodDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/food/:id/info"
          element={
            <RequireAuth>
              <FoodInfoPage />
            </RequireAuth>
          }
        />
        <Route
          path="/photo-review"
          element={
            <RequireAuth>
              <PhotoReviewPage />
            </RequireAuth>
          }
        />
        <Route
          path="/entry/:id"
          element={
            <RequireAuth>
              <EntryDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/weight"
          element={
            <RequireAuth>
              <WeightPage />
            </RequireAuth>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />
        <Route
          path="/notifications"
          element={
            <RequireAuth>
              <NotificationsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/family"
          element={
            <RequireAuth>
              <FamilyPage />
            </RequireAuth>
          }
        />
        <Route
          path="/scans"
          element={
            <RequireAuth>
              <ScansPage />
            </RequireAuth>
          }
        />
        {/* Outside RequireAuth on purpose — see the page's own comment. */}
        <Route path="/join/:token" element={<JoinPage />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
