import AppShell from '../components/shared/AppShell'

export default function HRLayout() {
  return (
    <AppShell
      title="HR"
      navItems={[
        { to: '/hr', label: 'Dashboard' },
        { to: '/hr/employees', label: 'Employees' },
        { to: '/hr/shifts', label: 'Shift Management' },
        { to: '/hr/attendance', label: 'Attendance' },
        { to: '/hr/manual-attendance', label: 'Manual Attendance' },
        { to: '/hr/calendar', label: 'Calendar' },
        { to: '/hr/monthly-report', label: 'Monthly Report' },
        { to: '/hr/leaves', label: 'Leave Approvals' },
        { to: '/hr/recruitment', label: 'Recruitment' },
        { to: '/hr/tasks', label: 'Task Assignment' },
        { to: '/hr/salary', label: 'Salary' },
        { to: '/hr/documents', label: 'Documents' },
        { to: '/hr/wallet', label: 'Wallet' },
      ]}
    />
  )
}

