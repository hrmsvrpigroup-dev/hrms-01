import { Response } from 'express'
import { prisma } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'
import { sendError, sendSuccess } from '../utils/response.utils'
import { LeaveStatus } from '@prisma/client'

export const hrController = {
  async dashboard(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    if (!tenantId || !req.user) {
      return sendError(res, 'Tenant context not found', 400)
    }

    try {
      const [assignedEmployeeCount, totalEmployees, pendingLeavesCount, tenant] = await Promise.all([
        prisma.employee.count({
          where: { tenantId, hrUserId: req.user.id },
        }),
        prisma.employee.count({
          where: { tenantId },
        }),
        prisma.leave.count({
          where: {
            tenantId,
            status: LeaveStatus.PENDING,
            employee: {
              hrUserId: req.user.id,
            },
          },
        }),
        prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { credits: true, name: true },
        }),
      ])

      return sendSuccess(res, {
        assignedEmployeeCount,
        totalEmployees,
        pendingLeavesCount,
        creditsBalance: tenant?.credits ?? 0,
        companyName: tenant?.name ?? '',
      })
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to retrieve HR dashboard metrics', 500)
    }
  },

  async getAttendanceCalendarSummary(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    if (!tenantId) return sendError(res, 'Tenant context not found', 400)

    const { year, month } = req.query
    if (!year || !month) return sendError(res, 'Year and month are required', 400)

    try {
      const startDate = new Date(Number(year), Number(month) - 1, 1)
      const endDate = new Date(Number(year), Number(month), 1)

      const attendances = await prisma.attendance.findMany({
        where: { tenantId, date: { gte: startDate, lt: endDate }, status: 'PRESENT' }
      })

      const leaves = await prisma.leave.findMany({
        where: {
          tenantId, status: 'APPROVED',
          OR: [
            { fromDate: { gte: startDate, lt: endDate } },
            { toDate: { gte: startDate, lt: endDate } },
            { fromDate: { lt: startDate }, toDate: { gte: endDate } }
          ]
        }
      })

      const summary: Record<string, { activeCount: number; leaveCount: number }> = {}
      const daysInMonth = new Date(Number(year), Number(month), 0).getDate()
      for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(Date.UTC(Number(year), Number(month) - 1, i))
        summary[d.toISOString().split('T')[0]] = { activeCount: 0, leaveCount: 0 }
      }

      attendances.forEach(att => {
        const key = att.date.toISOString().split('T')[0]
        if (summary[key]) summary[key].activeCount += 1
      })

      leaves.forEach(leave => {
        const start = leave.fromDate < startDate ? startDate : leave.fromDate
        const end = leave.toDate >= endDate ? new Date(endDate.getTime() - 1) : leave.toDate
        let curr = new Date(start)
        while (curr <= end) {
          const key = curr.toISOString().split('T')[0]
          if (summary[key]) summary[key].leaveCount += 1
          curr.setDate(curr.getDate() + 1)
        }
      })

      return sendSuccess(res, summary)
    } catch (err: any) {
      return sendError(res, err.message, 500)
    }
  },

  async getAttendanceDetails(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    if (!tenantId) return sendError(res, 'Tenant context not found', 400)

    const { date, type } = req.query
    if (!date || !type) return sendError(res, 'Date and type are required', 400)

    try {
      const targetDate = new Date(date as string)
      targetDate.setUTCHours(0, 0, 0, 0)
      const nextDate = new Date(targetDate)
      nextDate.setDate(nextDate.getDate() + 1)

      let employees: any[] = []

      if (type === 'active') {
        const attendances = await prisma.attendance.findMany({
          where: { tenantId, date: { gte: targetDate, lt: nextDate }, status: 'PRESENT' },
          include: { employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, photo: true, department: { select: { name: true } } } } }
        })
        employees = attendances.map(a => ({
          ...a.employee,
          clockIn: a.clockIn,
          clockOut: a.clockOut
        })).filter(e => e.id)
      } else if (type === 'leave') {
        const leaves = await prisma.leave.findMany({
          where: { tenantId, status: 'APPROVED', fromDate: { lte: targetDate }, toDate: { gte: targetDate } },
          include: { employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, photo: true, department: { select: { name: true } } } } }
        })
        employees = leaves.map(l => l.employee).filter(Boolean)
      } else if (type === 'inactive') {
        const allEmployees = await prisma.employee.findMany({
          where: { tenantId, status: 'ACTIVE' },
          select: { id: true, employeeCode: true, firstName: true, lastName: true, photo: true, department: { select: { name: true } } }
        })
        const presentOrLeave = await prisma.attendance.findMany({
          where: { tenantId, date: { gte: targetDate, lt: nextDate }, status: { in: ['PRESENT', 'ON_LEAVE'] } },
          select: { employeeId: true }
        })
        const approvedLeaves = await prisma.leave.findMany({
          where: { tenantId, status: 'APPROVED', fromDate: { lte: targetDate }, toDate: { gte: targetDate } },
          select: { employeeId: true }
        })
        const activeIds = new Set([...presentOrLeave.map(a => a.employeeId), ...approvedLeaves.map(l => l.employeeId)])
        employees = allEmployees.filter(e => !activeIds.has(e.id))
      }

      return sendSuccess(res, employees)
    } catch (err: any) {
      return sendError(res, err.message, 500)
    }
  },

  async getEmployeePortfolio(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    if (!tenantId) return sendError(res, 'Tenant context not found', 400)
    const { id } = req.params
    if (!id) return sendError(res, 'Employee ID is required', 400)

    try {
      const employee = await prisma.employee.findUnique({
        where: { id },
        include: {
          department: { select: { name: true } },
          designation: { select: { title: true } },
          manager: { select: { firstName: true, lastName: true } },
          branch: { select: { name: true } },
          attendance: { orderBy: { date: 'asc' }, select: { date: true, clockIn: true, clockOut: true, totalHours: true, status: true } },
          tasks: { select: { id: true, title: true, status: true, dueDate: true, createdAt: true } },
          leaves: { select: { id: true, type: true, status: true, fromDate: true, toDate: true, days: true } },
          payroll: { orderBy: { year: 'desc' }, take: 6, select: { month: true, year: true, netSalary: true, basicSalary: true, status: true } }
        }
      })

      if (!employee || employee.tenantId !== tenantId) return sendError(res, 'Employee not found', 404)

      const totalDays = employee.attendance.length
      const presentDays = employee.attendance.filter(a => a.status === 'PRESENT').length
      const absentDays = employee.attendance.filter(a => a.status === 'ABSENT').length
      const leaveDays = employee.attendance.filter(a => a.status === 'ON_LEAVE').length
      const lateDays = employee.attendance.filter(a => a.status === 'LATE').length
      const halfDays = employee.attendance.filter(a => a.status === 'HALF_DAY').length
      const lateLogins = employee.attendance.filter(a => { if (!a.clockIn) return false; const d = new Date(a.clockIn); return d.getUTCHours() > 9 || (d.getUTCHours() === 9 && d.getUTCMinutes() > 30) }).length
      const earlyLogins = employee.attendance.filter(a => { if (!a.clockIn) return false; const d = new Date(a.clockIn); return d.getUTCHours() < 8 || (d.getUTCHours() === 8 && d.getUTCMinutes() <= 30) }).length
      const hoursRecs = employee.attendance.filter(a => a.totalHours && a.totalHours > 0)
      const avgHours = hoursRecs.length > 0 ? hoursRecs.reduce((s, a) => s + (a.totalHours || 0), 0) / hoursRecs.length : 0
      const attendancePercent = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0

      const totalTasks = employee.tasks.length
      const doneTasks = employee.tasks.filter(t => t.status === 'DONE').length
      const inProgressTasks = employee.tasks.filter(t => t.status === 'IN_PROGRESS').length
      const pendingTasks = employee.tasks.filter(t => t.status === 'PENDING').length
      const overdueTasksCount = employee.tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'DONE').length
      const onTimeTasksCount = employee.tasks.filter(t => t.dueDate && t.status === 'DONE').length
      const taskCompletionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

      const approvedLeaves = employee.leaves.filter(l => l.status === 'APPROVED')
      const totalLeaveDaysTaken = approvedLeaves.reduce((s, l) => s + l.days, 0)

      const now = new Date()
      const monthlyAttendance = Array.from({ length: 6 }).map((_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
        const monthName = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
        const recs = employee.attendance.filter(a => { const ad = new Date(a.date); return ad.getMonth() === d.getMonth() && ad.getFullYear() === d.getFullYear() })
        return { month: monthName, present: recs.filter(a => a.status === 'PRESENT').length, total: recs.length }
      })

      return sendSuccess(res, {
        employee: { id: employee.id, employeeCode: employee.employeeCode, firstName: employee.firstName, lastName: employee.lastName, email: employee.email, phone: employee.phone, photo: employee.photo, gender: employee.gender, dateOfBirth: employee.dateOfBirth, joiningDate: employee.joiningDate, status: employee.status, employmentType: employee.employmentType, salaryGross: employee.salaryGross, department: employee.department?.name, designation: employee.designation?.title, manager: employee.manager ? `${employee.manager.firstName} ${employee.manager.lastName}` : null, branch: employee.branch?.name },
        attendanceStats: {
          totalDays,
          presentDays,
          absentDays,
          leaveDays,
          lateDays,
          halfDays,
          lateLogins,
          earlyLogins,
          avgHours: parseFloat(avgHours.toFixed(1)),
          attendancePercent,
          monthlyAttendance,
          records: employee.attendance.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        },
        taskStats: { totalTasks, doneTasks, inProgressTasks, pendingTasks, overdueTasksCount, onTimeTasksCount, taskCompletionRate, recentTasks: employee.tasks.slice(-10).reverse() },
        leaveStats: { totalLeaveRequests: employee.leaves.length, approvedLeaves: approvedLeaves.length, totalLeaveDaysTaken, leaveBreakdown: employee.leaves },
        payrollHistory: employee.payroll
      })
    } catch (err: any) {
      return sendError(res, err.message, 500)
    }
  },

  async getMonthlyReport(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    if (!tenantId) return sendError(res, 'Tenant context not found', 400)

    const { year, month } = req.query
    const targetYear = year ? Number(year) : new Date().getFullYear()
    const targetMonth = month ? Number(month) : (new Date().getMonth() + 1)

    try {
      const startDate = new Date(Date.UTC(targetYear, targetMonth - 1, 1, 0, 0, 0))
      const endDate = new Date(Date.UTC(targetYear, targetMonth, 1, 0, 0, 0))

      const [employees, attendances, leaves] = await Promise.all([
        prisma.employee.findMany({
          where: { tenantId },
          include: { department: true, designation: true },
          orderBy: { employeeCode: 'asc' }
        }),
        prisma.attendance.findMany({
          where: { tenantId, date: { gte: startDate, lt: endDate } },
          orderBy: { date: 'asc' }
        }),
        prisma.leave.findMany({
          where: {
            tenantId,
            status: 'APPROVED',
            OR: [
              { fromDate: { gte: startDate, lt: endDate } },
              { toDate: { gte: startDate, lt: endDate } },
              { fromDate: { lt: startDate }, toDate: { gte: endDate } }
            ]
          }
        })
      ])

      const companyRecordedDates = Array.from(new Set(attendances.map(a => a.date.toISOString().split('T')[0]))).sort()
      const daysInMonth = new Date(targetYear, targetMonth, 0).getDate()
      const now = new Date()
      const isCurrentMonth = (now.getFullYear() === targetYear && (now.getMonth() + 1) === targetMonth)
      const maxDay = isCurrentMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth

      const employeeReports = employees.map(emp => {
        const empAttendances = attendances.filter(a => a.employeeId === emp.id)
        const empLeaves = leaves.filter(l => l.employeeId === emp.id)

        const presentRecords: any[] = []
        const absentDates: string[] = []
        const leaveDates: string[] = []
        const lateDates: string[] = []
        const halfDayDates: string[] = []

        const attByDate = new Map<string, typeof empAttendances[0]>()
        empAttendances.forEach(a => {
          const dStr = a.date.toISOString().split('T')[0]
          attByDate.set(dStr, a)
        })

        const daysToCheck = companyRecordedDates.length > 0
          ? companyRecordedDates
          : Array.from({ length: maxDay }, (_, i) => {
              const d = new Date(Date.UTC(targetYear, targetMonth - 1, i + 1))
              return d.toISOString().split('T')[0]
            })

        daysToCheck.forEach(dStr => {
          const rec = attByDate.get(dStr)
          if (rec) {
            if (rec.status === 'PRESENT') {
              presentRecords.push({ date: dStr, clockIn: rec.clockIn, clockOut: rec.clockOut, totalHours: rec.totalHours, status: 'PRESENT' })
            } else if (rec.status === 'LATE') {
              presentRecords.push({ date: dStr, clockIn: rec.clockIn, clockOut: rec.clockOut, totalHours: rec.totalHours, status: 'LATE' })
              lateDates.push(dStr)
            } else if (rec.status === 'HALF_DAY') {
              presentRecords.push({ date: dStr, clockIn: rec.clockIn, clockOut: rec.clockOut, totalHours: rec.totalHours, status: 'HALF_DAY' })
              halfDayDates.push(dStr)
            } else if (rec.status === 'ABSENT') {
              absentDates.push(dStr)
            } else if (rec.status === 'ON_LEAVE') {
              leaveDates.push(dStr)
            }
          } else {
            const targetD = new Date(dStr)
            const isOnLeave = empLeaves.some(l => targetD >= l.fromDate && targetD <= l.toDate)
            if (isOnLeave) {
              leaveDates.push(dStr)
            } else {
              absentDates.push(dStr)
            }
          }
        })

        const presentCount = presentRecords.length
        const absentCount = absentDates.length
        const lateCount = lateDates.length
        const leaveCount = leaveDates.length
        const halfDayCount = halfDayDates.length
        const totalEvaluatedDays = daysToCheck.length

        const totalHours = empAttendances.reduce((s, a) => s + (a.totalHours || 0), 0)
        const avgHours = presentCount > 0 ? parseFloat((totalHours / presentCount).toFixed(1)) : 0
        const attendanceRate = totalEvaluatedDays > 0 ? Math.round(((presentCount + (halfDayCount * 0.5)) / totalEvaluatedDays) * 100) : 0

        return {
          id: emp.id,
          name: `${emp.firstName} ${emp.lastName}`.trim(),
          employeeCode: emp.employeeCode,
          department: emp.department?.name || 'General',
          designation: emp.designation?.title || 'Employee',
          status: emp.status,
          presentCount,
          absentCount,
          lateCount,
          leaveCount,
          halfDayCount,
          totalHours: parseFloat(totalHours.toFixed(1)),
          avgHours,
          attendanceRate,
          presentDates: presentRecords.map(r => r.date),
          absentDates,
          lateDates,
          leaveDates,
          presentRecords
        }
      })

      const totalEmployeesCount = employeeReports.length
      const totalPresents = employeeReports.reduce((s, r) => s + r.presentCount, 0)
      const totalAbsents = employeeReports.reduce((s, r) => s + r.absentCount, 0)
      const totalLeaves = employeeReports.reduce((s, r) => s + r.leaveCount, 0)
      const totalLates = employeeReports.reduce((s, r) => s + r.lateCount, 0)
      const avgMonthlyRate = totalEmployeesCount > 0
        ? Math.round(employeeReports.reduce((s, r) => s + r.attendanceRate, 0) / totalEmployeesCount)
        : 0

      return sendSuccess(res, {
        year: targetYear,
        month: targetMonth,
        daysInMonth,
        companyRecordedDates,
        summary: {
          totalEmployeesCount,
          totalPresents,
          totalAbsents,
          totalLeaves,
          totalLates,
          avgMonthlyRate
        },
        employees: employeeReports
      })
    } catch (err: any) {
      return sendError(res, err.message, 500)
    }
  },
}
