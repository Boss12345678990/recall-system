import { Navigate, Route, Routes, useParams } from 'react-router'
import Layout from './components/Layout.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import LoginPage from './pages/LoginPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import PatientsPage from './pages/PatientsPage.jsx'
import PatientDetailPage from './pages/PatientDetailPage.jsx'
import ImportPage from './pages/ImportPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'

// The old /lists/:list pages are now dashboard tabs.
const OLD_LIST_TABS = { 'confirmed-no-show': 'confirmed', 'import-overdue': 'import-overdue' }

function OldListRedirect() {
  const tab = OLD_LIST_TABS[useParams().list]
  return <Navigate to={tab ? `/?tab=${tab}` : '/'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="lists/:list" element={<OldListRedirect />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="patients/:id" element={<PatientDetailPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
