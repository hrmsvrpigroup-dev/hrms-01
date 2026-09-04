import api from './axios'

export type Employee = {
  id: string
  employeeCode: string
  firstName: string
  lastName: string
  email: string
  personalEmail?: string
  phone?: string
  gender?: string
  joiningDate: string
  salaryGross: number
  status: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE' | 'TERMINATED'
  department?: {
    name: string
  }
  designation?: {
    title: string
  }
  manager?: {
    firstName: string
    lastName: string
  }
  hrUser?: {
    firstName: string
    lastName: string
  }
}

export const employeeApi = {
  list: () => api.get<{ success: boolean; data: Employee[] }>('/employees'),
  create: (data: {
    employeeCode: string
    firstName: string
    lastName: string
    email: string
    phone?: string
    gender?: string
    departmentName?: string
    designationTitle?: string
    salaryGross?: number
    hrUserId?: string
  }) => api.post<{ success: boolean; data: Employee }>('/employees', data),
  delete: (id: string) => api.delete<{ success: boolean; data: any }>(`/employees/${id}`),
  getProfile: () => api.get<{ success: boolean; data: any }>('/employees/me'),
  updateSignature: (signature: string) => api.put<{ success: boolean; data: { signature: string; signatureUploadCount?: number } }>('/employees/me/signature', { signature }),
  updatePhoto: (photo: string) => api.put<{ success: boolean; data: { photo: string; photoUploadCount?: number } }>('/employees/me/photo', { photo }),
  getById: (id: string) => api.get<{ success: boolean; data: any }>(`/employees/${id}`),
  update: (id: string, formData: FormData) => api.put<{ success: boolean; data: any }>(`/employees/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  updateShift: (id: string, shift: string) => api.put<{ success: boolean; data: any }>(`/employees/${id}/shift`, { shift }),
  uploadDocument: (formData: FormData) => api.post<{ success: boolean; data: any }>('/employees/me/documents', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getRequests: () => api.get<{ success: boolean; data: any[] }>('/employees/requests'),
  createRequest: (data: { type: string, priority: string, description: string }) => api.post<{ success: boolean; data: any }>('/employees/requests', data),
  deleteRequest: (id: string) => api.delete<{ success: boolean; data: any }>(`/employees/requests/${id}`),
}
