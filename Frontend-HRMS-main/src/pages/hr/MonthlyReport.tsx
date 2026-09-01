import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, Download, Printer, Calendar, Users, CheckCircle2,
  XCircle, Clock, Search, Filter, ArrowUpRight, TrendingUp, ChevronLeft, ChevronRight,
  RefreshCw, ChevronDown, ChevronUp, AlertCircle, Award
} from 'lucide-react'
import { hrApi } from '../../api/hr.api'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const YEARS = [2024, 2025, 2026, 2027]

function formatDatePill(dateStr: string) {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', weekday: 'short' })
}

export default function MonthlyReport() {
  const navigate = useNavigate()
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth()) // 0-indexed
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear())
  const [reportData, setReportData] = useState<any>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [deptFilter, setDeptFilter] = useState<string>('ALL')
  const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const pageSize = 10

  const fetchMonthlyReport = async (year: number, month: number) => {
    try {
      setLoading(true)
      const data = await hrApi.getMonthlyReport(year, month + 1)
      setReportData(data)
    } catch (err) {
      console.error('Failed to load monthly report', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMonthlyReport(selectedYear, selectedMonth)
  }, [selectedYear, selectedMonth])

  // Extract department list
  const departments = useMemo(() => {
    if (!reportData?.employees) return []
    return Array.from(new Set(reportData.employees.map((e: any) => e.department))).filter(Boolean)
  }, [reportData])

  // Filter employees
  const filteredEmployees = useMemo(() => {
    if (!reportData?.employees) return []
    return reportData.employees.filter((emp: any) => {
      const matchesDept = deptFilter === 'ALL' || emp.department === deptFilter
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch = !q ||
        emp.name.toLowerCase().includes(q) ||
        (emp.employeeCode && emp.employeeCode.toLowerCase().includes(q)) ||
        (emp.department && emp.department.toLowerCase().includes(q))

      return matchesDept && matchesSearch
    })
  }, [reportData, deptFilter, searchQuery])

  const totalPages = Math.ceil(filteredEmployees.length / pageSize) || 1
  const paginatedEmployees = filteredEmployees.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Export CSV
  const handleExportCSV = () => {
    if (!reportData?.employees) return
    const headers = ['Employee Code', 'Name', 'Department', 'Designation', 'Present Days', 'Absent Days', 'Late Days', 'Leaves', 'Attendance %', 'Total Hours', 'Avg Daily Hours', 'Present Dates', 'Absent Dates']
    const rows = filteredEmployees.map((r: any) => [
      `"${r.employeeCode}"`,
      `"${r.name}"`,
      `"${r.department}"`,
      `"${r.designation}"`,
      r.presentCount,
      r.absentCount,
      r.lateCount,
      r.leaveCount,
      `${r.attendanceRate}%`,
      r.totalHours,
      r.avgHours,
      `"${(r.presentDates || []).join(', ')}"`,
      `"${(r.absentDates || []).join(', ')}"`
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e: any) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Monthly_Attendance_Report_${MONTHS[selectedMonth]}_${selectedYear}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const summary = reportData?.summary || {
    totalEmployeesCount: 0,
    totalPresents: 0,
    totalAbsents: 0,
    totalLeaves: 0,
    totalLates: 0,
    avgMonthlyRate: 0
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        .monthly-report-page * { font-family: 'Inter', sans-serif; box-sizing: border-box; }
        @media print {
          .no-print { display: none !important; }
          .report-card { box-shadow: none !important; border: 1px solid #e2e8f0 !important; break-inside: avoid; }
        }
        .report-row:hover {
          background-color: #f8fafc;
        }
        .date-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
        }
      `}</style>

      <div className="monthly-report-page" style={{ padding: '4px 8px 32px' }}>
        {/* Header Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: -0.5 }}>
              Monthly Attendance Report
            </h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0 0' }}>
              Detailed present and absent breakdown, punctuality logs & monthly audit.
            </p>
          </div>

          {/* Controls */}
          <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* Refresh */}
            <button
              onClick={() => fetchMonthlyReport(selectedYear, selectedMonth)}
              title="Refresh Data"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '9px',
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                color: '#64748b',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={15} />
            </button>

            {/* Month Picker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', padding: '6px 12px', borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <Calendar size={15} color="#6366f1" />
              <select
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(Number(e.target.value))
                  setCurrentPage(1)
                }}
                style={{ border: 'none', background: 'transparent', fontWeight: 700, fontSize: 13, color: '#0f172a', outline: 'none', cursor: 'pointer' }}
              >
                {MONTHS.map((m, idx) => (
                  <option key={m} value={idx}>{m}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => {
                  setSelectedYear(Number(e.target.value))
                  setCurrentPage(1)
                }}
                style={{ border: 'none', background: 'transparent', fontWeight: 700, fontSize: 13, color: '#0f172a', outline: 'none', cursor: 'pointer' }}
              >
                {YEARS.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Export CSV */}
            <button
              onClick={handleExportCSV}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 16px',
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                fontWeight: 700,
                color: '#374151',
                cursor: 'pointer',
                fontSize: 13,
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}
            >
              <Download size={15} /> Export CSV
            </button>

            {/* Print / PDF */}
            <button
              onClick={() => window.print()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 18px',
                background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                border: 'none',
                borderRadius: 10,
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 13,
                boxShadow: '0 4px 14px rgba(99,102,241,0.3)'
              }}
            >
              <Printer size={15} /> Print Report
            </button>
          </div>
        </div>

        {/* Summary Metric Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div className="report-card" style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', border: '1px solid #e8ecf4', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1' }}>
              <Users size={20} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{summary.totalEmployeesCount}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 4 }}>Total Employees</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{MONTHS[selectedMonth]} {selectedYear}</div>
            </div>
          </div>

          <div className="report-card" style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', border: '1px solid #e8ecf4', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(22,163,74,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{summary.totalPresents}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 4 }}>Present Days</div>
              <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, marginTop: 2 }}>Total punch-ins</div>
            </div>
          </div>

          <div className="report-card" style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', border: '1px solid #e8ecf4', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(220,38,38,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
              <XCircle size={20} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{summary.totalAbsents}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 4 }}>Absent Days</div>
              <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600, marginTop: 2 }}>Missed / unrecorded</div>
            </div>
          </div>

          <div className="report-card" style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', border: '1px solid #e8ecf4', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(217,119,6,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}>
              <Clock size={20} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{summary.totalLates}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 4 }}>Late Arrivals</div>
              <div style={{ fontSize: 11, color: '#d97706', fontWeight: 600, marginTop: 2 }}>After 9:30 AM</div>
            </div>
          </div>

          <div className="report-card" style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', border: '1px solid #e8ecf4', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(124,58,237,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed' }}>
              <TrendingUp size={20} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{summary.avgMonthlyRate}%</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 4 }}>Avg. Attendance</div>
              <div style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600, marginTop: 2 }}>Company Average</div>
            </div>
          </div>
        </div>

        {/* Filter and Search Panel */}
        <div className="report-card" style={{
          background: '#fff',
          borderRadius: 20,
          padding: 24,
          border: '1px solid #e8ecf4',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)'
        }}>
          <div className="no-print" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 20,
            padding: '12px 16px',
            background: '#f8fafc',
            borderRadius: 14,
            border: '1px solid #edf2f7'
          }}>
            {/* Search Box */}
            <div style={{ position: 'relative', minWidth: 260, flex: 1, maxWidth: 400 }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search employee by name, code, or dept..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 36px',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  fontSize: 13,
                  background: '#fff',
                  outline: 'none',
                  color: '#0f172a'
                }}
              />
            </div>

            {/* Department Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Filter size={15} color="#64748b" />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Department:</span>
              <select
                value={deptFilter}
                onChange={(e) => {
                  setDeptFilter(e.target.value)
                  setCurrentPage(1)
                }}
                style={{
                  padding: '7px 12px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#0f172a',
                  background: '#fff',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">All Departments</option>
                {departments.map((dept: any) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Table View */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', flexDirection: 'column', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #e0e7ff', borderTop: '3px solid #6366f1', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ color: '#64748b', fontSize: 13, fontWeight: 600 }}>Loading attendance metrics...</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', background: '#f8fafc', borderRadius: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <FileText size={20} />
              </div>
              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>No Employees Found</div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                No employee records match your search or filter criteria for {MONTHS[selectedMonth]} {selectedYear}.
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f1f5f9', background: '#f8fafc' }}>
                    <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569', borderRadius: '8px 0 0 8px' }}>EMPLOYEE</th>
                    <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>DEPARTMENT</th>
                    <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#16a34a', textAlign: 'center' }}>PRESENT</th>
                    <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#dc2626', textAlign: 'center' }}>ABSENT</th>
                    <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#d97706', textAlign: 'center' }}>LATE</th>
                    <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#7c3aed', textAlign: 'center' }}>LEAVES</th>
                    <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569', textAlign: 'center' }}>HOURS</th>
                    <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>ATTENDANCE RATE</th>
                    <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569', borderRadius: '0 8px 8px 0', textAlign: 'right' }}>DATES & ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEmployees.map((emp: any, idx: number) => {
                    const initials = emp.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
                    const isGood = emp.attendanceRate >= 80
                    const isFair = emp.attendanceRate >= 60
                    const isExpanded = expandedEmpId === emp.id

                    return (
                      <React.Fragment key={emp.id || idx}>
                        <tr className="report-row" style={{ borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{
                                width: 36,
                                height: 36,
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: 12,
                                flexShrink: 0
                              }}>
                                {initials}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{emp.name}</div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>{emp.employeeCode} · {emp.designation}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: '#475569' }}>
                            {emp.department}
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                            <span style={{ background: '#dcfce7', color: '#16a34a', padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 800 }}>
                              {emp.presentCount}
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                            <span style={{ background: emp.absentCount > 0 ? '#fee2e2' : '#f8fafc', color: emp.absentCount > 0 ? '#dc2626' : '#94a3b8', padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 800 }}>
                              {emp.absentCount}
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                            <span style={{ background: emp.lateCount > 0 ? '#fef3c7' : '#f8fafc', color: emp.lateCount > 0 ? '#d97706' : '#94a3b8', padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 800 }}>
                              {emp.lateCount}
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                            <span style={{ background: emp.leaveCount > 0 ? '#ede9fe' : '#f8fafc', color: emp.leaveCount > 0 ? '#7c3aed' : '#94a3b8', padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 800 }}>
                              {emp.leaveCount}
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                            {emp.totalHours}h
                          </td>
                          <td style={{ padding: '14px 16px', minWidth: 140 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{
                                  width: `${emp.attendanceRate}%`,
                                  height: '100%',
                                  background: isGood ? '#16a34a' : isFair ? '#f59e0b' : '#dc2626',
                                  borderRadius: 3
                                }} />
                              </div>
                              <span style={{
                                fontSize: 12,
                                fontWeight: 800,
                                color: isGood ? '#16a34a' : isFair ? '#d97706' : '#dc2626',
                                minWidth: 36
                              }}>
                                {emp.attendanceRate}%
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <button
                                onClick={() => setExpandedEmpId(isExpanded ? null : emp.id)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '6px 10px',
                                  background: isExpanded ? '#6366f1' : '#f1f5f9',
                                  color: isExpanded ? '#fff' : '#334155',
                                  border: 'none',
                                  borderRadius: 8,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                {isExpanded ? 'Hide Dates' : 'View Dates'}
                              </button>
                              <button
                                onClick={() => navigate(`/hr/employees/${emp.id}/portfolio`)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '6px 10px',
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: 8,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: '#6366f1',
                                  cursor: 'pointer'
                                }}
                              >
                                Portfolio <ArrowUpRight size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Date-Wise Drawer */}
                        {isExpanded && (
                          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <td colSpan={9} style={{ padding: '16px 20px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                {/* Present Dates Box */}
                                <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #dcfce7' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, color: '#16a34a', fontWeight: 800, fontSize: 12 }}>
                                    <CheckCircle2 size={15} /> Present Dates ({emp.presentDates?.length || 0})
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {emp.presentDates?.length > 0 ? (
                                      emp.presentDates.map((d: string) => (
                                        <span key={d} className="date-chip" style={{ background: '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                                          {formatDatePill(d)}
                                        </span>
                                      ))
                                    ) : (
                                      <span style={{ fontSize: 12, color: '#94a3b8' }}>No present dates recorded.</span>
                                    )}
                                  </div>
                                </div>

                                {/* Absent Dates Box */}
                                <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #fee2e2' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, color: '#dc2626', fontWeight: 800, fontSize: 12 }}>
                                    <XCircle size={15} /> Absent Dates ({emp.absentDates?.length || 0})
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {emp.absentDates?.length > 0 ? (
                                      emp.absentDates.map((d: string) => (
                                        <span key={d} className="date-chip" style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}>
                                          {formatDatePill(d)}
                                        </span>
                                      ))
                                    ) : (
                                      <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>No absent dates recorded this month!</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              {filteredEmployees.length > pageSize && (
                <div className="no-print" style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 18,
                  paddingTop: 14,
                  borderTop: '1px solid #f1f5f9'
                }}>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> to <strong>{Math.min(currentPage * pageSize, filteredEmployees.length)}</strong> of <strong>{filteredEmployees.length}</strong> employees
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        background: currentPage === 1 ? '#f8fafc' : '#fff',
                        color: currentPage === 1 ? '#cbd5e1' : '#374151',
                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                        fontSize: 12,
                        fontWeight: 600
                      }}
                    >
                      <ChevronLeft size={14} /> Previous
                    </button>
                    <span style={{ padding: '0 8px', fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        background: currentPage === totalPages ? '#f8fafc' : '#fff',
                        color: currentPage === totalPages ? '#cbd5e1' : '#374151',
                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                        fontSize: 12,
                        fontWeight: 600
                      }}
                    >
                      Next <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
