import { Response } from 'express'
import { prisma } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'
import { sendError, sendSuccess } from '../utils/response.utils'
import { AttendanceStatus, UserRole } from '@prisma/client'
import { syncAttendanceToGoogleSheet, syncAllAttendanceToGoogleSheet } from '../services/googleSheets.service'

export const attendanceController = {
  async list(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    if (!tenantId) {
      return sendError(res, 'Tenant context not found', 400)
    }

    const whereClause: any = { tenantId }
    if (req.user?.role === UserRole.EMPLOYEE) {
      whereClause.employee = { userId: req.user.id }
    }

    try {
      const items = await prisma.attendance.findMany({
        where: whereClause,
        include: {
          employee: {
            select: { firstName: true, lastName: true, employeeCode: true, email: true },
          },
        },
        orderBy: { date: 'desc' },
        take: 150,
      })

      return sendSuccess(res, items)
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to list attendance records', 500)
    }
  },

  async clockIn(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    const userId = req.user?.id

    if (!tenantId || !userId) {
      return sendError(res, 'Unauthorized or tenant context not found', 401)
    }

    try {
      // Find the employee profile associated with the user
      const employee = await prisma.employee.findUnique({
        where: { userId },
      })
      if (!employee) {
        return sendError(res, 'Employee profile not found.', 404)
      }

      const { faceImage, qrData, clockInPhoto } = req.body as { faceImage?: string; qrData?: string; clockInPhoto?: string }
      const actualPhoto = clockInPhoto || faceImage

      // 1. Live Selfie / Facial Check
      if (!actualPhoto && !qrData && (employee.attendanceType === 'FACIAL' || employee.attendanceType === 'BOTH')) {
        return sendError(res, 'Live selfie photo is required for clock-in.', 400)
      }

      // Auto-register face baseline if missing without error
      if (actualPhoto && !employee.faceBaseline) {
        await prisma.employee.update({
          where: { id: employee.id },
          data: { faceBaseline: actualPhoto },
        })
      }

      // 2. QR Attendance Check (only if QR mode and no selfie photo was uploaded)
      const isQrRequired = employee.attendanceType === 'QR';
      const isBothWithQr = (employee.attendanceType as string) === 'BOTH' && qrData;
      if ((isQrRequired && !actualPhoto) || (isBothWithQr && !actualPhoto)) {
        if (!qrData) {
          return sendError(res, 'QR code data is required for QR clock-in.', 400)
        }
        const todayDateStr = new Date().toISOString().split('T')[0]
        const expectedToken1 = `HRMS-CHECKIN-${employee.employeeCode}-${todayDateStr}`
        const expectedToken2 = `HRMS-CHECKIN-${tenantId}-${todayDateStr}`
        if (qrData !== expectedToken1 && qrData !== expectedToken2 && !qrData.includes('HRMS-CHECKIN')) {
          return sendError(res, 'Invalid or expired QR code scanned.', 400)
        }
      }

      // Check if already clocked in today
      const todayStr = new Date().toISOString().split('T')[0]
      const todayDate = new Date(todayStr)

      const existingRecord = await prisma.attendance.findUnique({
        where: {
          tenantId_employeeId_date: {
            tenantId,
            employeeId: employee.id,
            date: todayDate,
          },
        },
      })

      if (existingRecord?.clockIn) {
        return sendError(res, 'You have already clocked in for today.', 400)
      }

      const now = new Date()
      const attendance = await prisma.attendance.upsert({
        where: {
          tenantId_employeeId_date: {
            tenantId,
            employeeId: employee.id,
            date: todayDate,
          },
        },
        update: {
          clockIn: now,
          status: AttendanceStatus.PRESENT,
          ...(actualPhoto ? { clockInPhoto: actualPhoto } : {}),
        },
        create: {
          tenantId,
          employeeId: employee.id,
          date: todayDate,
          clockIn: now,
          status: AttendanceStatus.PRESENT,
          ...(actualPhoto ? { clockInPhoto: actualPhoto } : {}),
        },
      })

      // Sync clock-in to Google Sheet
      await syncAttendanceToGoogleSheet(attendance.id).catch((err) => {
        console.error(`[GOOGLE_SHEETS_SYNC_ERROR] ${err.message}`)
      })

      // Re-fetch updated employee to get current faceBaseline state
      const updatedEmployee = await prisma.employee.findUnique({ where: { id: employee.id } })

      return sendSuccess(res, {
        ...attendance,
        attendanceType: updatedEmployee?.attendanceType ?? employee.attendanceType,
        hasFaceBaseline: !!updatedEmployee?.faceBaseline,
        employeeCode: employee.employeeCode,
      }, 'Clock-in recorded successfully')
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to clock in', 500)
    }
  },

  async clockOut(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    const userId = req.user?.id

    if (!tenantId || !userId) {
      return sendError(res, 'Unauthorized or tenant context not found', 401)
    }

    try {
      // Find the employee profile associated with the user
      const employee = await prisma.employee.findUnique({
        where: { userId },
      })
      if (!employee) {
        return sendError(res, 'Employee profile not found.', 404)
      }

      const todayStr = new Date().toISOString().split('T')[0]
      const todayDate = new Date(todayStr)

      const existingRecord = await prisma.attendance.findUnique({
        where: {
          tenantId_employeeId_date: {
            tenantId,
            employeeId: employee.id,
            date: todayDate,
          },
        },
      })

      if (!existingRecord?.clockIn) {
        return sendError(res, 'No clock-in record found for today. Please clock in first.', 400)
      }

      if (existingRecord.clockOut) {
        return sendError(res, 'You have already clocked out for today.', 400)
      }

      const now = new Date()
      const diffMs = now.getTime() - new Date(existingRecord.clockIn).getTime()
      const diffHrs = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100

      const attendance = await prisma.attendance.update({
        where: {
          id: existingRecord.id,
        },
        data: {
          clockOut: now,
          totalHours: diffHrs,
        },
      })

      // Sync clock-out to Google Sheet
      await syncAttendanceToGoogleSheet(attendance.id).catch((err) => {
        console.error(`[GOOGLE_SHEETS_SYNC_ERROR] ${err.message}`)
      })

      return sendSuccess(res, attendance, 'Clock-out recorded successfully')
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to clock out', 500)
    }
  },

  async todayStatus(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    const userId = req.user?.id

    if (!tenantId || !userId) {
      return sendError(res, 'Unauthorized', 401)
    }

    try {
      const employee = await prisma.employee.findUnique({
        where: { userId },
      })
      if (!employee) {
        return sendError(res, 'Employee profile not found.', 404)
      }

      const todayStr = new Date().toISOString().split('T')[0]
      const todayDate = new Date(todayStr)

      const attendance = await prisma.attendance.findUnique({
        where: {
          tenantId_employeeId_date: {
            tenantId,
            employeeId: employee.id,
            date: todayDate,
          },
        },
      })

      return sendSuccess(res, {
        ...(attendance || {}),
        attendanceType: employee.attendanceType,
        hasFaceBaseline: !!employee.faceBaseline,
        employeeCode: employee.employeeCode,
        shift: employee.shift,
      })
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to fetch today status', 500)
    }
  },

  async logIdle(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    const userId = req.user?.id

    if (!tenantId || !userId) {
      return sendError(res, 'Unauthorized', 401)
    }

    try {
      const employee = await prisma.employee.findUnique({ where: { userId } })
      if (!employee) return sendError(res, 'Employee profile not found.', 404)

      const todayStr = new Date().toISOString().split('T')[0]
      const todayDate = new Date(todayStr)

      const attendance = await prisma.attendance.findUnique({
        where: {
          tenantId_employeeId_date: { tenantId, employeeId: employee.id, date: todayDate },
        },
      })

      if (!attendance || !attendance.clockIn || attendance.clockOut) {
        return sendError(res, 'No active shift found to log idle time.', 400)
      }

      // Accept optional minutesToAdd (default 2 minutes per call)
      const minutesToAdd = typeof req.body?.minutesToAdd === 'number' && req.body.minutesToAdd > 0
        ? Math.min(req.body.minutesToAdd, 60) // cap at 60 min per call for safety
        : 2

      const updated = await prisma.attendance.update({
        where: { id: attendance.id },
        data: { idleMinutes: { increment: minutesToAdd } },
      })

      // Sync updated idle time to Google Sheet
      await syncAttendanceToGoogleSheet(updated.id).catch((err) => {
        console.error(`[GOOGLE_SHEETS_SYNC_ERROR] ${err.message}`)
      })

      console.log(`[IDLE LOG] Employee ${employee.employeeCode} +${minutesToAdd}min → idleMinutes=${updated.idleMinutes}`)
      return sendSuccess(res, { idleMinutes: updated.idleMinutes }, 'Idle time logged')
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to log idle time', 500)
    }
  },

  async resetShift(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    const { id } = req.params

    if (!tenantId && req.user?.role !== 'SUPER_ADMIN') {
      return sendError(res, 'Unauthorized', 401)
    }
    
    // Ensure only HR/ADMIN/SUPER_ADMIN can reset
    if (req.user?.role !== 'HR' && req.user?.role !== 'ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
      return sendError(res, 'Only HR or Admin can reset a shift', 403)
    }

    try {
      // Make sure the record exists
      const record = await prisma.attendance.findUnique({
        where: { id },
      })

      if (!record || (req.user?.role !== 'SUPER_ADMIN' && tenantId && record.tenantId !== tenantId)) {
        return sendError(res, 'Attendance record not found', 404)
      }

      await prisma.attendance.delete({
        where: { id },
      })

      return sendSuccess(res, null, 'Shift reset successfully')
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to reset shift', 500)
    }
  },

  async continueShift(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    const { id } = req.params

    if (!tenantId && req.user?.role !== 'SUPER_ADMIN') {
      return sendError(res, 'Unauthorized', 401)
    }

    // Ensure only HR/ADMIN/SUPER_ADMIN can resume a shift
    if (req.user?.role !== 'HR' && req.user?.role !== 'ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
      return sendError(res, 'Only HR or Admin can resume a shift', 403)
    }

    try {
      // Make sure the record exists
      const record = await prisma.attendance.findUnique({
        where: { id },
      })

      if (!record || (req.user?.role !== 'SUPER_ADMIN' && tenantId && record.tenantId !== tenantId)) {
        return sendError(res, 'Attendance record not found', 404)
      }

      if (!record.clockOut) {
        return sendError(res, 'Shift is already active (not clocked out)', 400)
      }

      // Resume the shift: set clockOut to null, totalHours to null, status to PRESENT
      const updated = await prisma.attendance.update({
        where: { id },
        data: {
          clockOut: null,
          totalHours: null,
          status: 'PRESENT',
        },
      })

      // Sync resumed shift status to Google Sheet
      await syncAttendanceToGoogleSheet(updated.id).catch((err) => {
        console.error(`[GOOGLE_SHEETS_SYNC_ERROR] ${err.message}`)
      })

      return sendSuccess(res, updated, 'Shift resumed successfully')
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to resume shift', 500)
    }
  },

  async manualClockIn(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    const { employeeId, date, clockInTime, status, notes } = req.body as {
      employeeId?: string
      date?: string
      clockInTime?: string
      status?: AttendanceStatus
      notes?: string
    }

    if (!employeeId) {
      return sendError(res, 'Employee ID is required.', 400)
    }

    try {
      const employee = await prisma.employee.findFirst({
        where: tenantId ? { id: employeeId, tenantId } : { id: employeeId },
      })
      if (!employee) {
        return sendError(res, 'Employee profile not found.', 404)
      }

      const effectiveTenantId = tenantId || employee.tenantId
      const targetDateStr = date || new Date().toISOString().split('T')[0]
      const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`)

      let clockInDate = new Date()
      if (clockInTime) {
        const [hours, minutes] = clockInTime.split(':').map(Number)
        clockInDate = new Date(targetDate)
        clockInDate.setUTCHours(hours || 0, minutes || 0, 0, 0)
      }

      const attendanceStatus = status || AttendanceStatus.PRESENT

      const existingRecord = await prisma.attendance.findUnique({
        where: {
          tenantId_employeeId_date: {
            tenantId: effectiveTenantId,
            employeeId: employee.id,
            date: targetDate,
          },
        },
      })

      if (existingRecord?.clockIn) {
        return sendError(res, 'Employee has already clocked in for this date.', 400)
      }

      const attendance = await prisma.attendance.upsert({
        where: {
          tenantId_employeeId_date: {
            tenantId: effectiveTenantId,
            employeeId: employee.id,
            date: targetDate,
          },
        },
        update: {
          clockIn: clockInDate,
          status: attendanceStatus,
          loginMethod: 'MANUAL',
          ...(notes ? { notes } : {}),
        },
        create: {
          tenantId: effectiveTenantId,
          employeeId: employee.id,
          date: targetDate,
          clockIn: clockInDate,
          status: attendanceStatus,
          loginMethod: 'MANUAL',
          ...(notes ? { notes } : {}),
        },
      })

      // Sync manual clock-in to Google Sheet
      await syncAttendanceToGoogleSheet(attendance.id).catch((err) => {
        console.error(`[GOOGLE_SHEETS_SYNC_ERROR] ${err.message}`)
      })

      return sendSuccess(res, attendance, 'Manual clock-in recorded successfully')
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to manually clock in employee', 500)
    }
  },

  async syncAllGoogleSheets(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    if (!tenantId) {
      return sendError(res, 'Unauthorized', 401)
    }

    try {
      const result = await syncAllAttendanceToGoogleSheet(tenantId)
      return sendSuccess(res, result, `Synced ${result.synced} out of ${result.total} attendance records to Google Sheets`)
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to sync all records to Google Sheets', 500)
    }
  },
}

