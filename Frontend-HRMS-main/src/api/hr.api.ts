import api from './axios'

export type HRDashboardData = {
  assignedEmployeeCount: number
  totalEmployees: number
  pendingLeavesCount: number
  creditsBalance: number
  companyName: string
}

export const hrApi = {
  async getDashboard() {
    const response = await api.get<{ success: boolean; data: HRDashboardData }>('/hr/dashboard')
    return response.data.data
  },

  getEmployees: async () => {
    const response = await api.get('/employees')
    return response.data
  },
  
  onboardEmployee: async (formData: FormData) => {
    const response = await api.post('/hr/employees/onboard', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response.data
  },
  
  getVerifications: async () => {
    const response = await api.get('/hr/verifications')
    return response.data
  },
  
  updateVerificationAction: async (id: string, action: string, notes?: string, reason?: string) => {
    const response = await api.post(`/hr/verifications/${id}/${action}`, { notes, reason })
    return response.data
  },

  getAttendanceSummary: async (year: number, month: number) => {
    const response = await api.get<{ success: boolean; data: Record<string, { activeCount: number; leaveCount: number }> }>(
      `/hr/attendance-summary?year=${year}&month=${month}`
    )
    return response.data.data
  },

  getAttendanceDetails: async (date: string, type: 'active' | 'leave' | 'inactive') => {
    const response = await api.get<{ success: boolean; data: any[] }>(`/hr/attendance/details?date=${date}&type=${type}`)
    return response.data.data
  },

  getEmployeePortfolio: async (id: string) => {
    const response = await api.get<{ success: boolean; data: any }>(`/hr/employees/${id}/portfolio`)
    return response.data.data
  },

  getMonthlyReport: async (year: number, month: number) => {
    const response = await api.get<{ success: boolean; data: any }>(`/hr/monthly-report?year=${year}&month=${month}`)
    return response.data.data
  },
}
