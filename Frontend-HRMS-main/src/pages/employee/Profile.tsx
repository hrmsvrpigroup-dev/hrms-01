import React, { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/auth.store'
import { User, Shield, Briefcase, Landmark, Save, Phone, MapPin, Mail, Award, CheckCircle, Download, Upload } from 'lucide-react'
import { employeeApi } from '../../api/employee.api'
import html2canvas from 'html2canvas'
import { triggerHrNotification } from '../../utils/notif'

interface ProfileData {
  phone: string
  address: string
  emergencyName: string
  emergencyRelation: string
  emergencyPhone: string
  bankName: string
  bankAccount: string
  bankIfsc: string
  manualEmployeeId: string
  manualBloodGroup: string
}

export default function Profile() {
  const user = useAuthStore((state) => state.user)
  const [activeTab, setActiveTab] = useState<'PERSONAL' | 'JOB' | 'BANK' | 'IDCARD'>('PERSONAL')
  const [success, setSuccess] = useState(false)
  const [employeeDetails, setEmployeeDetails] = useState<any>(null)
  const [isUploading, setIsUploading] = useState(false)

  // Profile data state
  const [profile, setProfile] = useState<ProfileData>({
    phone: '',
    address: '',
    emergencyName: '',
    emergencyRelation: '',
    emergencyPhone: '',
    bankName: '',
    bankAccount: '',
    bankIfsc: '',
    manualEmployeeId: '',
    manualBloodGroup: '',
  })

  const [initialProfile, setInitialProfile] = useState<ProfileData | null>(null)

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await employeeApi.getProfile()
        const emp = res.data.data
        setEmployeeDetails(emp)
        const initialData = {
          phone: emp.phone || '',
          address: emp.addressInfo?.currentAddress || emp.address || '',
          emergencyName: emp.emergencyContact?.name || '',
          emergencyRelation: emp.emergencyContact?.relationship || '',
          emergencyPhone: emp.emergencyContact?.phone || '',
          bankName: emp.payrollDetails?.bankName || '',
          bankAccount: emp.payrollDetails?.accountNumber || '',
          bankIfsc: emp.payrollDetails?.ifscCode || '',
          manualEmployeeId: emp.employeeCode || 'EMP-1001',
          manualBloodGroup: emp.bloodGroup || '',
        }
        setProfile(initialData)
        setInitialProfile(initialData)
      } catch (err) {
        console.error('Failed to fetch profile', err)
      }
    }
    fetchProfile()
  }, [])

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setSuccess(true)

    // Calculate changes
    const changes: string[] = []
    if (initialProfile) {
      const labels: Record<string, string> = {
        phone: 'Phone Number',
        address: 'Current Address',
        emergencyName: 'Emergency Contact Person',
        emergencyRelation: 'Emergency Relationship',
        emergencyPhone: 'Emergency Contact Phone',
        bankName: 'Bank Name',
        bankAccount: 'Bank Account Number',
        bankIfsc: 'Bank IFSC Code',
        manualEmployeeId: 'Employee Identifier',
        manualBloodGroup: 'Blood Group',
      }
      Object.keys(profile).forEach((key) => {
        const field = key as keyof ProfileData
        if (profile[field] !== initialProfile[field]) {
          changes.push(`${labels[field] || field}: changed from "${initialProfile[field] || 'empty'}" to "${profile[field] || 'empty'}"`)
        }
      })
    }

    if (changes.length === 0) {
      changes.push('No values were changed but profile was saved.')
    }

    triggerHrNotification(`Employee ${fullName} updated their profile details.`, {
      employeeName: fullName,
      action: 'Profile Details Update',
      timestamp: new Date().toISOString(),
      changes: changes
    })

    // Simulate saving (update initialProfile to current profile)
    setInitialProfile({ ...profile })

    setTimeout(() => setSuccess(false), 3000)
  }

  const downloadIdCard = async () => {
    const cardElement = document.getElementById('employee-id-card')
    if (cardElement) {
      try {
        const canvas = await html2canvas(cardElement, { scale: 3, useCORS: true })
        const url = canvas.toDataURL('image/png')
        const link = document.createElement('a')
        link.download = `ID-Card-${user?.firstName || 'Employee'}.png`
        link.href = url
        link.click()
      } catch (err) {
        console.error('Failed to generate ID card', err)
      }
    }
  }

  const photoUploadsUsed = employeeDetails?.photoUploadCount ?? (employeeDetails?.photo ? 1 : 0)
  const canUploadPhoto = photoUploadsUsed < 2

  const signatureUploadsUsed = employeeDetails?.signatureUploadCount ?? (employeeDetails?.signature ? 1 : 0)
  const canUploadSignature = signatureUploadsUsed < 2

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Convert file to base64
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onloadend = async () => {
      const base64String = reader.result as string
      try {
        setIsUploading(true)
        const res = await employeeApi.updateSignature(base64String)
        const updatedCount = res.data?.data?.signatureUploadCount ?? (signatureUploadsUsed + 1)
        setEmployeeDetails((prev: any) => ({
          ...prev,
          signature: res.data?.data?.signature || base64String,
          signatureUploadCount: updatedCount,
        }))
        triggerHrNotification(`Employee ${fullName} updated their digital signature.`)
      } catch (error: any) {
        console.error('Failed to upload signature', error)
        const msg = error.response?.data?.message || 'Failed to upload signature. Please try again.'
        alert(msg)
      } finally {
        setIsUploading(false)
      }
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onloadend = async () => {
      const base64String = reader.result as string
      try {
        setIsUploading(true)
        const res = await employeeApi.updatePhoto(base64String)
        const updatedCount = res.data?.data?.photoUploadCount ?? (photoUploadsUsed + 1)
        setEmployeeDetails((prev: any) => ({
          ...prev,
          photo: res.data?.data?.photo || base64String,
          photoUploadCount: updatedCount,
        }))
        triggerHrNotification(`Employee ${fullName} updated their profile photo.`)
      } catch (error: any) {
        console.error('Failed to upload photo', error)
        const msg = error.response?.data?.message || 'Failed to upload photo. Please try again.'
        alert(msg)
      } finally {
        setIsUploading(false)
      }
    }
  }

  const fullName = user ? `${user.firstName} ${user.lastName}` : 'Employee'
  const email = user?.email || ''
  const roleName = user?.role?.replace('_', ' ') || 'EMPLOYEE'

  return (
    <div className="profile-page">
      <div className="profile-header-banner">
        <div className="profile-banner-left">
          {canUploadPhoto ? (
            <label className="profile-avatar-large" style={{ cursor: 'pointer', position: 'relative' }} title={`Click to upload photo (${2 - photoUploadsUsed} upload${2 - photoUploadsUsed === 1 ? '' : 's'} remaining)`}>
              <img src={employeeDetails?.photo || `https://ui-avatars.com/api/?name=${fullName}&background=3b82f6&color=fff&size=128`} alt="User" />
              <input 
                type="file" 
                accept="image/png, image/jpeg" 
                style={{ display: 'none' }} 
                onChange={handlePhotoUpload}
                disabled={isUploading}
              />
              <div className="avatar-hover-overlay">
                <Upload size={20} color="white" />
              </div>
              <span className="upload-badge-tag">{photoUploadsUsed}/2 uploads</span>
            </label>
          ) : (
            <div className="profile-avatar-large" style={{ position: 'relative', cursor: 'default' }} title="Photo upload limit reached (2/2)">
              <img src={employeeDetails?.photo || `https://ui-avatars.com/api/?name=${fullName}&background=3b82f6&color=fff&size=128`} alt="User" />
              <span className="upload-badge-tag locked">2/2 locked</span>
            </div>
          )}
          <div className="profile-header-text">
            <h2>{fullName}</h2>
            <div className="profile-subtitle">
              <span className="role-tag">{roleName}</span>
              <span className="bullet">•</span>
              <span className="dept-tag">{employeeDetails?.department?.name || 'Department'}</span>
            </div>
            <p className="email-line"><Mail size={14} /> {email}</p>
          </div>
        </div>
        <div className="profile-banner-right">
          <div className="profile-completeness">
            <span>Profile Completeness</span>
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: '90%' }}></div>
              <span className="progress-val">90%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="profile-tabs">
        <button className={`tab-btn ${activeTab === 'PERSONAL' ? 'active' : ''}`} onClick={() => setActiveTab('PERSONAL')}>
          <User size={16} />
          <span>Personal & Contact Info</span>
        </button>
        <button className={`tab-btn ${activeTab === 'JOB' ? 'active' : ''}`} onClick={() => setActiveTab('JOB')}>
          <Briefcase size={16} />
          <span>Job & Position Details</span>
        </button>
        <button className={`tab-btn ${activeTab === 'BANK' ? 'active' : ''}`} onClick={() => setActiveTab('BANK')}>
          <Landmark size={16} />
          Banking Details
        </button>
        <button className={`tab-btn ${activeTab === 'IDCARD' ? 'active' : ''}`} onClick={() => setActiveTab('IDCARD')}>
          <User size={16} />
          ID Card
        </button>
      </div>

      {success && (
        <div className="success-toast">
          <CheckCircle size={18} />
          <span>Profile changes saved successfully! Local environment updated.</span>
        </div>
      )}

      {/* Form Content */}
      <div className="profile-card">
        <form onSubmit={handleSave}>
          {activeTab === 'PERSONAL' && (
            <div className="tab-pane">
              <h3>Contact Details</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Employee ID (For ID Card)</label>
                  <div className="input-with-icon">
                    <User size={16} className="input-icon" />
                    <input
                      type="text"
                      value={profile.manualEmployeeId}
                      readOnly
                      style={{ background: '#f1f5f9', cursor: 'not-allowed', color: '#64748b' }}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Blood Group (For ID Card)</label>
                  <div className="input-with-icon">
                    <User size={16} className="input-icon" />
                    <input
                      type="text"
                      value={profile.manualBloodGroup}
                      onChange={(e) => setProfile({ ...profile, manualBloodGroup: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Primary Phone Number</label>
                  <div className="input-with-icon">
                    <Phone size={16} className="input-icon" />
                    <input
                      type="text"
                      value={profile.phone}
                      onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Permanent Residential Address</label>
                  <div className="input-with-icon">
                    <MapPin size={16} className="input-icon" />
                    <input
                      type="text"
                      value={profile.address}
                      onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                      required
                    />
                  </div>
                </div>
              </div>

              <h3 className="section-divider">Emergency Contact Details</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Emergency Contact Person</label>
                  <input
                    type="text"
                    value={profile.emergencyName}
                    onChange={(e) => setProfile({ ...profile, emergencyName: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Relationship Status</label>
                  <input
                    type="text"
                    value={profile.emergencyRelation}
                    onChange={(e) => setProfile({ ...profile, emergencyRelation: e.target.value })}
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'JOB' && (
            <div className="tab-pane readonly">
              <h3>Company Allocation</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Employee Identifier</label>
                  <input type="text" value={employeeDetails?.employeeCode || ''} readOnly />
                </div>
                <div className="form-group">
                  <label>Role Assignment</label>
                  <input type="text" value={employeeDetails?.designation?.title || roleName} readOnly />
                </div>
                <div className="form-group">
                  <label>Reporting Line Manager</label>
                  <input type="text" value={employeeDetails?.manager ? `${employeeDetails.manager.firstName} ${employeeDetails.manager.lastName}` : 'N/A'} readOnly />
                </div>
                <div className="form-group">
                  <label>Joining Date Stamp</label>
                  <input type="text" value={employeeDetails?.joiningDate ? new Date(employeeDetails.joiningDate).toLocaleDateString() : ''} readOnly />
                </div>
                <div className="form-group">
                  <label>Employment Nature</label>
                  <input type="text" value={employeeDetails?.employmentType?.replace('_', ' ') || 'Full-Time'} readOnly />
                </div>
                <div className="form-group">
                  <label>Portal Privilege Level</label>
                  <input type="text" value={user?.role || 'EMPLOYEE_LEVEL_ACCESS'} readOnly />
                </div>
              </div>
              
              <div className="readonly-alert">
                <Shield size={16} />
                <span>Job, organizational and seniority values are managed by HR. If you require changes, please submit an operational request.</span>
              </div>
            </div>
          )}

          {activeTab === 'BANK' && (
            <div className="tab-pane">
              <h3>Direct Deposit Configuration</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Financial Institution Name</label>
                  <input
                    type="text"
                    value={profile.bankName}
                    onChange={(e) => setProfile({ ...profile, bankName: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Bank Routing IFSC Code</label>
                  <input
                    type="text"
                    value={profile.bankIfsc}
                    onChange={(e) => setProfile({ ...profile, bankIfsc: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Depositor Account Number</label>
                  <input
                    type="text"
                    value={profile.bankAccount}
                    onChange={(e) => setProfile({ ...profile, bankAccount: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group readonly">
                  <label>UAN Number</label>
                  <input
                    type="text"
                    value={employeeDetails?.payrollDetails?.uanNumber || 'N/A'}
                    readOnly
                  />
                </div>
              </div>
              <div className="readonly-alert" style={{ marginTop: '20px' }}>
                <Shield size={16} />
                <span>UAN Number is managed by HR. If you require changes, please contact HR.</span>
              </div>
            </div>
          )}

          {activeTab === 'IDCARD' && (
            <div className="tab-pane">
              <div className="id-card-container">
                <div className="id-card-wrapper">
                  <div id="employee-id-card" className="id-card">
                    {/* Header Image */}
                    <div className="id-header">
                      <a href="https://ibb.co/CK25RNxV">
                        <img 
                          src="https://i.ibb.co/gZVMkHst/Whats-App-Image-2026-05-30-at-11-03-55-AM-1.jpg" 
                          alt="Whats-App-Image-2026-05-30-at-11-03-55-AM-1" 
                          style={{ width: '100%', height: 'auto', border: 0 }} 
                        />
                      </a>
                    </div>
                    {/* Middle Section: Photo & Details */}
                    <div className="id-photo-container">
                      <img src={employeeDetails?.photo || `https://ui-avatars.com/api/?name=${fullName}&background=random&color=fff&size=200`} alt="Employee" />
                    </div>
                    
                    <div className="id-details">
                      <div className="id-name">{fullName.toUpperCase()}</div>
                      <div className="id-designation">{employeeDetails?.designation?.title || roleName}</div>
                      
                      <div className="id-info-grid">
                        <div className="id-info-row">
                          <span className="id-label">EMP ID:</span>
                          <span className="id-val">{profile.manualEmployeeId || 'N/A'}</span>
                        </div>
                        <div className="id-info-row">
                          <span className="id-label">Phone No.:</span>
                          <span className="id-val">{profile.phone || 'N/A'}</span>
                        </div>
                        <div className="id-info-row">
                          <span className="id-label">Blood Group:</span>
                          <span className="id-val">{profile.manualBloodGroup || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="id-signatures-row">
                      <div className="id-signature-col left">
                        <div className="sig-image-container">
                          {employeeDetails?.signature ? (
                            <img src={employeeDetails.signature} alt="Employee Signature" />
                          ) : (
                            <span className="no-sig-placeholder">No Signature</span>
                          )}
                        </div>
                        <div className="sig-label-text">Employee Signature</div>
                      </div>

                      <div className="id-signature-col right">
                        <div className="sig-image-container">
                          <img src="/authorized_signature.png" alt="Authorized Signature" />
                        </div>
                        <div className="sig-label-text">Authorized Signature</div>
                      </div>
                    </div>

                    {/* Footer - Restored to show full image since dynamic text is removed */}
                    <div className="id-footer">
                      <a href="https://ibb.co/1YNRQFpP">
                        <img 
                          src="https://i.ibb.co/nqyQmxVY/Whats-App-Image-2026-05-30-at-11-29-15-AM.jpg" 
                          alt="Whats-App-Image-2026-05-30-at-11-29-15-AM" 
                          style={{ width: '100%', display: 'block', border: 0 }} 
                        />
                      </a>
                    </div>
                  </div>
                </div>

                <div className="id-card-actions">
                  <p className="id-help-text">Please ensure all your personal details are accurate. Download your digital ID card to keep on your mobile device or print a physical copy.</p>
                  
                  <div className="action-buttons-row">
                    {canUploadSignature ? (
                      <label className="btn-secondary" style={{ cursor: 'pointer' }}>
                        <Upload size={16} />
                        <span>
                          {isUploading 
                            ? 'Uploading...' 
                            : signatureUploadsUsed === 0 
                              ? 'Upload Signature (2 left)' 
                              : 'Update Signature (1 left)'}
                        </span>
                        <input 
                          type="file" 
                          accept="image/png, image/jpeg" 
                          style={{ display: 'none' }} 
                          onChange={handleSignatureUpload}
                          disabled={isUploading}
                        />
                      </label>
                    ) : (
                      <button type="button" className="btn-secondary" style={{ cursor: 'not-allowed', opacity: 0.8 }} disabled title="Signature upload limit reached (2/2)">
                        <CheckCircle size={16} color="#10b981" />
                        <span>Signature Uploaded (2/2)</span>
                      </button>
                    )}

                    <button type="button" className="btn-primary" onClick={downloadIdCard}>
                      <Download size={16} />
                      <span>Download ID Card</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab !== 'JOB' && activeTab !== 'IDCARD' && (
            <div className="form-footer-action">
              <button type="submit" className="btn-save">
                <Save size={16} />
                <span>Save Profile Changes</span>
              </button>
            </div>
          )}
        </form>
      </div>

      <style>{`
        .profile-page {
          padding: 24px 32px;
          max-width: 1200px;
          margin: 0 auto;
          font-family: 'Inter', system-ui, sans-serif;
        }

        .profile-header-banner {
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
          border-radius: 16px;
          padding: 32px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: white;
          margin-bottom: 24px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.05);
        }

        .profile-banner-left {
          display: flex;
          align-items: center;
          gap: 24px;
        }

        .profile-avatar-large img {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: 4px solid rgba(255, 255, 255, 0.2);
          object-fit: cover;
        }
        
        .avatar-hover-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .profile-avatar-large:hover .avatar-hover-overlay {
          opacity: 1;
        }

        .upload-badge-tag {
          position: absolute;
          bottom: -4px;
          left: 50%;
          transform: translateX(-50%);
          background: #3b82f6;
          color: white;
          font-size: 0.62rem;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 12px;
          white-space: nowrap;
          box-shadow: 0 2px 5px rgba(0,0,0,0.3);
          border: 1.5px solid rgba(255,255,255,0.6);
        }

        .upload-badge-tag.locked {
          background: #64748b;
        }

        .profile-header-text h2 {
          margin: 0 0 6px 0;
          font-size: 1.6rem;
          font-weight: 800;
          letter-spacing: -0.02em;
        }

        .profile-subtitle {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
        }

        .role-tag {
          font-size: 0.72rem;
          font-weight: 800;
          background: #3b82f6;
          color: white;
          padding: 2px 8px;
          border-radius: 4px;
          text-transform: uppercase;
        }

        .dept-tag {
          font-size: 0.8rem;
          color: #94a3b8;
          font-weight: 500;
        }

        .bullet { color: #475569; }

        .email-line {
          margin: 0;
          font-size: 0.82rem;
          color: #cbd5e1;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .profile-completeness {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
        }

        .profile-completeness span {
          font-size: 0.75rem;
          color: #94a3b8;
          font-weight: 600;
        }

        .progress-bar-container {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 200px;
        }

        .progress-bar {
          height: 8px;
          background: #22c55e;
          border-radius: 4px;
          position: relative;
        }

        .progress-bar-container::before {
          content: '';
          position: absolute;
          width: 200px;
          height: 8px;
          background: rgba(255,255,255,0.1);
          border-radius: 4px;
          z-index: 0;
        }

        .progress-bar { z-index: 1; }
        .progress-val { font-size: 0.8rem; font-weight: 700; color: #22c55e; }

        .profile-tabs {
          display: flex;
          gap: 12px;
          margin-bottom: 24px;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 12px;
        }

        .tab-btn {
          background: none;
          border: none;
          padding: 8px 16px;
          font-size: 0.88rem;
          font-weight: 600;
          color: #64748b;
          cursor: pointer;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
        }

        .tab-btn:hover { background: #f1f5f9; color: #334155; }
        
        .tab-btn.active {
          background: #eff6ff;
          color: #2563eb;
          font-weight: 700;
        }

        .profile-card {
          background: white;
          border: 1px solid #f1f5f9;
          border-radius: 12px;
          padding: 32px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.01);
        }

        .tab-pane h3 {
          margin: 0 0 20px 0;
          font-size: 1.05rem;
          font-weight: 800;
          color: #0f172a;
        }

        .section-divider {
          margin-top: 32px !important;
          border-top: 1px solid #f1f5f9;
          padding-top: 24px;
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group label {
          font-size: 0.75rem;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .form-group input {
          width: 100%;
          padding: 10px 14px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          background: #f8fafc;
          font-size: 0.88rem;
          color: #334155;
          outline: none;
          transition: all 0.2s;
        }

        .form-group input:focus {
          border-color: #3b82f6;
          background: white;
          box-shadow: 0 0 0 3px rgba(59,130,246,0.1);
        }

        .input-with-icon { position: relative; }
        .input-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #64748b; }
        .input-with-icon input { padding-left: 38px; }

        .readonly input {
          background: #f1f5f9;
          border-color: #e2e8f0;
          color: #64748b;
          cursor: not-allowed;
        }

        .readonly-alert {
          margin-top: 24px;
          padding: 12px 16px;
          background: #fff7ed;
          border: 1px solid #ffedd5;
          border-radius: 8px;
          color: #c2410c;
          font-size: 0.8rem;
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 600;
        }

        .form-footer-action {
          margin-top: 32px;
          border-top: 1px solid #f1f5f9;
          padding-top: 24px;
          display: flex;
          justify-content: flex-end;
        }

        .btn-save {
          background: #3b82f6;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 0.88rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
          transition: all 0.2s;
        }

        .btn-save:hover { background: #2563eb; transform: translateY(-1px); }

        .success-toast {
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          color: #065f46;
          padding: 12px 20px;
          border-radius: 8px;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.88rem;
          font-weight: 600;
          animation: toastSlide 0.25s ease-out;
        }

        @keyframes toastSlide {
          from { transform: translateY(-10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .id-card-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
          padding: 24px;
        }

        .id-card-wrapper {
          padding: 20px;
          background: #f8fafc;
          border-radius: 16px;
          border: 1px dashed #cbd5e1;
          display: flex;
          justify-content: center;
        }

        .id-card {
          width: 330px;
          min-height: 520px;
          background: #f4f4f4;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          font-family: 'Arial', sans-serif;
          border: 1px solid #ddd;
        }

        .id-header {
          padding: 10px;
          text-align: center;
          width: 100%;
        }

        .id-photo-container {
          display: flex;
          justify-content: center;
          margin-top: 10px;
          z-index: 2;
        }

        .id-photo-container img {
          width: 140px;
          height: 140px;
          border-radius: 16px;
          object-fit: cover;
          border: 1px solid #222;
          background: white;
        }

        .id-details {
          padding: 10px 20px;
          text-align: center;
          flex-grow: 1;
        }

        .id-name {
          color: #e3000f;
          font-weight: 700;
          font-size: 17px;
          margin-bottom: 2px;
          text-transform: uppercase;
        }

        .id-designation {
          color: #e3000f;
          font-weight: 600;
          font-size: 13px;
          margin-bottom: 20px;
        }

        .id-info-grid {
          display: flex;
          flex-direction: column;
          gap: 6px;
          text-align: left;
          padding: 0 15px 0 45px;
        }

        .id-info-row {
          display: flex;
          font-size: 15px;
        }

        .id-label {
          font-weight: 700;
          width: 125px;
          color: #000;
        }

        .id-val {
          font-weight: 700;
          color: #000;
          flex: 1;
        }

        .id-signatures-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 20px 0;
          position: relative;
          z-index: 2;
          gap: 10px;
        }

        .id-signature-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 48%;
        }

        .id-signature-col.left {
          align-items: flex-start;
          padding-left: 10px;
        }

        .id-signature-col.right {
          align-items: flex-end;
          padding-right: 10px;
        }

        .sig-image-container {
          height: 35px;
          margin-bottom: 2px;
          display: flex;
          align-items: center;
          width: 100%;
        }

        .id-signature-col.left .sig-image-container {
          justify-content: flex-start;
        }

        .id-signature-col.right .sig-image-container {
          justify-content: flex-end;
        }

        .sig-image-container img {
          max-height: 35px;
          max-width: 110px;
          object-fit: contain;
        }

        .no-sig-placeholder {
          font-size: 10px;
          color: #94a3b8;
          font-style: italic;
        }

        .auth-sig-style {
          font-family: 'Dancing Script', 'Brush Script MT', cursive;
          font-size: 16px;
          color: #1e3a8a; /* Blue ink color */
          font-weight: bold;
        }

        .sig-label-text {
          font-size: 9px;
          color: #000;
          font-weight: 700;
        }

        .id-footer {
          width: 100%;
          position: relative;
          margin-top: auto;
        }

        .id-card-actions {
          max-width: 400px;
          text-align: center;
        }

        .id-help-text {
          font-size: 0.9rem;
          color: #64748b;
          margin-bottom: 16px;
          line-height: 1.5;
        }

        .action-buttons-row {
          display: flex;
          justify-content: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        
        .btn-primary, .btn-secondary {
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s;
        }

        .btn-primary {
          background: #3b82f6;
          color: white;
        }
        .btn-primary:hover { background: #2563eb; }

        .btn-secondary {
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #cbd5e1;
        }
        .btn-secondary:hover { background: #e2e8f0; color: #334155; }
      `}</style>
    </div>
  )
}
