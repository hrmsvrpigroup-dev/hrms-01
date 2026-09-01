import { Router } from 'express'

import { hrController } from '../controllers/hr.controller'
import { hrOnboardingController } from '../controllers/hr.onboarding.controller'
import { authenticate } from '../middleware/auth.middleware'
import { authorize } from '../middleware/rbac.middleware'
import { tenantIsolation } from '../middleware/tenant.middleware'
import multer from 'multer'
import path from 'path'
import fs from 'fs'

// Setup multer for documents
const uploadDir = path.join(process.cwd(), 'uploads', 'employees')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: function (req: any, file: any, cb: any) {
    cb(null, uploadDir)
  },
  filename: function (req: any, file: any, cb: any) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
  },
})

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
})

const router = Router()

router.use(authenticate, authorize('HR'), tenantIsolation)
router.get('/dashboard', hrController.dashboard)

// Employee Onboarding
router.post('/employees/onboard', upload.fields([
  { name: 'aadhaarCard', maxCount: 1 },
  { name: 'panCard', maxCount: 1 },
  { name: 'resume', maxCount: 1 },
  { name: 'offerLetter', maxCount: 1 },
  { name: 'educationalCertificates', maxCount: 5 },
  { name: 'experienceLetters', maxCount: 5 },
  { name: 'profilePhoto', maxCount: 1 },
  { name: 'previousPayslips', maxCount: 1 }
]), hrOnboardingController.onboardEmployee)

// Verification Panel
router.get('/verifications', hrOnboardingController.getVerifications)
router.post('/verifications/:id/:action', hrOnboardingController.updateVerificationAction)

// Attendance Calendar
router.get('/attendance-summary', hrController.getAttendanceCalendarSummary)
router.get('/attendance/details', hrController.getAttendanceDetails)
router.get('/monthly-report', hrController.getMonthlyReport)
router.get('/employees/:id/portfolio', hrController.getEmployeePortfolio)

export default router

