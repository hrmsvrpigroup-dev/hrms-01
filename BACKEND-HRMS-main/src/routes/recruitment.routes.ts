import { Router } from 'express'

import { recruitmentController } from '../controllers/recruitment.controller'
import { authenticate } from '../middleware/auth.middleware'
import { authorize } from '../middleware/rbac.middleware'
import { tenantIsolation } from '../middleware/tenant.middleware'

const router = Router()

// Public real-time Google Form/Sheet response poll route
router.get('/live-google-responses', recruitmentController.fetchLiveSheetData)

router.use(authenticate, authorize('ADMIN', 'HR'), tenantIsolation)
router.get('/jobs', recruitmentController.jobs)
router.post('/jobs', recruitmentController.createJob)
router.patch('/jobs/:id/status', recruitmentController.updateJobStatus)
router.post('/applications', recruitmentController.createApplication)
router.patch('/applications/:id/status', recruitmentController.updateApplicationStatus)
router.patch('/applications/:id/ai-screen', recruitmentController.aiScreenCandidate)
router.patch('/applications/:id/interview', recruitmentController.scheduleInterview)
router.patch('/applications/:id/offer', recruitmentController.manageOffer)
router.patch('/applications/:id/documents-verify', recruitmentController.verifyDocuments)
router.post('/applications/:id/onboard', recruitmentController.initiateOnboarding)
router.post('/applications/:id/attachments', recruitmentController.addAttachment)
router.post('/applications/:id/attachments/remove', recruitmentController.removeAttachment)
router.delete('/applications/:id', recruitmentController.deleteApplication)
router.post('/sync-google-responses', recruitmentController.syncGoogleResponses)
router.get('/files/drive-proxy', recruitmentController.driveProxy)

export default router

