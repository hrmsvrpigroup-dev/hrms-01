import { Request, Response } from 'express'

import { authService } from '../services/auth.service'
import { tenantService } from '../services/tenant.service'
import { prisma } from '../config/database'
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.utils'
import { sendError, sendSuccess } from '../utils/response.utils'
import { AuthRequest } from '../middleware/auth.middleware'

export const authController = {
  async login(req: Request, res: Response) {
    try {
      const { email, password, subdomain } = req.body as { email?: string; password?: string; subdomain?: string }
      if (!email || !password) {
        return sendError(res, 'Email and password are required', 422)
      }

      const { user } = await authService.login(email, password)
      
      // Subdomain-based access control removed as per user request
      // Super Admin can now log in from the main portal along with HR and Employees

      const mustResetPassword = !!user.passwordResetToken
      const payload = {
        userId: user.id,
        role: user.role,
        tenantId: user.tenantId,
        email: user.email,
      }

      return sendSuccess(
        res,
        {
          user: {
            id: user.id,
            tenantId: user.tenantId,
            tenantSubdomain: (user as any).tenant?.subdomain || null,
            email: user.email,
            role: user.role,
            firstName: user.firstName,
            lastName: user.lastName,
          },
          mustResetPassword,
          resetToken: mustResetPassword ? user.passwordResetToken : null,
          accessToken: mustResetPassword ? null : generateAccessToken(payload),
          refreshToken: mustResetPassword ? null : generateRefreshToken(payload),
        },
        'Login successful'
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed'
      return res.status(401).json({ success: false, message })
    }
  },

  async me(req: AuthRequest, res: Response) {
    if (!req.user) {
      return sendError(res, 'Unauthorized', 401)
    }

    return sendSuccess(res, req.user)
  },

  async refreshToken(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body as { refreshToken?: string }
      if (!refreshToken) {
        return sendError(res, 'Refresh token is required', 422)
      }

      const decoded = verifyRefreshToken(refreshToken)

      // Verify user still exists and is active
      const user = await prisma.user.findUnique({ where: { id: decoded.userId } })
      if (!user || !user.isActive) {
        return sendError(res, 'Unauthorized', 401)
      }

      const payload = {
        userId: user.id,
        role: user.role,
        tenantId: user.tenantId,
        email: user.email,
      }

      const newAccessToken = generateAccessToken(payload)
      const newRefreshToken = generateRefreshToken(payload)

      return sendSuccess(res, { accessToken: newAccessToken, refreshToken: newRefreshToken }, 'Token refreshed')
    } catch {
      return sendError(res, 'Invalid or expired refresh token', 401)
    }
  },

  async checkIp(req: Request, res: Response) {
    try {
      return sendSuccess(res, { hasRegistered: false })
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to check IP registration status', 500)
    }
  },

  async forgotPassword(req: Request, res: Response) {
    try {
      const { emailOrUsername } = req.body as { emailOrUsername?: string }
      if (!emailOrUsername) {
        return sendError(res, 'Email or username is required', 422)
      }

      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: { equals: emailOrUsername, mode: 'insensitive' } },
            { username: { equals: emailOrUsername, mode: 'insensitive' } },
          ],
        },
        include: {
          tenant: true,
        },
      })

      // Always return success to prevent user enumeration
      if (!user) {
        return sendSuccess(res, null, 'If that account exists, a reset link has been sent.')
      }

      const resetToken = require('crypto').randomBytes(32).toString('hex')
      const resetExpiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: resetToken,
          passwordResetExpiry: resetExpiry,
        },
      })

      const { onboardingService } = await import('../services/onboarding.service')
      const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : undefined)
      const resetLink = onboardingService.buildPasswordResetLink(resetToken, user.tenant?.subdomain || undefined, origin)
      
      const emailHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>Password Reset Request</h2>
          <p>You requested a password reset for your HRMS account.</p>
          <p>Please click the button below to reset your password. This link is valid for 1 hour.</p>
          <a href="${resetLink}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">Reset Password</a>
          <p style="font-size: 14px; color: #64748b; margin-top: 20px;">
            If the button above does not work, please copy and paste the following link into your web browser:<br><br>
            <a href="${resetLink}" target="_blank" rel="noopener noreferrer" style="color: #4f46e5; word-break: break-all;">${resetLink}</a>
          </p>
          <p style="margin-top: 30px;">If you did not request this, please ignore this email.</p>
        </div>
      `;
      
      // Log generated reset link to console for immediate operational fallback in server logs
      console.log(`[PASSWORD RESET LINK GENERATED] Target: ${user.email} | Link: ${resetLink}`)

      try {
        const { notificationService } = await import('../services/notification.service')
        await notificationService.sendEmail(user.email, 'HRMS Password Reset', emailHtml)
      } catch (emailError: any) {
        console.error(`[PASSWORD RESET EMAIL WARNING] Could not send email to ${user.email}:`, emailError.message)
      }

      return sendSuccess(res, null, 'If that account exists, a reset link has been sent.')
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to process request', 500)
    }
  },

  async resetPassword(req: Request, res: Response) {
    try {
      const { token, newPassword } = req.body as { token?: string; newPassword?: string }
      if (!token || !newPassword) {
        return sendError(res, 'Token and new password are required', 422)
      }

      if (newPassword.length < 8) {
        return sendError(res, 'Password must be at least 8 characters', 422)
      }

      const user = await prisma.user.findFirst({
        where: {
          passwordResetToken: token,
          passwordResetExpiry: { gt: new Date() },
        },
      })

      if (!user) {
        return sendError(res, 'Invalid or expired reset token', 400)
      }

      const { hashPassword } = await import('../utils/password.utils')
      const hashed = await hashPassword(newPassword)

      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashed,
          passwordResetToken: null,
          passwordResetExpiry: null,
        },
      })

      await prisma.employeeCredentialsAudit.updateMany({
        where: { employeeUserId: user.id },
        data: {
          passwordResetRequired: false,
          firstLoginCompleted: true,
          activatedAt: new Date(),
        },
      })

      return sendSuccess(res, null, 'Password reset successfully. You can now log in.')
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to reset password', 500)
    }
  },

  async register(req: Request, res: Response) {
    try {
      const { name, subdomain, adminEmail, adminUsername, username, adminFirstName, adminLastName, adminPassword, registrationDocs, phone, websiteUrl } = req.body
      const finalUsername = adminUsername || username

      if (!name || !subdomain || !adminEmail || !finalUsername || !adminFirstName || !adminLastName) {
        return sendError(res, 'All registration fields (company name, subdomain, email, username, name) must be provided.', 400)
      }

      // Create Tenant with initial 50,000 credits
      const tenant = await tenantService.createTenant({
        name,
        subdomain,
        adminEmail,
        adminUsername: finalUsername,
        adminFirstName,
        adminLastName,
        adminPassword: adminPassword || undefined,
        phone: phone || undefined,
        websiteUrl: websiteUrl || undefined,
        initialCredits: 1000, // Initial credits (1 credit = ₹1)
        registrationDocs: registrationDocs || [],
      })

      return sendSuccess(res, tenant, 'Registration successful! Your company is pending approval from the Super Admin.', 201)
    } catch (error: any) {
      return sendError(res, error.message || 'Registration failed', 400)
    }
  },
}
