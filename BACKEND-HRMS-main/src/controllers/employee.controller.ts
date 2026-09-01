import { Response } from 'express'
import { prisma } from '../config/database'
import { AuthRequest } from '../middleware/auth.middleware'
import { sendError, sendSuccess } from '../utils/response.utils'
import { hashPassword } from '../utils/password.utils'
import { UserRole, EmployeeStatus, CreditType, EmploymentType, AttendanceType } from '@prisma/client'
import { EMPLOYEE_CREATION_COST } from '../services/tenant.service'

export const employeeController = {
  async getProfile(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    const userId = req.user?.id
    if (!tenantId || !userId) {
      return sendError(res, 'Context not found', 400)
    }

    try {
      const employee = await prisma.employee.findUnique({
        where: { userId },
        include: {
          department: true,
          designation: true,
          manager: { select: { firstName: true, lastName: true } },
          payrollDetails: true,
          addressInfo: true,
          emergencyContact: true,
          onboardingDocs: true,
          documents: true,
        }
      })

      if (!employee) {
        return sendError(res, 'Employee profile not found', 404)
      }

      return sendSuccess(res, employee)
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to fetch profile', 500)
    }
  },

  async uploadSignature(req: AuthRequest, res: Response) {
    const userId = req.user?.id
    const { signature } = req.body

    if (!userId) {
      return sendError(res, 'User context not found', 400)
    }
    
    if (!signature) {
      return sendError(res, 'Signature data is required', 400)
    }

    try {
      const existingEmployee = await prisma.employee.findUnique({
        where: { userId },
        select: { signature: true }
      })

      if (existingEmployee?.signature) {
        return sendError(res, 'Signature has already been uploaded and cannot be changed.', 400)
      }

      const updatedEmployee = await prisma.employee.update({
        where: { userId },
        data: { signature }
      })

      return sendSuccess(res, { signature: updatedEmployee.signature })
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to update signature', 500)
    }
  },

  async uploadPhoto(req: AuthRequest, res: Response) {
    const userId = req.user?.id
    const { photo } = req.body

    if (!userId) {
      return sendError(res, 'User context not found', 400)
    }
    
    if (!photo) {
      return sendError(res, 'Photo data is required', 400)
    }

    try {
      const existingEmployee = await prisma.employee.findUnique({
        where: { userId },
        select: { photo: true }
      })

      if (existingEmployee?.photo) {
        return sendError(res, 'Photo has already been uploaded and cannot be changed.', 400)
      }

      const updatedEmployee = await prisma.employee.update({
        where: { userId },
        data: { photo }
      })

      return sendSuccess(res, { photo: updatedEmployee.photo })
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to update photo', 500)
    }
  },

  async uploadDocumentSelf(req: AuthRequest, res: Response) {
    const userId = req.user?.id
    const { documentType } = req.body
    const file = req.file

    if (!userId) {
      return sendError(res, 'User context not found', 400)
    }
    if (!documentType || !file) {
      return sendError(res, 'Document type and file are required', 400)
    }

    try {
      const employee = await prisma.employee.findUnique({
        where: { userId }
      })
      if (!employee) {
        return sendError(res, 'Employee profile not found', 404)
      }

      const fileUrl = `/uploads/employees/${file.filename}`

      // Also copy to HR document folder and create prisma.document record
      const fs = require('fs')
      const path = require('path')
      const dirName = `${employee.firstName.replace(/\\s+/g, '')}${employee.lastName.replace(/\\s+/g, '')}_${employee.employeeCode}`
      const hrEmployeeDir = path.join(process.cwd(), 'uploads', 'documents', dirName)
      
      if (!fs.existsSync(hrEmployeeDir)) {
        fs.mkdirSync(hrEmployeeDir, { recursive: true })
      }
      
      const hrFilePath = path.join(hrEmployeeDir, file.filename)
      fs.copyFileSync(file.path, hrFilePath)
      const hrFileUrl = `/uploads/documents/${dirName}/${file.filename}`

      await prisma.document.create({
        data: {
          tenantId: employee.tenantId,
          employeeId: employee.id,
          name: file.originalname,
          type: documentType,
          fileUrl: hrFileUrl,
          fileSize: file.size,
          verified: false,
        }
      })

      // Update or create document entry
      await prisma.employeeDocument.deleteMany({
        where: { employeeId: employee.id, documentType }
      })

      const doc = await prisma.employeeDocument.create({
        data: {
          employeeId: employee.id,
          documentType,
          fileName: file.originalname,
          fileUrl,
        }
      })

      // If it's profilePhoto, also update employee.photo
      if (documentType === 'profilePhoto') {
        await prisma.employee.update({
          where: { id: employee.id },
          data: { photo: fileUrl }
        })
      }

      return sendSuccess(res, doc, 'Document uploaded successfully')
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to upload document', 500)
    }
  },

  async list(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    if (!tenantId) {
      return sendError(res, 'Tenant context not found', 400)
    }

    try {
      const whereClause: any = { tenantId }

      const employees = await prisma.employee.findMany({
        where: whereClause,
        include: {
          department: true,
          designation: true,
          manager: {
            select: { id: true, firstName: true, lastName: true },
          },
          hrUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 150,
      })

      return sendSuccess(res, employees)
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to list employee directory', 500)
    }
  },

  async create(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    if (!tenantId) {
      return sendError(res, 'Tenant context not found', 400)
    }

    const {
      employeeCode,
      firstName,
      lastName,
      email,
      phone,
      gender,
      departmentName,
      designationTitle,
      salaryGross,
      hrUserId,
    } = req.body

    if (!employeeCode || !firstName || !lastName || !email) {
      return sendError(res, 'Required fields employeeCode, firstName, lastName, email are missing.', 400)
    }

    const employeeCost = EMPLOYEE_CREATION_COST // Cost defined in tenant.service.ts

    try {
      // 1. Verify employee code/email doesn't already exist
      const [existingEmpCode, existingUser] = await Promise.all([
        prisma.employee.findUnique({
          where: { tenantId_employeeCode: { tenantId, employeeCode } },
        }),
        prisma.user.findUnique({
          where: { email },
        }),
      ])

      if (existingEmpCode) {
        return sendError(res, `Employee Code "${employeeCode}" is already in use.`, 400)
      }
      if (existingUser) {
        return sendError(res, `Email "${email}" is already registered.`, 400)
      }

      // 2. Validate tenant balance
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
      if (!tenant) {
        return sendError(res, 'Tenant company not found.', 404)
      }
      if (tenant.credits < employeeCost) {
        return sendError(res, `Insufficient credits. Adding an employee requires 🪙 ${employeeCost} credits / ₹${employeeCost} (current balance: 🪙 ${tenant.credits.toLocaleString()}).`, 400)
      }

      // Fetch HR users to assign automatically based on rule: 1-50 HR 1, 51-100 HR 2
      const hrUsers = await prisma.user.findMany({
        where: { tenantId, role: UserRole.HR },
        orderBy: { createdAt: 'asc' },
      })
      const currentEmployeeCount = await prisma.employee.count({
        where: { tenantId },
      })
      const nextIndex = currentEmployeeCount + 1

      let resolvedHrUserId = hrUserId || null
      if (req.user?.role === 'HR') {
        resolvedHrUserId = req.user.id
      } else if (!resolvedHrUserId && hrUsers.length > 0) {
        if (nextIndex <= 50) {
          resolvedHrUserId = hrUsers[0]?.id || null
        } else {
          resolvedHrUserId = hrUsers[1]?.id || hrUsers[0]?.id || null
        }
      }

      // Generate a secure temporary password
      const crypto = require('crypto')
      const tempPassword = crypto.randomBytes(6).toString('hex').toUpperCase().slice(0, 4)
        + '@' + crypto.randomBytes(4).toString('hex').slice(0, 4)
      const hashedPassword = await hashPassword(tempPassword)

      // 3. Provision User & Employee Profile in transaction with credit deduction
      const result = await prisma.$transaction(async (tx) => {
        // Resolve or create department
        let departmentId = null
        if (departmentName) {
          const dept = await tx.department.upsert({
            where: { tenantId_name: { tenantId, name: departmentName } },
            update: {},
            create: { tenantId, name: departmentName },
          })
          departmentId = dept.id
        }

        // Resolve or create designation
        let designationId = null
        if (designationTitle) {
          const des = await tx.designation.upsert({
            where: { tenantId_title_grade: { tenantId, title: designationTitle, grade: 'Standard' } },
            update: {},
            create: { tenantId, title: designationTitle, grade: 'Standard' },
          })
          designationId = des.id
        }

        // Create User (login account)
        const user = await tx.user.create({
          data: {
            email,
            password: hashedPassword,
            role: UserRole.EMPLOYEE,
            firstName,
            lastName,
            phone,
            tenantId,
          },
        })

        // Create Employee Profile
        const employee = await tx.employee.create({
          data: {
            tenantId,
            userId: user.id,
            employeeCode,
            firstName,
            lastName,
            email,
            personalEmail: personalEmail || null,
            phone,
            gender: gender || 'AGNOSTIC',
            joiningDate: new Date(),
            salaryGross: Number(salaryGross) || 30000,
            status: EmployeeStatus.ACTIVE,
            departmentId,
            designationId,
            hrUserId: resolvedHrUserId,
          },
        })

        // Debit credits
        const nextBalance = tenant.credits - employeeCost
        await tx.tenant.update({
          where: { id: tenantId },
          data: { credits: nextBalance },
        })

        await tx.creditTransaction.create({
          data: {
            tenantId,
            type: CreditType.DEBIT,
            amount: employeeCost,
            description: `Onboarded employee: ${employeeCode} (${email})`,
            balanceAfter: nextBalance,
          },
        })

        return employee
      })

      // Send credentials to personal email after successful creation
      const personalEmail = req.body.personalEmail
      if (personalEmail) {
        try {
          const { notificationService } = await import('../services/notification.service')
          const tenantRecord = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, subdomain: true } })
          const companyName = tenantRecord?.name || 'Your Company'
          const { onboardingService } = await import('../services/onboarding.service')
          const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : undefined)
          const loginUrl = onboardingService.buildCompanyPortalUrl(tenantRecord?.subdomain || undefined, origin)

          const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 0; }
    .wrapper { padding: 40px 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
    .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 40px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 26px; font-weight: 800; }
    .header p { color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 15px; }
    .content { padding: 40px; }
    .greeting { font-size: 16px; color: #334155; line-height: 1.6; margin-bottom: 24px; }
    .creds-box { background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 24px 0; }
    .creds-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 18px; }
    .cred-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
    .cred-row:last-child { border-bottom: none; }
    .cred-label { font-size: 13px; color: #64748b; font-weight: 600; }
    .cred-value { font-family: 'Courier New', monospace; font-size: 14px; font-weight: 700; color: #0f172a; background: #fff; padding: 5px 12px; border-radius: 7px; border: 1px solid #e2e8f0; }
    .pass-highlight { background: #fef3c7; border: 2px solid #fcd34d; border-radius: 12px; padding: 20px 24px; margin: 20px 0; }
    .pass-label { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #92400e; margin-bottom: 8px; }
    .pass-value { font-family: 'Courier New', monospace; font-size: 24px; font-weight: 800; color: #78350f; letter-spacing: 0.12em; }
    .warning { background: #fff1f2; border: 1px solid #fecdd3; border-radius: 10px; padding: 14px 18px; margin: 20px 0; font-size: 13px; color: #9f1239; font-weight: 600; }
    .btn { display: block; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff !important; text-decoration: none; padding: 16px 32px; border-radius: 10px; font-size: 15px; font-weight: 700; text-align: center; margin: 28px 0 0; }
    .footer { background: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>🎉 Welcome to ${companyName}</h1>
        <p>Your employee account has been created</p>
      </div>
      <div class="content">
        <p class="greeting">Hello <strong>${firstName} ${lastName}</strong>,</p>
        <p class="greeting">Your employee account has been successfully set up. Use the credentials below to log in to the HRMS portal.</p>
        <div class="creds-box">
          <div class="creds-title">Your Account Details</div>
          <div class="cred-row">
            <span class="cred-label">Employee ID</span>
            <span class="cred-value">${result.employeeCode}</span>
          </div>
          <div class="cred-row">
            <span class="cred-label">Work Email (Login)</span>
            <span class="cred-value">${email}</span>
          </div>
          <div class="cred-row">
            <span class="cred-label">Company</span>
            <span class="cred-value">${companyName}</span>
          </div>
        </div>
        <div class="pass-highlight">
          <div class="pass-label">🔑 Your Temporary Password</div>
          <div class="pass-value">${tempPassword}</div>
        </div>
        <div class="warning">⚠️ Change this password immediately after your first login.</div>
        <a href="${loginUrl}" class="btn" target="_blank">Login to HRMS Portal →</a>
      </div>
      <div class="footer">
        <p>Use your <strong>Work Email</strong> and the temporary password above to log in.</p>
        <p>&copy; 2026 ${companyName} · HRMS Enterprise</p>
      </div>
    </div>
  </div>
</body>
</html>`

          await notificationService.sendEmail(
            personalEmail,
            `Welcome to ${companyName} — Your Login Credentials`,
            emailHtml
          )
        } catch (emailErr) {
          console.error('[EMPLOYEE CREDENTIALS EMAIL ERROR]', emailErr)
        }
      }

      return sendSuccess(res, result, 'Employee profile provisioned successfully', 201)
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to onboard employee', 500)
    }
  },

  async getById(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    const { id } = req.params

    if (!tenantId || !id) {
      return sendError(res, 'Context not found', 400)
    }

    try {
      const employee = await prisma.employee.findUnique({
        where: { id },
        include: {
          department: true,
          designation: true,
          manager: { select: { id: true, firstName: true, lastName: true } },
          payrollDetails: true,
          addressInfo: true,
          emergencyContact: true,
          onboardingDocs: true,
        }
      })

      if (!employee || employee.tenantId !== tenantId) {
        return sendError(res, 'Employee not found', 404)
      }

      return sendSuccess(res, employee)
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to fetch employee details', 500)
    }
  },

  async update(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    const { id } = req.params

    if (!tenantId || !id) {
      return sendError(res, 'Context not found', 400)
    }

    try {
      const employee = await prisma.employee.findUnique({
        where: { id },
      })

      if (!employee || employee.tenantId !== tenantId) {
        return sendError(res, 'Employee not found', 404)
      }

      const data = req.body

      // Validation for UAN removed

      // Validation
      if (!data.firstName || !data.lastName || !data.workEmail) {
        return sendError(res, 'First name, last name, and work email are required.', 400)
      }

      // Check if email changed and is in use
      if (data.workEmail !== employee.email) {
        const emailInUse = await prisma.user.findFirst({
          where: {
            email: data.workEmail,
            NOT: { id: employee.userId || undefined }
          }
        })
        if (emailInUse) {
          return sendError(res, `Email "${data.workEmail}" is already in use by another account.`, 400)
        }
      }

      // Check if employeeCode changed and is in use
      if (data.employeeCode && data.employeeCode !== employee.employeeCode) {
        const empCodeInUse = await prisma.employee.findUnique({
          where: {
            tenantId_employeeCode: { tenantId, employeeCode: data.employeeCode }
          }
        })
        if (empCodeInUse) {
          return sendError(res, `Employee Code "${data.employeeCode}" is already in use by another employee.`, 400)
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        // Department upsert
        let departmentId = employee.departmentId
        if (data.departmentName) {
          const dept = await tx.department.upsert({
            where: { tenantId_name: { tenantId, name: data.departmentName } },
            update: {},
            create: { tenantId, name: data.departmentName },
          })
          departmentId = dept.id
        }

        // Designation upsert
        let designationId = employee.designationId
        if (data.designationTitle) {
          const des = await tx.designation.upsert({
            where: { tenantId_title_grade: { tenantId, title: data.designationTitle, grade: 'Standard' } },
            update: {},
            create: { tenantId, title: data.designationTitle, grade: 'Standard' },
          })
          designationId = des.id
        }

        // Update User
        if (employee.userId) {
          await tx.user.update({
            where: { id: employee.userId },
            data: {
              email: data.workEmail,
              firstName: data.firstName,
              lastName: data.lastName,
              phone: data.mobileNumber || null,
            }
          })
        }

        // Update Employee
        const emp = await tx.employee.update({
          where: { id },
          data: {
            employeeCode: data.employeeCode || employee.employeeCode,
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.workEmail,
            personalEmail: data.personalEmail || null,
            phone: data.mobileNumber || null,
            dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
            gender: data.gender || null,
            maritalStatus: data.maritalStatus || null,
            departmentId,
            designationId,
            managerId: data.reportingManagerId || null,
            salaryGross: parseFloat(data.basicSalary) || 0,
            joiningDate: data.joiningDate ? new Date(data.joiningDate) : new Date(),
            employmentType: data.employmentType || 'FULL_TIME',
            status: data.employmentStatus || 'ACTIVE',
            branchId: data.branchId || null,
            shift: data.shift || null,
            attendanceType: data.attendanceType || 'FACIAL',
            geoFencing: data.geoFencingEnabled === 'true',
            twoFactor: data.twoFactorEnabled === 'true',
            experienceLevel: data.experienceLevel || 'fresher',
          }
        })

        // Update EmployeeCredentialsAudit if it exists and code changed
        if (data.employeeCode && data.employeeCode !== employee.employeeCode) {
          await tx.employeeCredentialsAudit.updateMany({
            where: { employeeId: id },
            data: { employeeCode: data.employeeCode }
          })
        }

        // Upsert Payroll Details
        await tx.employeePayrollDetails.upsert({
          where: { employeeId: id },
          update: {
            salaryStructure: data.salaryStructure || null,
            basicSalary: parseFloat(data.basicSalary) || 0,
            paymentType: data.paymentType || null,
            bankName: data.bankName || null,
            accountNumber: data.accountNumber || null,
            ifscCode: data.ifscCode || null,
            panNumber: data.panNumber || null,
            uanNumber: data.uanNumber || null,
            pfEnabled: data.pfEnabled === 'true',
            esiEnabled: data.esiEnabled === 'true',
          },
          create: {
            employeeId: id,
            salaryStructure: data.salaryStructure || null,
            basicSalary: parseFloat(data.basicSalary) || 0,
            paymentType: data.paymentType || null,
            bankName: data.bankName || null,
            accountNumber: data.accountNumber || null,
            ifscCode: data.ifscCode || null,
            panNumber: data.panNumber || null,
            uanNumber: data.uanNumber || null,
            pfEnabled: data.pfEnabled === 'true',
            esiEnabled: data.esiEnabled === 'true',
          }
        })

        // Upsert Address
        await tx.employeeAddress.upsert({
          where: { employeeId: id },
          update: {
            country: data.country || null,
            state: data.state || null,
            city: data.city || null,
            addressLine1: data.addressLine1 || null,
            addressLine2: data.addressLine2 || null,
            postalCode: data.postalCode || null,
          },
          create: {
            employeeId: id,
            country: data.country || null,
            state: data.state || null,
            city: data.city || null,
            addressLine1: data.addressLine1 || null,
            addressLine2: data.addressLine2 || null,
            postalCode: data.postalCode || null,
          }
        })

        // Upsert Emergency Contact
        if (data.emergencyContactName && data.emergencyMobile) {
          await tx.employeeEmergencyContact.upsert({
            where: { employeeId: id },
            update: {
              name: data.emergencyContactName,
              relationship: data.emergencyRelationship || 'N/A',
              mobile: data.emergencyMobile,
            },
            create: {
              employeeId: id,
              name: data.emergencyContactName,
              relationship: data.emergencyRelationship || 'N/A',
              mobile: data.emergencyMobile,
            }
          })
        }

        // Handle File Uploads (Multer req.files)
        const uploadedFiles = (req.files || {}) as { [fieldname: string]: Express.Multer.File[] }
        for (const key of Object.keys(uploadedFiles)) {
          if (uploadedFiles[key] && uploadedFiles[key][0]) {
            const file = uploadedFiles[key][0]
            const fileUrl = `/uploads/employees/${file.filename}`

            // Delete old doc of this type
            await tx.employeeDocument.deleteMany({
              where: { employeeId: id, documentType: key }
            })

            // Create new doc of this type
            await tx.employeeDocument.create({
              data: {
                employeeId: id,
                documentType: key,
                fileName: file.originalname,
                fileUrl,
              }
            })

            // If it's profilePhoto, also update employee.photo
            if (key === 'profilePhoto') {
              await tx.employee.update({
                where: { id },
                data: { photo: fileUrl }
              })
            }
          }
        }

        return emp
      })

      return sendSuccess(res, updated, 'Employee updated successfully')
    } catch (error: any) {
      console.error('[updateEmployee error]', error)
      return sendError(res, error.message || 'Failed to update employee', 500)
    }
  },

  async delete(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    if (!tenantId) {
      return sendError(res, 'Tenant context not found', 400)
    }

    const { id } = req.params
    if (!id) return sendError(res, 'Employee ID is required', 400)

    try {
      const employee = await prisma.employee.findUnique({
        where: { id },
      })
      
      if (!employee || employee.tenantId !== tenantId) {
        return sendError(res, 'Employee not found', 404)
      }

      // Delete physical folder from disk if it exists
      try {
        const fs = require('fs')
        const path = require('path')
        const dirName = `${employee.firstName.replace(/\s+/g, '')}${employee.lastName.replace(/\s+/g, '')}_${employee.employeeCode}`
        const employeeDir = path.join(process.cwd(), 'uploads', 'documents', dirName)
        if (fs.existsSync(employeeDir)) {
          fs.rmSync(employeeDir, { recursive: true, force: true })
        }
      } catch (dirErr) {
        console.error('[DELETE EMPLOYEE FOLDER ERROR]', dirErr)
      }

      await prisma.$transaction(async (tx) => {
        // Delete the employee
        await tx.employee.delete({
          where: { id },
        })

        // Also delete the linked user account if it exists
        if (employee.userId) {
          await tx.user.delete({
            where: { id: employee.userId },
          })
        }
      })

      return sendSuccess(res, null, 'Employee deleted successfully')
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to delete employee', 500)
    }
  },

  async updateShift(req: AuthRequest, res: Response) {
    const tenantId = req.tenantId ?? req.user?.tenantId
    const { id } = req.params
    const { shift } = req.body

    if (!tenantId || !id) {
      return sendError(res, 'Context not found', 400)
    }

    try {
      const employee = await prisma.employee.findUnique({
        where: { id },
      })

      if (!employee || employee.tenantId !== tenantId) {
        return sendError(res, 'Employee not found', 404)
      }

      const updated = await prisma.employee.update({
        where: { id },
        data: { shift: shift || null }
      })

      return sendSuccess(res, updated, 'Employee shift updated successfully')
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to update employee shift', 500)
    }
  },
}
