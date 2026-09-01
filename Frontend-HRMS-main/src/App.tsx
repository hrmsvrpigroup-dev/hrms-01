import { BrowserRouter, Navigate, Route, Routes, Link } from 'react-router-dom'
import { useAuthStore } from './store/auth.store'

import AdminLayout from './layouts/AdminLayout'
import EmployeeLayout from './layouts/EmployeeLayout'
import HRLayout from './layouts/HRLayout'
import SuperAdminLayout from './layouts/SuperAdminLayout'
import { ProtectedRoute } from './middleware/ProtectedRoute'
import Login from './pages/auth/Login'
import ResetPassword from './pages/auth/ResetPassword'
import MobileSelfie from './pages/auth/MobileSelfie'
import AdminDashboard from './pages/admin/Dashboard'
import HRManagement from './pages/admin/HRManagement'
import ProvisionHR from './pages/admin/ProvisionHR'
import AdminEmployeeList from './pages/admin/EmployeeList'
import AdminAttendanceCalendar from './pages/admin/AttendanceCalendar'
import AttendanceDetails from './pages/admin/AttendanceDetails'
import EmployeePortfolio from './pages/admin/EmployeePortfolio'
import EmpDashboard from './pages/employee/Dashboard'
import ApplyLeave from './pages/employee/ApplyLeave'
import MyAttendance from './pages/employee/MyAttendance'
import AttendanceHistory from './pages/employee/AttendanceHistory'
import Payslips from './pages/employee/Payslips'
import MyDocuments from './pages/employee/MyDocuments'
import Tasks from './pages/employee/Tasks'
import MyRequests from './pages/employee/MyRequests'
import Profile from './pages/employee/Profile'
import Settings from './pages/employee/Settings'
import HRDashboard from './pages/hr/Dashboard'
import Attendance from './pages/hr/Attendance'
import Employees from './pages/hr/Employees'
import AddEmployee from './pages/hr/AddEmployee'
import EditEmployee from './pages/hr/EditEmployee'
import EmployeeVerifications from './pages/hr/EmployeeVerifications'
import HRCalendar from './pages/hr/Calendar'
import HRAttendanceDetails from './pages/hr/AttendanceDetails'
import ManualAttendance from './pages/hr/ManualAttendance'
import HREmployeePortfolio from './pages/hr/EmployeePortfolio'
import MonthlyReport from './pages/hr/MonthlyReport'
import OnboardingPage from './pages/onboarding/OnboardingPage'
import HRVerificationPanel from './pages/onboarding/HRVerificationPanel'
import EmployeeApprovalPanel from './pages/onboarding/EmployeeApprovalPanel'
import EmployeeWelcomePage from './pages/onboarding/EmployeeWelcomePage'
import LeaveApprovals from './pages/hr/LeaveApprovals'
import Recruitment from './pages/hr/Recruitment'
import TaskAssignment from './pages/hr/TaskAssignment'
import Salary from './pages/hr/Salary'
import Shifts from './pages/hr/Shifts'
import HRDocuments from './pages/hr/Documents'
import HRCredits from './pages/admin/Credits'
import SACredits from './pages/superadmin/CreditManagement'
import SACompanies from './pages/superadmin/Companies'
import SADashboard from './pages/superadmin/Dashboard'
import SAPending from './pages/superadmin/PendingRegistrations'
import SAWallet from './pages/superadmin/Wallet'
import AddCompany from './pages/superadmin/AddCompany'
import EditCompany from './pages/superadmin/EditCompany'
import SACreditTransactions from './pages/superadmin/CreditTransactions'
import SADocuments from './pages/superadmin/Documents'

const getLandingRoute = (role?: string) => {
  switch (role) {
    case 'SUPER_ADMIN': return '/superadmin'
    case 'ADMIN': return '/admin'
    case 'HR': return '/hr'
    case 'EMPLOYEE': return '/employee'
    default: return '/login'
  }
}

function Unauthorized() {
  const { user } = useAuthStore()

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Unauthorized</h1>
        <p>You do not have permission to access this route.</p>
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <Link to={getLandingRoute(user?.role)} style={{ 
            display: 'inline-block',
            padding: '10px 20px', 
            backgroundColor: 'var(--primary, #4f46e5)', 
            color: 'white', 
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 500
          }}>
            Return to Dashboard
          </Link>
        </div>
      </section>
    </main>
  )
}

function NotFound() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Page Not Found</h1>
      </section>
    </main>
  )
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/activate" element={<ResetPassword />} />
        <Route path="/onboarding/:token" element={<OnboardingPage />} />
        <Route path="/mobile-selfie/:sessionId" element={<MobileSelfie />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/unauthorized" element={<Unauthorized />} />

        <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']} />}>
          <Route element={<SuperAdminLayout />}>
            <Route path="/superadmin" element={<SADashboard />} />
            <Route path="/superadmin/pending" element={<SAPending />} />
            <Route path="/superadmin/companies" element={<SACompanies />} />
            <Route path="/superadmin/companies/add" element={<AddCompany />} />
            <Route path="/superadmin/companies/edit/:id" element={<EditCompany />} />
            <Route path="/superadmin/credits" element={<SACredits />} />
            <Route path="/superadmin/credit-transactions" element={<SACreditTransactions />} />
            <Route path="/superadmin/documents" element={<SADocuments />} />
            <Route path="/superadmin/settings" element={<Settings />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/hr" element={<HRManagement />} />
            <Route path="/admin/hr/provision" element={<ProvisionHR />} />
            <Route path="/admin/employees" element={<AdminEmployeeList />} />
            <Route path="/admin/employees/add" element={<AddEmployee />} />
            <Route path="/admin/employees/edit/:id" element={<EditEmployee />} />
            <Route path="/admin/attendance" element={<AdminAttendanceCalendar />} />
            <Route path="/admin/attendance/details" element={<AttendanceDetails />} />
            <Route path="/admin/employees/:id/portfolio" element={<EmployeePortfolio />} />
            <Route path="/admin/onboarding" element={<EmployeeApprovalPanel />} />
            <Route path="/admin/onboarding/welcome/:inviteId" element={<EmployeeWelcomePage />} />
            <Route path="/admin/wallet" element={<SAWallet />} />
            <Route path="/admin/settings" element={<Settings />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['HR']} />}>
          <Route element={<HRLayout />}>
            <Route path="/hr" element={<HRDashboard />} />
            <Route path="/hr/employees" element={<Employees />} />
            <Route path="/hr/shifts" element={<Shifts />} />
            <Route path="/hr/employees/add" element={<AddEmployee />} />
            <Route path="/hr/employees/edit/:id" element={<EditEmployee />} />
            <Route path="/hr/verifications" element={<EmployeeVerifications />} />
            <Route path="/hr/onboarding" element={<HRVerificationPanel />} />
            <Route path="/hr/attendance" element={<Attendance />} />
            <Route path="/hr/manual-attendance" element={<ManualAttendance />} />
            <Route path="/hr/calendar" element={<HRCalendar />} />
            <Route path="/hr/monthly-report" element={<MonthlyReport />} />
            <Route path="/hr/attendance/details" element={<HRAttendanceDetails />} />
            <Route path="/hr/employees/:id/portfolio" element={<HREmployeePortfolio />} />
            <Route path="/hr/leaves" element={<LeaveApprovals />} />
            <Route path="/hr/recruitment" element={<Recruitment />} />
            <Route path="/hr/interview-schedule" element={<Recruitment defaultTab="stage-6" />} />
            <Route path="/hr/tasks" element={<TaskAssignment />} />
            <Route path="/hr/salary" element={<Salary />} />
            <Route path="/hr/shifts" element={<Shifts />} />
            <Route path="/hr/documents" element={<HRDocuments />} />
            <Route path="/hr/wallet" element={<HRCredits />} />
            <Route path="/hr/settings" element={<Settings />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['EMPLOYEE']} />}>
          <Route element={<EmployeeLayout />}>
            <Route path="/employee" element={<EmpDashboard />} />
            <Route path="/employee/attendance" element={<MyAttendance />} />
            <Route path="/employee/leave" element={<ApplyLeave />} />
            <Route path="/employee/history" element={<AttendanceHistory />} />
            <Route path="/employee/payslips" element={<Payslips />} />
            <Route path="/employee/documents" element={<MyDocuments />} />
            <Route path="/employee/tasks" element={<Tasks />} />
            <Route path="/employee/requests" element={<MyRequests />} />
            <Route path="/employee/profile" element={<Profile />} />
            <Route path="/employee/settings" element={<Settings />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
