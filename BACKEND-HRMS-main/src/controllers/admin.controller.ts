import { Response } from 'express'
import { prisma } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'
import { sendError, sendSuccess } from '../utils/response.utils'
import { creditService } from '../services/credit.service'
import { hashPassword } from '../utils/password.utils'
import { UserRole, CreditType } from '@prisma/client'

export const adminController = {
  async dashboard(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    if (!tenantId) {
      return sendError(res, 'Tenant context not found', 400)
    }

    try {
      const now = new Date()
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

      const [employeesCount, hrsCount, tenant, pendingInvitations, recentCredits, recentAudits, recentEmployees] = await Promise.all([
        prisma.employee.count({ where: { tenantId, status: 'ACTIVE' } }),
        prisma.user.count({ where: { tenantId, role: UserRole.HR } }),
        prisma.tenant.findUnique({ where: { id: tenantId }, select: { credits: true, status: true, name: true } }),
        prisma.onboardingInvite.count({ where: { tenantId, status: 'pending' } }),
        prisma.creditTransaction.findMany({ 
          where: { tenantId, type: 'CREDIT', createdAt: { gte: firstDayOfMonth } }
        }),
        prisma.auditLog.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take: 3
        }),
        prisma.employee.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { firstName: true, lastName: true, createdAt: true, employeeCode: true }
        })
      ])

      const creditsThisMonth = recentCredits.reduce((acc, curr) => acc + curr.amount, 0)

      // Build activity feed
      let activityFeed: Array<{ type: string; title: string; subtitle: string; time: string }> = []
      recentEmployees.forEach(emp => {
        activityFeed.push({
          type: 'employee',
          title: 'Employee onboarded',
          subtitle: `${emp.firstName} ${emp.lastName} (${emp.employeeCode}) joined.`,
          time: emp.createdAt.toISOString()
        })
      })
      recentAudits.forEach(audit => {
        activityFeed.push({
          type: 'audit',
          title: audit.action,
          subtitle: audit.entity ? `Entity: ${audit.entity}` : 'System action performed.',
          time: audit.createdAt.toISOString()
        })
      })
      
      // Sort activity feed by date desc, take 5
      activityFeed.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      activityFeed = activityFeed.slice(0, 5)

      // Simulate headcount trend for last 7 days based on current employee count
      // In a real app, you'd calculate historical headcount per day.
      const headcountTrend = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - (6 - i))
        return {
          date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          headcount: employeesCount > i ? employeesCount - (6 - i) : employeesCount
        }
      })

      return sendSuccess(res, {
        employeesCount,
        hrsCount,
        creditsBalance: tenant?.credits ?? 0,
        companyName: tenant?.name ?? '',
        status: tenant?.status ?? 'ACTIVE',
        pendingInvitations,
        creditsThisMonth,
        activityFeed,
        headcountTrend
      })
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to fetch dashboard data', 500)
    }
  },

  async listHRs(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    if (!tenantId) {
      return sendError(res, 'Tenant context not found', 400)
    }

    try {
      const hrs = await prisma.user.findMany({
        where: { tenantId, role: UserRole.HR },
        include: {
          hrProfile: true,
        },
        orderBy: { createdAt: 'desc' },
      })
      return sendSuccess(res, hrs)
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to fetch HR list', 500)
    }
  },

  async createHR(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    if (!tenantId) {
      return sendError(res, 'Tenant context not found', 400)
    }

    const { email, password, firstName, lastName, department, employeeLimit } = req.body

    if (!email || !password || !firstName || !lastName) {
      return sendError(res, 'Required fields email, password, firstName, lastName are missing.', 400)
    }

    const hrCost = 20 // HR creation costs 20 credits (₹20)

    try {
      // 1. Check if email is already taken
      const existingUser = await prisma.user.findUnique({ where: { email } })
      if (existingUser) {
        return sendError(res, `Email "${email}" is already registered.`, 400)
      }

      // 2. Validate tenant credit balance
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
      if (!tenant) {
        return sendError(res, 'Tenant company not found.', 404)
      }
      if (tenant.credits < hrCost) {
        return sendError(res, `Insufficient credits. Provisioning an HR account requires 🪙 ${hrCost} credits / ₹${hrCost} (current balance: 🪙 ${tenant.credits.toLocaleString()}).`, 400)
      }

      const hashedPassword = await hashPassword(password)

      // 3. Create HR in a transaction along with credit debit
      const result = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email,
            password: hashedPassword,
            role: UserRole.HR,
            firstName,
            lastName,
            tenantId,
          },
        })

        await tx.hRProfile.create({
          data: {
            userId: newUser.id,
            tenantId,
            department: department || 'Human Resources',
            employeeLimit: Number(employeeLimit) || 25,
          },
        })

        // Debit credits
        const nextBalance = tenant.credits - hrCost
        await tx.tenant.update({
          where: { id: tenantId },
          data: { credits: nextBalance },
        })

        await tx.creditTransaction.create({
          data: {
            tenantId,
            type: CreditType.DEBIT,
            amount: hrCost,
            description: `Provisioned HR account: ${email}`,
            balanceAfter: nextBalance,
          },
        })

        return newUser
      })

      return sendSuccess(res, result, 'HR account provisioned successfully', 201)
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to provision HR account', 500)
    }
  },

  async deleteHR(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    if (!tenantId) {
      return sendError(res, 'Tenant context not found', 400)
    }

    const { id } = req.params

    try {
      // Verify the HR belongs to this tenant
      const hrUser = await prisma.user.findFirst({
        where: { id, tenantId, role: UserRole.HR },
        include: { hrProfile: true },
      })

      if (!hrUser) {
        return sendError(res, 'HR account not found or does not belong to this company.', 404)
      }

      // Delete in transaction: sessions → hrProfile → user
      await prisma.$transaction(async (tx) => {
        // Delete sessions
        await tx.session.deleteMany({ where: { userId: id } })

        // Delete HR profile
        if (hrUser.hrProfile) {
          await tx.hRProfile.delete({ where: { userId: id } })
        }

        // Delete the user
        await tx.user.delete({ where: { id } })
      })

      return sendSuccess(res, null, `HR account "${hrUser.firstName} ${hrUser.lastName}" deleted successfully.`)
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to delete HR account', 500)
    }
  },

  // Provision HR Operator Module Controllers
  async provisionHROperator(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    if (!tenantId) {
      return sendError(res, 'Tenant context not found', 400)
    }

    try {
      // Validate inputs
      const { 
        firstName, lastName, email, mobileNumber, 
        departmentId, roleId, reportingManagerId, branchId, 
        joiningDate, shift, employmentStatus, 
        twoFactorEnabled, permissions, sendActivationEmail 
      } = req.body

      if (!email || !firstName || !lastName) {
        return sendError(res, 'First name, last name, and email are required.', 400)
      }

      // Check if email is already taken
      const existingUser = await prisma.user.findUnique({ where: { email } })
      if (existingUser) {
        return sendError(res, `Email "${email}" is already registered.`, 400)
      }

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
      if (!tenant) return sendError(res, 'Tenant not found', 404)

      // Auto-generate HR ID (e.g., HR-1001)
      const lastOperator = await prisma.hROperator.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' }
      })
      let newHrId = 'HR-1001'
      if (lastOperator && lastOperator.hrId.startsWith('HR-')) {
        const lastNumber = parseInt(lastOperator.hrId.replace('HR-', ''), 10)
        if (!isNaN(lastNumber)) {
          newHrId = `HR-${lastNumber + 1}`
        }
      }

      // Handle Profile Picture
      let profilePicture = null
      if (req.file) {
        profilePicture = `/uploads/profiles/${req.file.filename}`
      }

      // Generate a secure random password if we are sending an activation email
      // They will reset this password on their first login via the activation link
      const tempPassword = Math.random().toString(36).slice(-10) + 'A1!'
      const hashedPassword = await hashPassword(tempPassword)

      // Use a transaction to ensure all records are created atomically
      const result = await prisma.$transaction(async (tx) => {
        // 1. Create User for Authentication
        const newUser = await tx.user.create({
          data: {
            email,
            password: hashedPassword,
            role: UserRole.HR,
            firstName,
            lastName,
            tenantId,
            phone: mobileNumber
          }
        })

        // 2. Create detailed HR Operator Profile
        const newOperator = await tx.hROperator.create({
          data: {
            tenantId,
            userId: newUser.id,
            hrId: newHrId,
            firstName,
            lastName,
            email,
            mobileNumber,
            profilePicture,
            departmentId: departmentId || null,
            roleId: roleId || null,
            reportingManagerId: reportingManagerId || null,
            branchId: branchId || null,
            joiningDate: new Date(joiningDate || Date.now()),
            shift: shift || 'General Shift',
            employmentStatus: employmentStatus || 'ACTIVE',
            twoFactorEnabled: twoFactorEnabled === 'true' || twoFactorEnabled === true,
          }
        })

        // 3. Map Permissions
        let parsedPermissions = []
        try {
          if (typeof permissions === 'string') {
            parsedPermissions = JSON.parse(permissions)
          } else if (Array.isArray(permissions)) {
            parsedPermissions = permissions
          }
        } catch (e) {
          console.warn("Could not parse permissions array")
        }

        if (parsedPermissions && parsedPermissions.length > 0) {
          const permissionMapping = parsedPermissions.map((permId: string) => ({
            hrOperatorId: newOperator.id,
            permissionId: permId
          }))
          await tx.hROperatorPermission.createMany({
            data: permissionMapping,
            skipDuplicates: true
          })
        }

        // 4. Create Audit Log
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: req.user?.id,
            action: 'PROVISION_HR_OPERATOR',
            entity: 'HROperator',
            entityId: newOperator.id,
            details: { hrId: newHrId, email, roleId }
          }
        })

        return newOperator
      })

      // 5. Send Activation Email with Temporary Password
      if (sendActivationEmail === 'true' || sendActivationEmail === true) {
        const { notificationService } = require('../services/notification.service')
        const crypto = require('crypto')

        // Generate activation token (for password reset link as backup)
        const activationToken = crypto.randomBytes(32).toString('hex')
        const resetExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

        await prisma.user.update({
          where: { email },
          data: {
            passwordResetToken: activationToken,
            passwordResetExpiry: resetExpiry,
          }
        })

        let roleName = 'HR Operator'
        if (roleId) {
          const roleRecord = await prisma.role.findUnique({ where: { id: roleId } })
          if (roleRecord) roleName = roleRecord.name
        }

        const { onboardingService } = await import('../services/onboarding.service')
        const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : undefined)
        const loginUrl = onboardingService.buildCompanyPortalUrl(tenant?.subdomain || undefined, origin)

        const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your HR Account is Ready</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 0; }
    .wrapper { padding: 40px 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 40px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 24px; font-weight: 800; }
    .header p { color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 15px; }
    .content { padding: 40px; }
    .greeting { font-size: 17px; color: #334155; margin-bottom: 20px; line-height: 1.6; }
    .creds-box { background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 24px 0; }
    .creds-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 16px; }
    .cred-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
    .cred-row:last-child { border-bottom: none; }
    .cred-label { font-size: 14px; color: #64748b; font-weight: 500; }
    .cred-value { font-family: 'Courier New', monospace; font-size: 15px; font-weight: 700; color: #0f172a; background: #fff; padding: 4px 10px; border-radius: 6px; border: 1px solid #e2e8f0; }
    .temp-pass-highlight { background: #fef3c7; border: 1.5px solid #fcd34d; border-radius: 12px; padding: 16px 20px; margin: 20px 0; display: flex; align-items: center; gap: 12px; }
    .temp-pass-highlight .icon { font-size: 1.5rem; }
    .temp-pass-highlight .text { font-size: 14px; color: #92400e; font-weight: 600; }
    .temp-pass-highlight .pass { font-family: monospace; font-size: 20px; font-weight: 800; color: #78350f; letter-spacing: 0.1em; display: block; margin-top: 4px; }
    .warning-box { background: #fff1f2; border: 1px solid #fecdd3; border-radius: 10px; padding: 14px 18px; margin: 20px 0; font-size: 14px; color: #9f1239; font-weight: 600; }
    .btn { display: block; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff !important; text-decoration: none; padding: 14px 30px; border-radius: 10px; font-size: 15px; font-weight: 700; text-align: center; margin: 28px 0 0; box-shadow: 0 6px 20px rgba(79,70,229,0.3); }
    .footer { background: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 13px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>🎉 Welcome to ${tenant.name}</h1>
        <p>Your HR Operator account has been provisioned</p>
      </div>
      <div class="content">
        <p class="greeting">Hello <strong>${firstName} ${lastName}</strong>,</p>
        <p class="greeting">Your HR Operator account has been successfully created. Below are your login credentials to access the HRMS portal.</p>

        <div class="creds-box">
          <div class="creds-title">Your Account Details</div>
          <div class="cred-row">
            <span class="cred-label">HR ID</span>
            <span class="cred-value">${newHrId}</span>
          </div>
          <div class="cred-row">
            <span class="cred-label">Role</span>
            <span class="cred-value">${roleName}</span>
          </div>
          <div class="cred-row">
            <span class="cred-label">Company</span>
            <span class="cred-value">${tenant.name}</span>
          </div>
          <div class="cred-row">
            <span class="cred-label">Login Email</span>
            <span class="cred-value">${email}</span>
          </div>
        </div>

        <div class="temp-pass-highlight">
          <div class="icon">🔑</div>
          <div class="text">
            Your Temporary Password
            <span class="pass">${tempPassword}</span>
          </div>
        </div>

        <div class="warning-box">
          ⚠️ This is a temporary password. You must change it immediately after your first login for security purposes.
        </div>

        <a href="${loginUrl}" class="btn" target="_blank">Login to HRMS Portal →</a>
      </div>
      <div class="footer">
        <p>If you did not expect this email, please contact your administrator immediately.</p>
        <p>&copy; 2026 ${tenant.name} · HRMS Enterprise</p>
      </div>
    </div>
  </div>
</body>
</html>`

        await notificationService.sendEmail(
          email,
          `Your HR Account is Ready — ${tenant.name}`,
          htmlBody
        )
      }

      return sendSuccess(res, result, 'HR Operator provisioned successfully', 201)
    } catch (error: any) {
      console.error(error)
      return sendError(res, error.message || 'Failed to provision HR Operator', 500)
    }
  },

  async getDepartments(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    if (!tenantId) return sendError(res, 'Tenant context not found', 400)
    try {
      let departments = await prisma.department.findMany({ where: { tenantId } })
      if (departments.length === 0) {
        // Auto-seed default departments
        await prisma.department.createMany({
          data: [
            { tenantId, name: 'Human Resources' },
            { tenantId, name: 'Engineering' },
            { tenantId, name: 'Sales & Marketing' },
            { tenantId, name: 'Finance' },
            { tenantId, name: 'Operations' },
          ],
          skipDuplicates: true
        })
        departments = await prisma.department.findMany({ where: { tenantId } })
      }
      return sendSuccess(res, departments)
    } catch (err: any) {
      return sendError(res, err.message, 500)
    }
  },

  async getBranches(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    if (!tenantId) return sendError(res, 'Tenant context not found', 400)
    try {
      let branches = await prisma.branch.findMany({ where: { tenantId } })
      if (branches.length === 0) {
        // Auto-seed default branches
        await prisma.branch.createMany({
          data: [
            { tenantId, name: 'Headquarters' },
            { tenantId, name: 'Regional Office' },
          ],
          skipDuplicates: true
        })
        branches = await prisma.branch.findMany({ where: { tenantId } })
      }
      return sendSuccess(res, branches)
    } catch (err: any) {
      return sendError(res, err.message, 500)
    }
  },

  async getRoles(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    if (!tenantId) return sendError(res, 'Tenant context not found', 400)
    try {
      let roles = await prisma.role.findMany({ where: { tenantId } })
      if (roles.length === 0) {
        // Auto-seed default roles
        await prisma.role.createMany({
          data: [
            { tenantId, name: 'HR Manager' },
            { tenantId, name: 'HR Operator' },
            { tenantId, name: 'Recruiter' },
            { tenantId, name: 'Payroll Executive' },
          ],
          skipDuplicates: true
        })
        roles = await prisma.role.findMany({ where: { tenantId } })
      }
      return sendSuccess(res, roles)
    } catch (err: any) {
      return sendError(res, err.message, 500)
    }
  },

  async getPermissions(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    if (!tenantId) return sendError(res, 'Tenant context not found', 400)
    try {
      let permissions = await prisma.permission.findMany({ where: { tenantId } })
      if (permissions.length === 0) {
        // Auto-seed default permissions
        await prisma.permission.createMany({
          data: [
            { tenantId, name: 'Employee Management', module: 'Employee' },
            { tenantId, name: 'Attendance', module: 'Attendance' },
            { tenantId, name: 'Payroll', module: 'Payroll' },
            { tenantId, name: 'Recruitment', module: 'Recruitment' },
            { tenantId, name: 'Leave Management', module: 'Leave' },
            { tenantId, name: 'Reports', module: 'Reports' },
          ],
          skipDuplicates: true
        })
        permissions = await prisma.permission.findMany({ where: { tenantId } })
      }
      return sendSuccess(res, permissions)
    } catch (err: any) {
      return sendError(res, err.message, 500)
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
        where: {
          tenantId,
          date: { gte: startDate, lt: endDate },
          status: 'PRESENT'
        }
      })

      const leaves = await prisma.leave.findMany({
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

      const summary: Record<string, { activeCount: number, leaveCount: number }> = {}
      
      const daysInMonth = new Date(Number(year), Number(month), 0).getDate()
      for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(Date.UTC(Number(year), Number(month) - 1, i))
        const dateStr = d.toISOString().split('T')[0]
        summary[dateStr] = { activeCount: 0, leaveCount: 0 }
      }

      attendances.forEach(att => {
        const dateStr = att.date.toISOString().split('T')[0]
        if (summary[dateStr]) {
          summary[dateStr].activeCount += 1
        }
      })

      leaves.forEach(leave => {
        const start = leave.fromDate < startDate ? startDate : leave.fromDate
        const end = leave.toDate >= endDate ? new Date(endDate.getTime() - 1) : leave.toDate
        
        let curr = new Date(start)
        while (curr <= end) {
          const dateStr = curr.toISOString().split('T')[0]
          if (summary[dateStr]) {
            summary[dateStr].leaveCount += 1
          }
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
          where: {
            tenantId,
            date: { gte: targetDate, lt: nextDate },
            status: 'PRESENT'
          },
          include: {
            employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, photo: true, department: { select: { name: true } } } }
          }
        })
        employees = attendances.map(a => ({
          ...a.employee,
          clockIn: a.clockIn,
          clockOut: a.clockOut
        })).filter(e => e.id)
      } else if (type === 'leave') {
        const leaves = await prisma.leave.findMany({
          where: {
            tenantId,
            status: 'APPROVED',
            fromDate: { lte: targetDate },
            toDate: { gte: targetDate }
          },
          include: {
            employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, photo: true, department: { select: { name: true } } } }
          }
        })
        employees = leaves.map(l => l.employee).filter(Boolean)
      } else if (type === 'inactive') {
        // Inactive refers to absent/unmarked employees for the day
        const allEmployees = await prisma.employee.findMany({
          where: { tenantId, status: 'ACTIVE' },
          select: { id: true, employeeCode: true, firstName: true, lastName: true, photo: true, department: { select: { name: true } } }
        })

        const presentOrLeaveAttendances = await prisma.attendance.findMany({
          where: {
            tenantId,
            date: { gte: targetDate, lt: nextDate },
            status: { in: ['PRESENT', 'ON_LEAVE'] }
          },
          select: { employeeId: true }
        })

        const approvedLeaves = await prisma.leave.findMany({
          where: {
            tenantId,
            status: 'APPROVED',
            fromDate: { lte: targetDate },
            toDate: { gte: targetDate }
          },
          select: { employeeId: true }
        })

        const activeEmpIds = new Set([
          ...presentOrLeaveAttendances.map(a => a.employeeId),
          ...approvedLeaves.map(l => l.employeeId)
        ])

        employees = allEmployees.filter(emp => !activeEmpIds.has(emp.id))
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
          attendance: {
            orderBy: { date: 'asc' },
            select: { date: true, clockIn: true, clockOut: true, totalHours: true, status: true }
          },
          tasks: {
            select: { id: true, title: true, status: true, dueDate: true, createdAt: true },
          },
          leaves: {
            select: { id: true, type: true, status: true, fromDate: true, toDate: true, days: true },
          },
          payroll: {
            orderBy: { year: 'desc' },
            take: 6,
            select: { month: true, year: true, netSalary: true, basicSalary: true, status: true }
          }
        }
      })

      if (!employee || employee.tenantId !== tenantId) {
        return sendError(res, 'Employee not found', 404)
      }

      // --- Attendance Analytics ---
      const totalDays = employee.attendance.length
      const presentDays = employee.attendance.filter(a => a.status === 'PRESENT').length
      const absentDays = employee.attendance.filter(a => a.status === 'ABSENT').length
      const leaveDays = employee.attendance.filter(a => a.status === 'ON_LEAVE').length
      const lateDays = employee.attendance.filter(a => a.status === 'LATE').length
      const halfDays = employee.attendance.filter(a => a.status === 'HALF_DAY').length

      // Late logins: clock in after 09:30
      const lateLogins = employee.attendance.filter(a => {
        if (!a.clockIn) return false
        const d = new Date(a.clockIn)
        return (d.getUTCHours() > 9 || (d.getUTCHours() === 9 && d.getUTCMinutes() > 30))
      }).length

      // Early logins: clock in before 08:30
      const earlyLogins = employee.attendance.filter(a => {
        if (!a.clockIn) return false
        const d = new Date(a.clockIn)
        return (d.getUTCHours() < 8 || (d.getUTCHours() === 8 && d.getUTCMinutes() <= 30))
      }).length

      // Avg working hours
      const hoursRecords = employee.attendance.filter(a => a.totalHours && a.totalHours > 0)
      const avgHours = hoursRecords.length > 0
        ? (hoursRecords.reduce((sum, a) => sum + (a.totalHours || 0), 0) / hoursRecords.length)
        : 0

      // Attendance percentage
      const attendancePercent = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0

      // --- Task Analytics ---
      const totalTasks = employee.tasks.length
      const doneTasks = employee.tasks.filter(t => t.status === 'DONE').length
      const inProgressTasks = employee.tasks.filter(t => t.status === 'IN_PROGRESS').length
      const pendingTasks = employee.tasks.filter(t => t.status === 'PENDING').length

      const overdueTasksCount = employee.tasks.filter(t => {
        if (!t.dueDate) return false
        return new Date(t.dueDate) < new Date() && t.status !== 'DONE'
      }).length

      const onTimeTasksCount = employee.tasks.filter(t => {
        if (!t.dueDate || t.status !== 'DONE') return false
        return true
      }).length

      const taskCompletionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

      // --- Leave Analytics ---
      const approvedLeaves = employee.leaves.filter(l => l.status === 'APPROVED')
      const totalLeaveDaysTaken = approvedLeaves.reduce((sum, l) => sum + l.days, 0)

      // Monthly attendance summary (last 6 months)
      const now = new Date()
      const monthlyAttendance = Array.from({ length: 6 }).map((_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
        const monthName = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
        const monthRecords = employee.attendance.filter(a => {
          const aDate = new Date(a.date)
          return aDate.getMonth() === d.getMonth() && aDate.getFullYear() === d.getFullYear()
        })
        const monthPresent = monthRecords.filter(a => a.status === 'PRESENT').length
        return { month: monthName, present: monthPresent, total: monthRecords.length }
      })

      const portfolioData = {
        employee: {
          id: employee.id,
          employeeCode: employee.employeeCode,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
          phone: employee.phone,
          photo: employee.photo,
          gender: employee.gender,
          dateOfBirth: employee.dateOfBirth,
          joiningDate: employee.joiningDate,
          status: employee.status,
          employmentType: employee.employmentType,
          salaryGross: employee.salaryGross,
          department: employee.department?.name,
          designation: employee.designation?.title,
          manager: employee.manager ? `${employee.manager.firstName} ${employee.manager.lastName}` : null,
          branch: employee.branch?.name,
        },
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
        taskStats: {
          totalTasks,
          doneTasks,
          inProgressTasks,
          pendingTasks,
          overdueTasksCount,
          onTimeTasksCount,
          taskCompletionRate,
          recentTasks: employee.tasks.slice(-10).reverse()
        },
        leaveStats: {
          totalLeaveRequests: employee.leaves.length,
          approvedLeaves: approvedLeaves.length,
          totalLeaveDaysTaken,
          leaveBreakdown: employee.leaves
        },
        payrollHistory: employee.payroll
      }

      return sendSuccess(res, portfolioData)
    } catch (err: any) {
      return sendError(res, err.message, 500)
    }
  },
}
