import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Plus, Search, Filter, Loader2, Star,
  Briefcase, Users, UserCheck, Calendar,
  Mail, Phone, MoreHorizontal, XCircle, LayoutGrid, List, Target,
  Zap, Share2, Eye, Download, MapPin, Award,
  ChevronRight, ChevronLeft, Brain, Globe, Inbox, StarHalf, ShieldAlert,
  FolderOpen, UserPlus, CheckCircle, Clock, Sparkles, Send, Bell,
  ArrowUpRight, Activity, Layers, Settings, RefreshCw, ChevronDown,
  BookOpen, FileText, BarChart2, PieChart as PieChartIcon, Cpu, Copy, ExternalLink,
  FileCode, Video, FileSpreadsheet, Package, Paperclip, AlertTriangle, File, Check, X
} from 'lucide-react';
import api from '../../api/axios';
import { format } from 'date-fns';
import {
  PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend,
  BarChart, Bar
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import './recruitment.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  stage: string;
  source: string;
  jobTitle: string;
  experience: string;
  appliedDate: string;
  matchScore: number;
  candidateCode?: string;
  avatarColor?: string;
  skills: string[];
  attachmentImages?: string[];
  resumeUrl?: string;
  location?: string;
  graduationYear?: string;
  
  // Interview Phase
  interviewDate?: string;
  interviewTime?: string;
  interviewType?: string;
  interviewer?: string;
  interviewLink?: string;
  
  // Offer Phase
  offerSalary?: number;
  offerJoiningDate?: string;
  offerStatus?: string;
  
  // Verification Phase
  documentsVerified?: boolean;
  
  // Onboarding Phase
  onboarded?: boolean;
  onboardingInviteId?: string;
  onboardingUrl?: string;
  onboardingToken?: string;
}

export interface Job {
  id: string;
  title: string;
  department: string;
  location: string;
  type: string;
  status: 'Published' | 'Draft' | 'Archived' | 'OPEN';
  applicants: number;
  postedDate: string;
  description?: string;
  mediaUrl?: string;
}

export interface FormAttachment {
  id: string;
  name: string;
  type: 'pdf' | 'doc' | 'image' | 'video' | 'spreadsheet' | 'archive' | 'unknown';
  mimeType: string;
  url: string;
  downloadUrl: string;
  previewUrl?: string;
  originalUrl?: string;
  docType?: string;
  docField?: string;
  driveId?: string;
  sizeStr?: string;
  uploadedAt?: string;
  error?: boolean;
}

export function parseAttachmentItem(item: any, index: number = 0): FormAttachment {
  if (!item) {
    return {
      id: `err-${index}`,
      name: 'File unavailable',
      type: 'unknown',
      mimeType: 'application/octet-stream',
      url: '',
      downloadUrl: '',
      error: true
    };
  }

  if (typeof item === 'object' && item !== null) {
    const rawUrl = item.url || item.secureUrl || '';
    const driveMatch = rawUrl.match(/(?:id=|\/d\/|\/uc\?.*id=)([a-zA-Z0-9_-]{25,})/);
    const driveId = item.driveId || (driveMatch ? driveMatch[1] : undefined);
    const type = item.type || (driveId ? 'pdf' : detectFileType(item.name || rawUrl || ''));
    return {
      id: item.id || driveId || `att-${index}`,
      name: item.name || (driveId ? `Google_Drive_Doc_${index + 1}` : 'Attachment'),
      type,
      mimeType: item.mimeType || getMimeType(type),
      url: rawUrl,
      previewUrl: item.previewUrl || (driveId ? `https://drive.google.com/file/d/${driveId}/preview` : rawUrl),
      originalUrl: item.originalUrl || (driveId ? `https://drive.google.com/file/d/${driveId}/view` : rawUrl),
      downloadUrl: item.downloadUrl || (driveId ? `https://drive.google.com/uc?export=download&id=${driveId}` : rawUrl),
      driveId,
      docType: item.docType,
      docField: item.docField,
      sizeStr: item.sizeStr || (item.size ? formatBytes(item.size) : undefined),
      uploadedAt: item.uploadedAt,
      error: item.error || false
    };
  }

  if (typeof item === 'string') {
    const trimmed = item.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        return parseAttachmentItem(parsed, index);
      } catch (e) {
        // Fallthrough
      }
    }

    const driveMatch = trimmed.match(/(?:id=|\/d\/|\/uc\?.*id=)([a-zA-Z0-9_-]{25,})/);
    const driveId = driveMatch ? driveMatch[1] : undefined;

    let filename = `Attachment_${index + 1}`;
    try {
      if (driveId) {
        if (trimmed.toLowerCase().includes('resume')) filename = 'Resume.pdf';
        else if (trimmed.toLowerCase().includes('photo') || trimmed.toLowerCase().includes('image')) filename = 'Profile_Photo.jpg';
        else filename = `Google_Drive_Doc_${index + 1}`;
      } else if (trimmed.startsWith('http')) {
        const last = new URL(trimmed).pathname.split('/').pop();
        if (last && last.includes('.')) filename = decodeURIComponent(last);
      }
    } catch {
      filename = `Attachment_${index + 1}`;
    }

    const type = driveId ? 'pdf' : detectFileType(filename, trimmed);
    const mimeType = getMimeType(type);

    const viewUrl = trimmed;
    const previewUrl = driveId ? `https://drive.google.com/file/d/${driveId}/preview` : trimmed;
    const originalUrl = driveId ? (trimmed.startsWith('http') ? trimmed : `https://drive.google.com/file/d/${driveId}/view`) : trimmed;
    const downloadUrl = driveId ? `https://drive.google.com/uc?export=download&id=${driveId}` : trimmed;

    return {
      id: driveId || `att-${index}`,
      name: filename,
      type,
      mimeType,
      url: viewUrl,
      previewUrl,
      originalUrl,
      downloadUrl,
      driveId,
      error: false
    };
  }

  return {
    id: `invalid-${index}`,
    name: 'File unavailable',
    type: 'unknown',
    mimeType: 'application/octet-stream',
    url: '',
    downloadUrl: '',
    error: true
  };
}

function detectFileType(name: string, url: string = ''): 'pdf' | 'doc' | 'image' | 'video' | 'spreadsheet' | 'archive' | 'unknown' {
  const c = (name + ' ' + url).toLowerCase();
  if (c.includes('.pdf') || c.includes('pdf')) return 'pdf';
  if (c.includes('.doc') || c.includes('.docx') || c.includes('word')) return 'doc';
  if (c.includes('.jpg') || c.includes('.jpeg') || c.includes('.png') || c.includes('.webp') || c.includes('.gif') || c.includes('.svg') || c.includes('image') || c.includes('photo') || c.includes('unsplash') || c.includes('googleusercontent')) return 'image';
  if (c.includes('.mp4') || c.includes('.mov') || c.includes('.webm') || c.includes('.avi') || c.includes('video')) return 'video';
  if (c.includes('.xls') || c.includes('.xlsx') || c.includes('.csv') || c.includes('sheet')) return 'spreadsheet';
  if (c.includes('.zip') || c.includes('.rar') || c.includes('.7z') || c.includes('archive')) return 'archive';
  return 'unknown';
}

function getMimeType(type: string): string {
  switch (type) {
    case 'pdf': return 'application/pdf';
    case 'doc': return 'application/msword';
    case 'image': return 'image/jpeg';
    case 'video': return 'video/mp4';
    case 'spreadsheet': return 'text/csv';
    case 'archive': return 'application/zip';
    default: return 'application/octet-stream';
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function getCandidateCode(c: any): string {
  if (c && c.candidateCode) return c.candidateCode;
  const str = (c?.email || c?.id || c?.phone || `${c?.firstName || ''}${c?.lastName || ''}` || 'cand').toLowerCase();
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const positiveHash = Math.abs(hash);
  const fourDigit = 1000 + (positiveHash % 9000);
  return `${fourDigit}`;
}

export function getStoredCandidateDocs(candidateId?: string, email?: string, code?: string): string[] {
  try {
    const keysToCheck = [
      candidateId ? `hrms_candidate_docs_${candidateId}` : null,
      email ? `hrms_candidate_docs_${email}` : null,
      email ? `hrms_candidate_docs_${email.toLowerCase()}` : null,
      code ? `hrms_candidate_docs_${code}` : null,
    ].filter(Boolean) as string[];

    const collected: string[] = [];
    keysToCheck.forEach(k => {
      try {
        const items: string[] = JSON.parse(localStorage.getItem(k) || '[]');
        items.forEach(item => {
          if (!collected.includes(item)) collected.push(item);
        });
      } catch (_) {}
    });

    try {
      const master: { [idOrEmail: string]: string[] } = JSON.parse(localStorage.getItem('hrms_all_uploaded_documents') || '{}');
      [candidateId, email, email?.toLowerCase(), code].filter(Boolean).forEach(key => {
        if (key && master[key]) {
          master[key].forEach(item => {
            if (!collected.includes(item)) collected.push(item);
          });
        }
      });
    } catch (_) {}

    return collected;
  } catch (_) {
    return [];
  }
}

// ─── 9 Pipeline Stages Config ──────────────────────────────────────────

const STAGES = [
  { step: '1', key: 'stage-5', title: 'Shortlisting', desc: 'Review best matches', icon: StarHalf, color: 'bg-sky-50 text-sky-600 border-sky-200', activeBg: 'bg-sky-600 text-white border-sky-600' },
  { step: '2', key: 'stage-6', title: 'Interviews', desc: 'Schedule & conduct', icon: Calendar, color: 'bg-amber-50 text-amber-600 border-amber-200', activeBg: 'bg-amber-600 text-white border-amber-600' },
  { step: '3', key: 'stage-8', title: 'Documents', desc: 'Collect & verify', icon: FolderOpen, color: 'bg-green-50 text-green-600 border-green-200', activeBg: 'bg-green-600 text-white border-green-600' },
  { step: '4', key: 'stage-7', title: 'Offer', desc: 'Extend offer', icon: Award, color: 'bg-orange-50 text-orange-600 border-orange-200', activeBg: 'bg-orange-600 text-white border-orange-600' },
  { step: '5', key: 'stage-9', title: 'Onboarding', desc: 'Welcome new hire', icon: UserPlus, color: 'bg-teal-50 text-teal-600 border-teal-200', activeBg: 'bg-teal-600 text-white border-teal-600' },
];

const SOURCE_FILLS: Record<string, string> = {
  'Career Page': '#3b82f6',
  'LinkedIn': '#10b981',
  'Referral': '#f59e0b',
  'Indeed': '#6366f1',
  'Direct': '#8b5cf6',
  'Naukri': '#ec4899',
  'Wellfound': '#14b8a6',
  'Others': '#94a3b8',
};

const DEFAULT_FALLBACK_APPLICANTS = [
  { id: 'cand-shiva-1', firstName: 'Shiva', lastName: 'Prasad', email: 'shivaram33987@gmail.com', phone: '9949020175', location: 'WNP', experience: 'Degree', graduationYear: '-', appliedDate: '24/08/2026 10:58:33', resumeUrl: 'https://drive.google.com/open?id=1KHGMjppH53O9yfI9Wj0fmUpOAjjytA7z', source: 'Google Form', jobTitle: 'Google Form Recruitment' },
  { id: 'cand-shiva-2', firstName: 'k shiva', lastName: 'prasad', email: 'Kshivaprasad33987@gmail.com', phone: '9874563110', location: 'HYD', experience: '-', graduationYear: '2000', appliedDate: '24/08/2026 11:20:19', resumeUrl: 'https://drive.google.com/open?id=1D4woFQ3G9YX5TVcYc_dH9L5wF7UlS_0P', source: 'Google Form', jobTitle: 'Google Form Recruitment' },
  { id: 'cand-shiva-3', firstName: 'kanapuram Shiva', lastName: 'prasad', email: 'shivaram33987@gmail.com', phone: '99949020175', location: 'WNP', experience: 'B.Tech', graduationYear: '-', appliedDate: '24/08/2026 12:58:39', resumeUrl: 'https://drive.google.com/open?id=1rnDWuhRDVf4WvyNmNyknoMCVaeyNnGtr', source: 'Google Form', jobTitle: 'Google Form Recruitment' },
  { id: 'cand-shiva-4', firstName: 'Kiran', lastName: 'Prasad', email: 'kiranprasad@gmail.com', phone: '9876543210', location: 'HYD', experience: 'Degree', graduationYear: '-', appliedDate: '24/08/2026 13:10:05', resumeUrl: 'https://drive.google.com/open?id=1Pg2F6ko5VpMxxuOvax4SkPWn4byjWYE5', source: 'Google Form', jobTitle: 'Google Form Recruitment' },
  { id: 'cand-shiva-5', firstName: 'Shivaram', lastName: 'Prasad', email: 'shivaram.npl@gmail.com', phone: '9876543211', location: 'NPL', experience: 'MCA', graduationYear: '-', appliedDate: '24/08/2026 14:05:12', resumeUrl: 'https://drive.google.com/open?id=1sqyM3VU6rNhKi-C2mivbkCx53FVg0t7-', source: 'Google Form', jobTitle: 'Google Form Recruitment' },
  { id: 'cand-shiva-6', firstName: 'Karthik', lastName: 'Naidu', email: 'karthiknaidu@gmail.com', phone: '9908915698', location: 'Wanaparthy', experience: 'Degree', graduationYear: '2026', appliedDate: '24/08/2026 15:20:44', resumeUrl: 'https://drive.google.com/open?id=1sfCrweVTjS0zSMpCGxM_J0v4n73v8Dxa', source: 'Google Form', jobTitle: 'Google Form Recruitment' }
];

interface RecruitmentProps {
  defaultTab?: string;
}

export default function Recruitment({ defaultTab }: RecruitmentProps = {}) {
  const location = useLocation();
  const isInterviewScheduleRoute = location.pathname.includes('/hr/interview-schedule');
  const [activeTab, setActiveTabState] = useState<string>(() => {
    const saved = localStorage.getItem('hrms_recruitment_active_tab');
    if (saved && ['dashboard', 'stage-2', 'stage-5', 'stage-6', 'stage-8', 'stage-7', 'stage-9', 'candidates'].includes(saved)) {
      return saved;
    }
    return defaultTab || (isInterviewScheduleRoute ? 'stage-6' : 'dashboard');
  });

  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    try {
      localStorage.setItem('hrms_recruitment_active_tab', tab);
    } catch (_) {}
  };

  useEffect(() => {
    if (location.pathname.includes('/hr/interview-schedule')) {
      setActiveTab('stage-6');
    } else if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [location.pathname, defaultTab]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [liveSheetResponses, setLiveSheetResponses] = useState<any[]>([]);
  
  // State for forms & UI flows
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  
  // Google Form Applications state
  const [showEmbeddedForm, setShowEmbeddedForm] = useState(false);
  const [copiedFormLink, setCopiedFormLink] = useState(false);
  const [appSourceFilter, setAppSourceFilter] = useState<'all' | 'google-form' | 'manual'>('all');
  const [allApplicantsFilter, setAllApplicantsFilter] = useState<'all' | 'accepted' | 'rejected' | 'pending'>('all');
  const [inspectCandidate, setInspectCandidate] = useState<any | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [submittingApp, setSubmittingApp] = useState(false);
  const [modalApplicant, setModalApplicant] = useState({
    name: '',
    email: '',
    phone: '',
    experience: '3 Years',
    source: 'Google Form',
    skills: 'React, Node.js, TypeScript',
    jobId: ''
  });
  const googleFormUrl = "https://docs.google.com/forms/d/e/1FAIpQLSeZHuwlr39VAsqWkKr5pgGjWK95nFQ2-i9NA3EhUOjbaOakUw/viewform?usp=header";
  const googleFormEmbedUrl = "https://docs.google.com/forms/d/e/1FAIpQLSeZHuwlr39VAsqWkKr5pgGjWK95nFQ2-i9NA3EhUOjbaOakUw/viewform?embedded=true";
  const googleSheetUrl = "https://docs.google.com/spreadsheets/d/1lQJhC2BRKi-ut7XerrcptvLwiRpJvxGbZGZaS9WzWpg/edit?resourcekey=&gid=1809928383#gid=1809928383";
  const [previewMediaAttachment, setPreviewMediaAttachment] = useState<FormAttachment | null>(null);
  const [driveUploadModal, setDriveUploadModal] = useState<{
    candidateId: string;
    candidateName: string;
    candidateEmail?: string;
    candidateCode?: string;
    docType: string;
    docField?: string;
  } | null>(null);
  const [driveLinkInput, setDriveLinkInput] = useState('');
  const [driveDocTitleInput, setDriveDocTitleInput] = useState('');
  const [savingDriveLink, setSavingDriveLink] = useState(false);
  const [formApplicantStatuses, setFormApplicantStatuses] = useState<{ [key: string]: 'accepted' | 'declined' | 'pending' | 'scheduled' | 'documents' }>(() => {
    try {
      const saved = localStorage.getItem('hrms_form_applicant_statuses');
      return saved ? JSON.parse(saved) : {};
    } catch (_) {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('hrms_form_applicant_statuses', JSON.stringify(formApplicantStatuses));
    } catch (_) {}
  }, [formApplicantStatuses]);

  const getStoredShortlistedCandidates = (): Candidate[] => {
    try {
      const saved = localStorage.getItem('hrms_shortlisted_candidates');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  };

  const saveStoredShortlistedCandidates = (list: Candidate[]) => {
    try {
      localStorage.setItem('hrms_shortlisted_candidates', JSON.stringify(list));
    } catch (_) {}
  };

  const getStoredScheduledInterviews = (): Candidate[] => {
    try {
      const saved = localStorage.getItem('hrms_scheduled_interviews');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  };

  const saveStoredScheduledInterviews = (list: Candidate[]) => {
    try {
      localStorage.setItem('hrms_scheduled_interviews', JSON.stringify(list));
    } catch (_) {}
  };

  const handleAcceptFormApplicant = async (c: any) => {
    const applicantEmail = c.email || c.id;
    setFormApplicantStatuses(prev => {
      const updated = { ...prev, [applicantEmail]: 'accepted' as const };
      try {
        localStorage.setItem('hrms_form_applicant_statuses', JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });

    const nameParts = (c.firstName || c.name || 'Applicant').split(' ');
    const fName = c.firstName || nameParts[0] || 'Applicant';
    const lName = c.lastName || nameParts.slice(1).join(' ') || '';

    const newCand: Candidate = {
      id: c.id || `cand-form-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      firstName: fName,
      lastName: lName,
      email: c.email || `applicant_${Date.now()}@example.com`,
      phone: c.phone || c.mobile || 'N/A',
      stage: 'Shortlisting',
      source: c.source || 'Google Form',
      jobTitle: c.jobTitle || 'Google Form Applicant',
      experience: c.experience || c.qualification || 'Degree',
      location: c.location || 'WNP',
      graduationYear: c.graduationYear || '-',
      appliedDate: c.appliedAt || format(new Date(), 'yyyy-MM-dd'),
      matchScore: c.matchScore || 85,
      skills: c.skills || ['Google Form', c.qualification || 'Degree'],
      avatarColor: 'bg-emerald-100 text-emerald-600 border-emerald-200',
      resumeUrl: c.resumeUrl || c.resumeLink,
      attachmentImages: c.attachmentImages || (c.resumeUrl ? [c.resumeUrl] : [])
    };

    setCandidates(prevCandidates => {
      const exists = prevCandidates.some(cand => 
        (c.email && cand.email === c.email) || (c.id && cand.id === c.id)
      );

      let updatedList: Candidate[];
      if (exists) {
        updatedList = prevCandidates.map(cand => {
          if ((c.email && cand.email === c.email) || (c.id && cand.id === c.id)) {
            return { ...cand, stage: 'Shortlisting' };
          }
          return cand;
        });
      } else {
        updatedList = [newCand, ...prevCandidates];
      }

      saveStoredShortlistedCandidates(updatedList.filter(cand => cand.stage === 'Shortlisting'));
      return updatedList;
    });

    if (c.id && !c.id.startsWith('cand-shiva-') && !c.id.startsWith('cand-live-')) {
      try {
        await api.patch(`/recruitment/applications/${c.id}/status`, { status: 'SHORTLISTED' });
      } catch (err) {
        console.warn('Backend status update error:', err);
      }
    } else {
      try {
        const res = await api.post('/recruitment/applications', {
          name: `${c.firstName || c.name || 'Applicant'} ${c.lastName || ''}`.trim(),
          email: c.email || `applicant_${Date.now()}@example.com`,
          phone: c.phone || c.mobile || 'N/A',
          experience: c.experience || c.qualification || 'Degree',
          source: c.source || 'Google Form',
          skills: c.skills || ['Google Form'],
          jobId: selectedJobId || (jobs[0] ? jobs[0].id : '')
        });
        if (res.data?.data?.id) {
          await api.patch(`/recruitment/applications/${res.data.data.id}/status`, { status: 'SHORTLISTED' });
        }
      } catch (err) {
        console.warn('Backend application sync notice:', err);
      }
    }

    const nameToShow = `${c.firstName || c.name || 'Applicant'} ${c.lastName || ''}`.trim();
    alert(`✅ Application accepted! ${nameToShow} has been moved to the Shortlist tab.`);
    setActiveTab('stage-5');
  };

  const handleDeclineFormApplicant = async (c: any) => {
    const applicantEmail = c.email || c.id;
    setFormApplicantStatuses(prev => {
      const updated = { ...prev, [applicantEmail]: 'declined' as const };
      try {
        localStorage.setItem('hrms_form_applicant_statuses', JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });

    setCandidates(prevCandidates => {
      const updatedList = prevCandidates.map(cand => {
        if ((c.email && cand.email === c.email) || (c.id && cand.id === c.id)) {
          return { ...cand, stage: 'Rejected' };
        }
        return cand;
      });

      saveStoredShortlistedCandidates(updatedList.filter(cand => cand.stage === 'Shortlisting'));
      return updatedList;
    });

    if (c.id && !c.id.startsWith('cand-shiva-') && !c.id.startsWith('cand-live-')) {
      try {
        await api.patch(`/recruitment/applications/${c.id}/status`, { status: 'REJECTED' });
      } catch (err) {
        console.warn('Backend status update error:', err);
      }
    }

    const nameToShow = `${c.firstName || c.name || 'Applicant'} ${c.lastName || ''}`.trim();
    alert(`❌ Application declined for ${nameToShow}.`);
  };

  const handleSyncResponses = async () => {
    try {
      setLoading(true);
      await api.post('/recruitment/sync-google-responses');
      await loadRecruitmentData();
    } catch (err: any) {
      console.warn('Sync notice:', err);
      await loadRecruitmentData();
    } finally {
      setLoading(false);
    }
  };

  const handleRealtimeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalApplicant.name || !modalApplicant.email) {
      alert('Please fill out Name and Email.');
      return;
    }
    try {
      setSubmittingApp(true);
      await api.post('/recruitment/applications', {
        ...modalApplicant,
        jobId: modalApplicant.jobId || selectedJobId || (jobs[0] ? jobs[0].id : '')
      });
      alert('Real-time application submitted and saved to database!');
      setShowAddModal(false);
      setModalApplicant({ name: '', email: '', phone: '', experience: '3 Years', source: 'Google Form', skills: 'React, Node.js, TypeScript', jobId: '' });
      await loadRecruitmentData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save response to database.');
    } finally {
      setSubmittingApp(false);
    }
  };

  const [postingChannels, setPostingChannels] = useState<Record<string, boolean>>({
    linkedin: true,
    naukri: true,
    wellfound: true,
    indeed: false,
    career_portal: true,
  });
  const [integrationLogs, setIntegrationLogs] = useState<string[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [postingSuccessJobId, setPostingSuccessJobId] = useState<string | null>(null);
  const [selectedSimulatedChannel, setSelectedSimulatedChannel] = useState<string | null>(null);
  
  // AI screening simulation state
  const [screeningCandId, setScreeningCandId] = useState<string | null>(null);
  const [screeningLogs, setScreeningLogs] = useState<string[]>([]);
  
  // Stage 1 Create Job form state
  const [newJob, setNewJob] = useState({
    title: '',
    department: 'Engineering',
    location: 'Remote',
    description: '',
    requirements: '',
    type: 'Full-time',
    mediaUrl: ''
  });
  
  // Stage 3 Applicant form state
  const [newApplicant, setNewApplicant] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    experience: '3 Years',
    source: 'LinkedIn',
    skills: 'React, TypeScript, CSS',
    jobId: ''
  });

  // Stage 6 Interview form & calendar state
  const [currentCalMonth, setCurrentCalMonth] = useState<Date>(new Date(2026, 7, 1)); // August 2026
  const [showScheduleModal, setShowScheduleModal] = useState<boolean>(false);
  const [showFormModal, setShowFormModal] = useState<boolean>(false);
  const [interviewForm, setInterviewForm] = useState({
    date: '2026-08-25',
    time: '11:30 AM',
    type: 'HR Screening',
    interviewer: 'Sneha Nair',
    link: ''
  });

  const openAddSlotModal = (dateStr: string) => {
    const existingOnDate = candidates.filter(c => c.interviewDate === dateStr);
    const bookedTimes = existingOnDate.map(c => (c.interviewTime || '').trim().toLowerCase());

    const standardSlots = [
      '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
      '12:00 PM', '12:30 PM', '01:30 PM', '02:00 PM', '02:30 PM', '03:00 PM',
      '03:30 PM', '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM'
    ];
    let nextAvailable = standardSlots.find(s => !bookedTimes.includes(s.toLowerCase())) || '06:30 PM';

    setInterviewForm({
      date: dateStr,
      time: nextAvailable,
      type: 'Technical Round',
      interviewer: 'Sneha Nair',
      link: ''
    });

    setSelectedCandidate(null);
    setShowScheduleModal(true);
  };

  // Stage 7 Offer form state
  const [offerForm, setOfferForm] = useState({
    salary: '75000',
    joiningDate: ''
  });

  // Stage 8 Document uploads mock state
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);

  // Stage 9 Onboarding state
  const [onboardingProgressId, setOnboardingProgressId] = useState<string | null>(null);
  const [onboardingInviteResult, setOnboardingInviteResult] = useState<any>(null);

  // Load backend recruitment data
  const loadRecruitmentData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/recruitment/jobs');
      const responseData = res.data.data;

      if (responseData && Array.isArray(responseData)) {
        const mappedJobs: Job[] = responseData.map((job: any) => ({
          id: job.id,
          title: job.title,
          department: job.department || 'General',
          location: job.location || 'Remote',
          type: 'Full-time',
          status: job.status === 'OPEN' ? 'Published' : job.status,
          applicants: job.applications?.filter((app: any) => app.source !== 'Google Form').length || 0,
          postedDate: format(new Date(job.createdAt), 'yyyy-MM-dd'),
          description: job.description || '',
          mediaUrl: job.mediaUrl || '',
        }));
        setJobs(mappedJobs);

        if (mappedJobs.length > 0 && !selectedJobId) {
          setSelectedJobId(mappedJobs[0].id);
        }

        const allCandidates: Candidate[] = [];
        const AVATAR_COLORS = [
          'bg-blue-100 text-blue-600 border-blue-200', 'bg-pink-100 text-pink-600 border-pink-200',
          'bg-indigo-100 text-indigo-600 border-indigo-200', 'bg-emerald-100 text-emerald-600 border-emerald-200',
          'bg-amber-100 text-amber-600 border-amber-200', 'bg-purple-100 text-purple-600 border-purple-200',
          'bg-cyan-100 text-cyan-600 border-cyan-200', 'bg-rose-100 text-rose-600 border-rose-200',
        ];
        let colorIdx = 0;
        responseData.forEach((job: any) => {
          if (job.applications) {
            job.applications.forEach((app: any) => {
              if (app.email && (app.email.includes('applicant_') || app.email.includes('@example.com') || app.email.includes('employee_'))) {
                return;
              }
              const nameParts = (app.name || 'Applicant').split(' ');
              const firstName = nameParts[0] || 'Applicant';
              const lastName = nameParts.slice(1).join(' ') || '';
              
              // Stage mapper
              let stage = app.status;
              if (app.status === 'AI_SCREENING') stage = 'AI Screening';
              else if (app.status === 'SHORTLISTED') stage = 'Shortlisting';
              else if (app.status === 'INTERVIEW') stage = 'Interviews';
              else if (app.status === 'OFFER') stage = 'Offer';
              else if (app.status === 'DOCUMENTS') stage = 'Documents';
              else if (app.status === 'HIRED') stage = 'Onboarding';
              else if (app.status === 'REJECTED') stage = 'Rejected';
              else stage = 'Applications';

              allCandidates.push({
                id: app.id,
                firstName,
                lastName,
                email: app.email || '',
                phone: app.phone || 'N/A',
                stage,
                source: app.source || 'Career Page',
                jobTitle: job.title,
                experience: app.experience || 'N/A',
                appliedDate: format(new Date(app.appliedAt), 'yyyy-MM-dd'),
                matchScore: Math.round(app.aiScore || 0),
                skills: app.skills || [],
                avatarColor: AVATAR_COLORS[colorIdx++ % AVATAR_COLORS.length],
                attachmentImages: app.attachmentImages || [],
                resumeUrl: app.resumeUrl || undefined,
                interviewDate: app.interviewDate ? (typeof app.interviewDate === 'string' ? app.interviewDate.split('T')[0] : format(new Date(app.interviewDate), 'yyyy-MM-dd')) : undefined,
                interviewTime: app.interviewTime,
                interviewType: app.interviewType,
                interviewer: app.interviewer,
                interviewLink: app.interviewLink || undefined,
                offerSalary: app.offerSalary,
                offerJoiningDate: app.offerJoiningDate ? format(new Date(app.offerJoiningDate), 'yyyy-MM-dd') : undefined,
                offerStatus: app.offerStatus,
                documentsVerified: app.documentsVerified,
                onboarded: app.onboarded,
                onboardingInviteId: app.onboardingInviteId,
              });
            });
          }
        });

        // Read stored statuses, shortlisted candidates, and scheduled interviews from localStorage
        let storedStatuses: { [key: string]: string } = {};
        try {
          const savedStr = localStorage.getItem('hrms_form_applicant_statuses');
          if (savedStr) storedStatuses = JSON.parse(savedStr);
        } catch (_) {}

        const storedShortlisted = getStoredShortlistedCandidates();
        const storedScheduled = getStoredScheduledInterviews();

        // Live fetch real-time responses from Google Form / Sheet CSV
        try {
          const liveSheetRes = await api.get('/recruitment/live-google-responses');
          if (liveSheetRes.data?.data?.responses?.length > 0) {
            const sheetRows = liveSheetRes.data.data.responses;
            sheetRows.forEach((r: any) => {
              if (r.email && !allCandidates.some(c => c.email === r.email)) {
                const isAccepted = storedStatuses[r.email] === 'accepted';
                const isDeclined = storedStatuses[r.email] === 'declined';
                
                let nameStr = r.fullName || 'Applicant';
                let phoneStr = r.mobile || 'N/A';
                let locationStr = r.location || 'WNP';
                let expStr = r.qualification || 'Degree';

                // Self-correct if fields were swapped
                if (phoneStr && /[a-zA-Z]/.test(phoneStr)) {
                  if (!nameStr || nameStr === 'Applicant') {
                    nameStr = phoneStr;
                    phoneStr = 'N/A';
                  }
                }
                if (locationStr && /^\+?\d{10,12}$/.test(locationStr.replace(/[\s-]/g, ''))) {
                  if (!phoneStr || phoneStr === 'N/A' || /[a-zA-Z]/.test(phoneStr)) {
                    phoneStr = locationStr;
                    locationStr = 'WNP';
                  }
                }
                if (expStr && ['mbnr', 'hyd', 'wnp', 'npl', 'hyderabad', 'wanaparthy', 'mahabubnagar'].includes(expStr.toLowerCase())) {
                  if (!locationStr || locationStr === 'WNP' || locationStr === 'N/A') {
                    locationStr = expStr.toUpperCase();
                    expStr = 'Degree';
                  }
                }

                allCandidates.push({
                  id: r.id || `cand-live-${Date.now()}`,
                  firstName: nameStr.split(' ')[0] || nameStr,
                  lastName: nameStr.split(' ').slice(1).join(' ') || '',
                  email: r.email,
                  phone: phoneStr,
                  stage: isAccepted ? 'Shortlisting' : isDeclined ? 'Rejected' : 'Applications',
                  source: 'Google Form',
                  jobTitle: 'Google Form Recruitment',
                  experience: expStr,
                  location: locationStr,
                  appliedDate: r.timestamp || '24/08/2026 10:58:33',
                  resumeUrl: r.resumeLink,
                  attachmentImages: [r.resumeLink],
                  matchScore: 85,
                  skills: ['Google Form'],
                  avatarColor: AVATAR_COLORS[colorIdx++ % AVATAR_COLORS.length]
                });
              }
            });
          }
        } catch (_) {}

        // Merge default fallback applicants (ensuring any accepted/declined ones retain their state)
        DEFAULT_FALLBACK_APPLICANTS.forEach(fb => {
          const isAccepted = storedStatuses[fb.email] === 'accepted' || storedStatuses[fb.id] === 'accepted' || storedStatuses[fb.email.toLowerCase()] === 'accepted';
          const isDeclined = storedStatuses[fb.email] === 'declined' || storedStatuses[fb.id] === 'declined' || storedStatuses[fb.email.toLowerCase()] === 'declined';
          const exists = allCandidates.some(c => (c.email && c.email.toLowerCase() === fb.email.toLowerCase()) || c.id === fb.id);
          if (!exists) {
            allCandidates.push({
              id: fb.id,
              firstName: fb.firstName,
              lastName: fb.lastName,
              email: fb.email,
              phone: fb.phone,
              stage: isAccepted ? 'Shortlisting' : isDeclined ? 'Rejected' : 'Applications',
              source: fb.source,
              jobTitle: fb.jobTitle,
              experience: fb.experience,
              location: fb.location,
              appliedDate: fb.appliedDate,
              resumeUrl: fb.resumeUrl,
              attachmentImages: fb.resumeUrl ? [fb.resumeUrl] : [],
              matchScore: 85,
              skills: ['Google Form', fb.experience || 'Degree'],
              avatarColor: AVATAR_COLORS[colorIdx++ % AVATAR_COLORS.length]
            });
          }
        });

        // Apply local storage statuses to all candidates (case-insensitive)
        allCandidates.forEach(cand => {
          const status = storedStatuses[cand.email] || (cand.email ? storedStatuses[cand.email.toLowerCase()] : undefined) || (cand.id ? storedStatuses[cand.id] : undefined);
          if (status === 'documents') {
            cand.stage = 'Documents';
          } else if (status === 'scheduled') {
            if (cand.stage !== 'Documents' && cand.stage !== 'Offer' && cand.stage !== 'Onboarding') {
              cand.stage = 'Interviews';
            }
          } else if (status === 'accepted') {
            if (cand.stage !== 'Interviews' && cand.stage !== 'Documents' && cand.stage !== 'Offer' && cand.stage !== 'Onboarding') {
              cand.stage = 'Shortlisting';
            }
          } else if (status === 'declined') {
            cand.stage = 'Rejected';
          }
        });

        // Merge stored scheduled interviews into allCandidates
        storedScheduled.forEach(si => {
          const idx = allCandidates.findIndex(c => (c.email && si.email && c.email.toLowerCase() === si.email.toLowerCase()) || (c.id && c.id === si.id));
          if (idx >= 0) {
            allCandidates[idx] = {
              ...allCandidates[idx],
              stage: si.stage || allCandidates[idx].stage,
              interviewDate: si.interviewDate || allCandidates[idx].interviewDate,
              interviewTime: si.interviewTime || allCandidates[idx].interviewTime,
              interviewType: si.interviewType || allCandidates[idx].interviewType,
              interviewer: si.interviewer || allCandidates[idx].interviewer,
              interviewLink: si.interviewLink || allCandidates[idx].interviewLink,
            };
          } else {
            allCandidates.unshift({ ...si, stage: si.stage || 'Interviews' });
          }
        });

        // Merge stored shortlisted candidates into allCandidates
        storedShortlisted.forEach(sc => {
          const idx = allCandidates.findIndex(c => (c.email && sc.email && c.email.toLowerCase() === sc.email.toLowerCase()) || (c.id && c.id === sc.id));
          if (idx >= 0) {
            if (allCandidates[idx].stage !== 'Interviews' && allCandidates[idx].stage !== 'Offer' && allCandidates[idx].stage !== 'Documents' && allCandidates[idx].stage !== 'Onboarding') {
              allCandidates[idx].stage = 'Shortlisting';
            }
          } else {
            allCandidates.unshift({ ...sc, stage: 'Shortlisting' });
          }
        });

        // Merge stored uploaded docs into each candidate's attachmentImages
        allCandidates.forEach(cand => {
          try {
            const code = getCandidateCode(cand);
            const extraDocs = getStoredCandidateDocs(cand.id, cand.email, code);
            if (extraDocs.length > 0) {
              const currentAtts = cand.attachmentImages || [];
              const combined = [...currentAtts];
              extraDocs.forEach(d => {
                if (!combined.includes(d)) combined.push(d);
              });
              cand.attachmentImages = combined;
            }
          } catch (_) {}
        });

        setCandidates(allCandidates);
      }
    } catch (err) {
      console.error('Failed to load recruitment data', err);
      // Restore state from localStorage and fallbacks so page refresh never loses data
      let storedStatuses: { [key: string]: string } = {};
      try {
        const savedStr = localStorage.getItem('hrms_form_applicant_statuses');
        if (savedStr) storedStatuses = JSON.parse(savedStr);
      } catch (_) {}
      const storedShortlisted = getStoredShortlistedCandidates();
      const storedScheduled = getStoredScheduledInterviews();

      const fallbackList: Candidate[] = [...storedShortlisted, ...storedScheduled];
      DEFAULT_FALLBACK_APPLICANTS.forEach(fb => {
        const isAccepted = storedStatuses[fb.email] === 'accepted' || storedStatuses[fb.id] === 'accepted' || storedStatuses[fb.email.toLowerCase()] === 'accepted';
        const isDeclined = storedStatuses[fb.email] === 'declined' || storedStatuses[fb.id] === 'declined' || storedStatuses[fb.email.toLowerCase()] === 'declined';
        if (!fallbackList.some(c => (c.email && c.email.toLowerCase() === fb.email.toLowerCase()) || c.id === fb.id)) {
          fallbackList.push({
            id: fb.id,
            firstName: fb.firstName,
            lastName: fb.lastName,
            email: fb.email,
            phone: fb.phone,
            stage: isAccepted ? 'Shortlisting' : isDeclined ? 'Rejected' : 'Applications',
            source: fb.source,
            jobTitle: fb.jobTitle,
            experience: fb.experience,
            location: fb.location,
            appliedDate: fb.appliedDate,
            resumeUrl: fb.resumeUrl,
            attachmentImages: fb.resumeUrl ? [fb.resumeUrl] : [],
            matchScore: 85,
            skills: ['Google Form', fb.experience || 'Degree'],
            avatarColor: 'bg-emerald-100 text-emerald-600 border-emerald-200'
          });
        }
      });

      fallbackList.forEach(cand => {
        try {
          const code = getCandidateCode(cand);
          const extraDocs = getStoredCandidateDocs(cand.id, cand.email, code);
          if (extraDocs.length > 0) {
            const currentAtts = cand.attachmentImages || [];
            const combined = [...currentAtts];
            extraDocs.forEach(d => {
              if (!combined.includes(d)) combined.push(d);
            });
            cand.attachmentImages = combined;
          }
        } catch (_) {}
      });

      setCandidates(fallbackList);
    } finally {
      setLoading(false);
    }
  };

  const pollLiveSheetResponses = async () => {
    try {
      const res = await api.get(`/recruitment/live-google-responses?t=${Date.now()}`);
      if (res.data?.data?.responses?.length > 0) {
        setLiveSheetResponses(res.data.data.responses);
      }
    } catch (_) {}
  };

  useEffect(() => {
    loadRecruitmentData();
    pollLiveSheetResponses();

    // Auto-update live Google Sheet submissions every 3 seconds in real time
    const intervalId = setInterval(() => {
      pollLiveSheetResponses();
    }, 3000);

    return () => clearInterval(intervalId);
  }, []);

  // Update candidate status backend & local storage
  const updateCandidateStage = async (candidateId: string, status: string) => {
    const targetStage = status === 'REJECTED' ? 'Rejected' : status === 'SHORTLISTED' ? 'Shortlisting' : status;
    
    setCandidates(prev => {
      const updatedList = prev.map(c => c.id === candidateId ? { ...c, stage: targetStage } : c);
      saveStoredShortlistedCandidates(updatedList.filter(cand => cand.stage === 'Shortlisting'));
      return updatedList;
    });

    if (selectedCandidate && selectedCandidate.id === candidateId) {
      setSelectedCandidate(prev => prev ? { ...prev, stage: targetStage } : null);
    }

    if (targetStage === 'Rejected') {
      const candObj = candidates.find(c => c.id === candidateId);
      if (candObj?.email) {
        setFormApplicantStatuses(prev => {
          const updated = { ...prev, [candObj.email]: 'declined' as const };
          try {
            localStorage.setItem('hrms_form_applicant_statuses', JSON.stringify(updated));
          } catch (_) {}
          return updated;
        });
      }
    }

    if (candidateId && !candidateId.startsWith('cand-')) {
      try {
        await api.patch(`/recruitment/applications/${candidateId}/status`, { status });
      } catch (err) {
        console.warn('Backend status update notice:', err);
      }
    }
  };

  // Stage 1 media uploader state
  const [jobFilePreview, setJobFilePreview] = useState<string | null>(null);
  const [jobFileName, setJobFileName] = useState<string>('');
  const [jobFileSize, setJobFileSize] = useState<string>('');

  const handleJobFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('File size exceeds 5MB limit.');
        return;
      }
      setJobFileName(file.name);
      setJobFileSize((file.size / (1024 * 1024)).toFixed(2) + ' MB');
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Str = reader.result as string;
        setNewJob(prev => ({ ...prev, mediaUrl: base64Str }));
        setJobFilePreview(base64Str);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveJobFile = () => {
    setNewJob(prev => ({ ...prev, mediaUrl: '' }));
    setJobFilePreview(null);
    setJobFileName('');
    setJobFileSize('');
  };

  // Submit Job Posting
  const handleCreateJobSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJob.title || !newJob.description) {
      alert('Please fill out all fields.');
      return;
    }
    try {
      const res = await api.post('/recruitment/jobs', newJob);
      const createdJob = res.data.data;
      alert(`Job "${createdJob.title}" created successfully!`);
      setSelectedJobId(createdJob.id);
      setNewJob({
        title: '',
        department: 'Engineering',
        location: 'Remote',
        description: '',
        requirements: '',
        type: 'Full-time',
        mediaUrl: ''
      });
      setJobFilePreview(null);
      setJobFileName('');
      setJobFileSize('');
      await loadRecruitmentData();
      setActiveTab('stage-3');
    } catch (err) {
      alert('Failed to create job posting.');
    }
  };

  // Trigger Job Posting integrations logs simulation
  const handlePublishJobIntegrations = async () => {
    if (!selectedJobId) {
      alert('Please select a job to distribute.');
      return;
    }
    setIsPosting(true);
    setIntegrationLogs([]);
    setPostingSuccessJobId(null);
    
    const job = jobs.find(j => j.id === selectedJobId);
    const logs = [
      `[INFO] Initializing multi-channel API handshake for "${job?.title}"...`,
      `[INFO] Establishing secure OAuth2 handshake with job platforms...`,
    ];
    
    setIntegrationLogs([...logs]);
    
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    
    await sleep(800);
    if (postingChannels.linkedin) {
      logs.push(`[INFO] Authenticating with LinkedIn Recruiter API...`);
      setIntegrationLogs([...logs]);
      await sleep(600);
      logs.push(`[SUCCESS] LinkedIn connection verified. Pushed description schema.`);
      logs.push(`[SUCCESS] LinkedIn Posting Active: URL linkd.in/job/${selectedJobId.substring(0, 6)}`);
      setIntegrationLogs([...logs]);
    }
    
    await sleep(600);
    if (postingChannels.naukri) {
      logs.push(`[INFO] Connecting to Naukri FastForward API payload gateway...`);
      setIntegrationLogs([...logs]);
      await sleep(800);
      logs.push(`[SUCCESS] Naukri schema matching validated. Post live. ID: nkr_${selectedJobId.substring(0, 6)}`);
      setIntegrationLogs([...logs]);
    }
    
    await sleep(600);
    if (postingChannels.wellfound) {
      logs.push(`[INFO] Pushing startup tags and location credentials to Wellfound...`);
      setIntegrationLogs([...logs]);
      await sleep(700);
      logs.push(`[SUCCESS] Wellfound listing approved. Status: LIVE.`);
      setIntegrationLogs([...logs]);
    }
    
    await sleep(500);
    if (postingChannels.indeed) {
      logs.push(`[INFO] Distributing XML feed parser indexing payload to Indeed...`);
      setIntegrationLogs([...logs]);
      await sleep(500);
      logs.push(`[SUCCESS] Indeed aggregator updated.`);
      setIntegrationLogs([...logs]);
    }
    
    await sleep(600);
    logs.push(`[INFO] Refreshing company internal career site...`);
    setIntegrationLogs([...logs]);
    await sleep(500);
    logs.push(`[SUCCESS] Career portal index rebuilt successfully.`);
    logs.push(`[SUCCESS] End-to-End Distribution completed. Job status updated to OPEN.`);
    setIntegrationLogs([...logs]);
    
    try {
      await api.patch(`/recruitment/jobs/${selectedJobId}/status`, { status: 'OPEN' });
      await loadRecruitmentData();
    } catch {}
    
    setIsPosting(false);
    setPostingSuccessJobId(selectedJobId);
  };

  // Submit Candidate Application
  const handleAddApplicantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const jobIdToUse = newApplicant.jobId || selectedJobId;
    if (!jobIdToUse) {
      alert('Please select or create a job posting first.');
      return;
    }
    if (!newApplicant.firstName || !newApplicant.lastName || !newApplicant.email) {
      alert('Please fill out Name and Email.');
      return;
    }
    try {
      await api.post('/recruitment/applications', {
        ...newApplicant,
        jobId: jobIdToUse
      });
      alert('Candidate application received successfully!');
      setNewApplicant({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        experience: '3 Years',
        source: 'LinkedIn',
        skills: 'React, TypeScript, CSS',
        jobId: ''
      });
      await loadRecruitmentData();
      setActiveTab('stage-4'); // move to AI Screening view
    } catch (err) {
      alert('Failed to add candidate.');
    }
  };

  // Run AI screen simulation
  const handleRunAIScreen = async (candidateId: string) => {
    setScreeningCandId(candidateId);
    setScreeningLogs([]);
    
    const candidate = candidates.find(c => c.id === candidateId);
    const logs = [
      `[AI COGNITIVE INIT] Accessing resume database indexing parser...`,
      `[AI SEMANTIC INDEX] Analysing skills matrix for "${candidate?.firstName} ${candidate?.lastName}"...`,
    ];
    setScreeningLogs([...logs]);
    
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    
    await sleep(800);
    logs.push(`[AI COMPILING] Reviewing professional experience: "${candidate?.experience}"...`);
    setScreeningLogs([...logs]);
    
    await sleep(700);
    logs.push(`[AI SEMANTICS] Matching parsed skills [${candidate?.skills.join(', ')}] against "${candidate?.jobTitle}" requirements...`);
    setScreeningLogs([...logs]);
    
    await sleep(800);
    logs.push(`[AI MATRIX SUCCESS] Semantic fit and matching coefficients calculated.`);
    setScreeningLogs([...logs]);
    
    await sleep(400);
    try {
      const res = await api.patch(`/recruitment/applications/${candidateId}/ai-screen`);
      const updated = res.data.data;
      logs.push(`[AI SUCCESS] Scoring completed successfully! Match score evaluated at: ${updated.aiScore}%`);
      setScreeningLogs([...logs]);
      await loadRecruitmentData();
    } catch (err) {
      logs.push(`[AI ERROR] Backend validation error occurred.`);
      setScreeningLogs([...logs]);
    }
    
    await sleep(1000);
    setScreeningCandId(null);
  };

  // Schedule Interview
  const handleScheduleInterview = async (candidateId: string) => {
    if (!candidateId) {
      alert('Please select a candidate to schedule an interview.');
      return;
    }
    if (!interviewForm.date || !interviewForm.time || !interviewForm.interviewer || !interviewForm.link || !interviewForm.link.trim()) {
      alert('Please fill out Date, Time Slot, Interviewer, and Video Meeting Link (Required).');
      return;
    }

    const normTime = interviewForm.time.trim().toLowerCase();
    const normDate = interviewForm.date.trim();

    // Block duplicate time slot on the same date
    const conflictingCand = candidates.find(c => 
      c.id !== candidateId && 
      c.email !== candidateId &&
      c.interviewDate === normDate && 
      (c.interviewTime || '').trim().toLowerCase() === normTime
    );

    if (conflictingCand) {
      alert(`⚠️ Time slot "${interviewForm.time}" is already booked on ${normDate} for candidate ${conflictingCand.firstName} ${conflictingCand.lastName}. Please select a different time slot.`);
      return;
    }

    const meetingLink = interviewForm.link.trim();
    const targetCand = candidates.find(c => c.id === candidateId || c.email === candidateId);

    const updatedScheduledCand: Candidate = {
      ...(targetCand || {
        id: candidateId,
        firstName: 'Applicant',
        lastName: '',
        email: candidateId.includes('@') ? candidateId : `cand_${candidateId}@example.com`,
        phone: 'N/A',
        source: 'Google Form',
        jobTitle: 'Google Form Recruitment',
        experience: 'Degree',
        appliedDate: format(new Date(), 'yyyy-MM-dd'),
        matchScore: 85,
        skills: ['Scheduled Interview']
      }),
      stage: 'Interviews',
      interviewDate: interviewForm.date,
      interviewTime: interviewForm.time,
      interviewType: interviewForm.type,
      interviewer: interviewForm.interviewer,
      interviewLink: meetingLink
    };

    // Update local candidates state immediately
    setCandidates(prev => {
      let found = false;
      const updatedList = prev.map(c => {
        if (c.id === candidateId || c.email === candidateId || (targetCand && c.id === targetCand.id)) {
          found = true;
          return updatedScheduledCand;
        }
        return c;
      });
      return found ? updatedList : [updatedScheduledCand, ...prev];
    });

    // Save to localStorage scheduled interviews
    const currentScheduled = getStoredScheduledInterviews();
    const existingIdx = currentScheduled.findIndex(c => c.id === candidateId || (c.email && targetCand?.email && c.email === targetCand.email));
    let nextScheduled: Candidate[];
    if (existingIdx >= 0) {
      nextScheduled = currentScheduled.map((c, idx) => idx === existingIdx ? updatedScheduledCand : c);
    } else {
      nextScheduled = [updatedScheduledCand, ...currentScheduled];
    }
    saveStoredScheduledInterviews(nextScheduled);

    // Update formApplicantStatuses so localStorage reflects scheduled status
    const candEmail = targetCand?.email || candidateId;
    setFormApplicantStatuses(prev => {
      const updated = { ...prev, [candEmail]: 'scheduled' as const };
      try {
        localStorage.setItem('hrms_form_applicant_statuses', JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });

    if (candidateId && !candidateId.startsWith('cand-')) {
      try {
        await api.patch(`/recruitment/applications/${candidateId}/interview`, {
          interviewDate: interviewForm.date,
          interviewTime: interviewForm.time,
          interviewType: interviewForm.type,
          interviewer: interviewForm.interviewer,
          interviewLink: meetingLink
        });
      } catch (err) {
        console.warn('Backend update warning:', err);
      }
    }

    alert(`📅 Interview scheduled successfully for ${targetCand ? targetCand.firstName + ' ' + targetCand.lastName : 'Candidate'} on ${interviewForm.date} at ${interviewForm.time}!`);
    setShowScheduleModal(false);
  };

  // Pass or Fail Interview
  const handleInterviewDecision = async (candidateId: string, decision: 'pass' | 'fail') => {
    try {
      const targetCand = candidates.find(c => c.id === candidateId || c.email === candidateId);
      const candEmail = targetCand?.email || candidateId;
      const targetStage = decision === 'pass' ? 'Documents' : 'Rejected';

      // Update React state candidates
      setCandidates(prev => {
        return prev.map(c => {
          if (c.id === candidateId || c.email === candidateId || (targetCand && c.id === targetCand.id)) {
            return { ...c, stage: targetStage };
          }
          return c;
        });
      });

      // Persist in localStorage scheduled interviews
      const currentScheduled = getStoredScheduledInterviews();
      const nextScheduled = currentScheduled.map(c => {
        if (c.id === candidateId || (c.email && targetCand?.email && c.email === targetCand.email)) {
          return { ...c, stage: targetStage };
        }
        return c;
      });
      saveStoredScheduledInterviews(nextScheduled);

      // Persist in formApplicantStatuses
      setFormApplicantStatuses(prev => {
        const updated = { ...prev, [candEmail]: decision === 'pass' ? ('documents' as const) : ('declined' as const) };
        try {
          localStorage.setItem('hrms_form_applicant_statuses', JSON.stringify(updated));
        } catch (_) {}
        return updated;
      });

      // Update Backend DB if real database application
      if (candidateId && !candidateId.startsWith('cand-')) {
        try {
          await api.patch(`/recruitment/applications/${candidateId}/interview`, { decision });
        } catch (err) {
          console.warn('Backend interview decision notice:', err);
        }
      }

      if (decision === 'pass') {
        alert(`🎉 Interview passed for ${targetCand ? targetCand.firstName + ' ' + targetCand.lastName : 'Candidate'}! Profile moved to Stage 8: Document Verification tab.`);
        setActiveTab('stage-8');
      } else {
        alert(`❌ Candidate ${targetCand ? targetCand.firstName + ' ' + targetCand.lastName : ''} marked as rejected.`);
      }
    } catch (err) {
      alert('Failed to save interview decision.');
    }
  };

  // Generate & extend Offer
  const handleExtendOfferSubmit = async (candidateId: string) => {
    if (!offerForm.joiningDate || !offerForm.salary) {
      alert('Please fill out Joining Date and Base Salary.');
      return;
    }
    try {
      await api.patch(`/recruitment/applications/${candidateId}/offer`, {
        offerSalary: Number(offerForm.salary),
        offerJoiningDate: offerForm.joiningDate,
        offerStatus: 'SENT'
      });
      alert('Offer extended and sent to candidate successfully!');
      await loadRecruitmentData();
    } catch (err) {
      alert('Failed to extend offer.');
    }
  };

  // Simulate Candidate Offer Acceptance
  const handleSimulateOfferAcceptance = async (candidateId: string) => {
    try {
      await api.patch(`/recruitment/applications/${candidateId}/offer`, {
        offerStatus: 'ACCEPTED'
      });
      alert('Candidate has ACCEPTED the offer! Moving candidate to Document Collection.');
      await loadRecruitmentData();
    } catch (err) {
      alert('Failed to accept offer.');
    }
  };

  // Upload mock verification doc
  const handleUploadMockDoc = async (candidateId: string, docType: string) => {
    setUploadingDocType(docType);
    
    // Generate a simple Canvas mock document scan in base64
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 300, 400);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 12;
      ctx.strokeRect(0, 0, 300, 400);
      
      ctx.fillStyle = '#6366f1';
      ctx.fillRect(30, 30, 240, 40);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(docType.toUpperCase() + ' SCAN', 45, 55);
      
      ctx.fillStyle = '#475569';
      ctx.font = '10px sans-serif';
      ctx.fillText('Candidate Verification Doc', 45, 120);
      ctx.fillText('Verified HR Portal Copy', 45, 140);
      ctx.fillText(`Issued: ${new Date().toLocaleDateString()}`, 45, 160);
      
      // Draw details lines
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(30, 200); ctx.lineTo(270, 200);
      ctx.moveTo(30, 240); ctx.lineTo(270, 240);
      ctx.moveTo(30, 280); ctx.lineTo(270, 280);
      ctx.stroke();
    }
    
    const base64Str = canvas.toDataURL('image/png');
    
    try {
      await api.post(`/recruitment/applications/${candidateId}/attachments`, {
        attachmentImage: base64Str
      });
      alert(`Mock document "${docType}" uploaded successfully.`);
      await loadRecruitmentData();
    } catch {
      alert('Failed to upload mock document.');
    } finally {
      setUploadingDocType(null);
    }
  };

  // Upload or attach Google Drive document link
  const handleSaveDriveLink = async () => {
    if (!driveUploadModal) return;
    const link = driveLinkInput.trim();
    if (!link) {
      alert('Please enter a valid Google Drive or document link.');
      return;
    }
    if (!link.startsWith('http://') && !link.startsWith('https://')) {
      alert('Please enter a valid URL starting with http:// or https://');
      return;
    }

    setSavingDriveLink(true);
    try {
      const docName = driveDocTitleInput.trim() || driveUploadModal.docType;
      const driveMatch = link.match(/(?:id=|\/d\/|\/uc\?.*id=)([a-zA-Z0-9_-]{25,})/);
      const driveId = driveMatch ? driveMatch[1] : undefined;

      const attachmentPayload = JSON.stringify({
        id: driveId || `att-${Date.now()}`,
        name: docName,
        docType: driveUploadModal.docType,
        docField: driveUploadModal.docField,
        url: link,
        previewUrl: driveId ? `https://drive.google.com/file/d/${driveId}/preview` : link,
        originalUrl: driveId ? `https://drive.google.com/file/d/${driveId}/view` : link,
        driveId,
        type: 'pdf',
        uploadedAt: new Date().toISOString()
      });

      const candidateId = driveUploadModal.candidateId;
      const candidateEmail = driveUploadModal.candidateEmail || '';
      const candidateCode = driveUploadModal.candidateCode || '';

      // 1. Try to save to backend if real candidate
      if (candidateId && !candidateId.startsWith('cand-shiva-') && !candidateId.startsWith('cand-live-')) {
        try {
          await api.post(`/recruitment/applications/${candidateId}/attachments`, {
            attachmentImage: attachmentPayload
          });
        } catch (err) {
          console.warn('Backend attachment sync warning:', err);
        }
      }

      // 2. Save to localStorage document uploads for persistence across refresh
      try {
        const keysToSave = new Set<string>();
        if (candidateId) keysToSave.add(`hrms_candidate_docs_${candidateId}`);
        if (candidateEmail) {
          keysToSave.add(`hrms_candidate_docs_${candidateEmail}`);
          keysToSave.add(`hrms_candidate_docs_${candidateEmail.toLowerCase()}`);
        }
        if (candidateCode) keysToSave.add(`hrms_candidate_docs_${candidateCode}`);

        keysToSave.forEach(k => {
          const existing: string[] = JSON.parse(localStorage.getItem(k) || '[]');
          const filtered = existing.filter(item => {
            try {
              const p = JSON.parse(item);
              if (p.url === link) return false;
              if (driveUploadModal.docField && driveUploadModal.docField !== 'additional' && p.docField === driveUploadModal.docField) return false;
            } catch (_) {}
            return true;
          });
          filtered.push(attachmentPayload);
          localStorage.setItem(k, JSON.stringify(filtered));
        });

        // Also save to master dictionary
        const master: { [key: string]: string[] } = JSON.parse(localStorage.getItem('hrms_all_uploaded_documents') || '{}');
        [candidateId, candidateEmail, candidateEmail?.toLowerCase(), candidateCode].filter(Boolean).forEach(key => {
          if (key) {
            const list = master[key] || [];
            const filtered = list.filter(item => {
              try {
                const p = JSON.parse(item);
                if (p.url === link) return false;
                if (driveUploadModal.docField && driveUploadModal.docField !== 'additional' && p.docField === driveUploadModal.docField) return false;
              } catch (_) {}
              return true;
            });
            filtered.push(attachmentPayload);
            master[key] = filtered;
          }
        });
        localStorage.setItem('hrms_all_uploaded_documents', JSON.stringify(master));
      } catch (_) {}

      // 3. Update candidates state directly so it renders immediately
      setCandidates(prev => {
        return prev.map(cand => {
          const candEmail = (cand.email || '').toLowerCase();
          const targetEmail = candidateEmail.toLowerCase();
          const isMatch = cand.id === candidateId || 
            (targetEmail && candEmail && candEmail === targetEmail) ||
            (candidateCode && getCandidateCode(cand) === candidateCode);
          if (isMatch) {
            const currentAtts = (cand.attachmentImages || []).filter(item => {
              try {
                const p = JSON.parse(item);
                if (p.url === link) return false;
                if (driveUploadModal.docField && driveUploadModal.docField !== 'additional' && p.docField === driveUploadModal.docField) return false;
              } catch (_) {}
              return true;
            });
            return { ...cand, attachmentImages: [...currentAtts, attachmentPayload] };
          }
          return cand;
        });
      });

      alert(`✅ Document "${docName}" attached successfully via Google Drive link!`);
      setDriveUploadModal(null);
      setDriveLinkInput('');
      setDriveDocTitleInput('');
    } catch (err: any) {
      alert(err.message || 'Failed to save Google Drive link.');
    } finally {
      setSavingDriveLink(false);
    }
  };

  // Delete/remove attached document
  const handleDeleteDoc = (candidateId: string, candidateEmail: string | undefined, attIdentifier: string) => {
    if (!confirm('Are you sure you want to remove this attached document?')) return;
    
    setCandidates(prev => {
      return prev.map(cand => {
        const candEmail = (cand.email || '').toLowerCase();
        const targetEmail = (candidateEmail || '').toLowerCase();
        const isMatch = cand.id === candidateId || (targetEmail && candEmail === targetEmail);
        if (isMatch) {
          const updated = (cand.attachmentImages || []).filter((item, idx) => {
            try {
              const p = JSON.parse(item);
              if (p.id === attIdentifier || p.url === attIdentifier) return false;
            } catch (_) {
              if (item === attIdentifier || `att-${idx}` === attIdentifier) return false;
            }
            return true;
          });
          return { ...cand, attachmentImages: updated };
        }
        return cand;
      });
    });

    try {
      const keys = [
        `hrms_candidate_docs_${candidateId}`,
        candidateEmail ? `hrms_candidate_docs_${candidateEmail}` : null,
        candidateEmail ? `hrms_candidate_docs_${candidateEmail.toLowerCase()}` : null
      ].filter(Boolean) as string[];

      keys.forEach(k => {
        const existing: string[] = JSON.parse(localStorage.getItem(k) || '[]');
        const filtered = existing.filter((item, idx) => {
          try {
            const p = JSON.parse(item);
            if (p.id === attIdentifier || p.url === attIdentifier) return false;
          } catch (_) {
            if (item === attIdentifier || `att-${idx}` === attIdentifier) return false;
          }
          return true;
        });
        localStorage.setItem(k, JSON.stringify(filtered));
      });
    } catch (_) {}
  };

  // Verify and Approve Candidate Documents
  const handleVerifyDocumentsSubmit = async (candidateId: string) => {
    try {
      await api.patch(`/recruitment/applications/${candidateId}/documents-verify`, {
        verified: true
      });
      alert('Documents verified and approved! Candidate is now HIRED. Moving to Onboarding.');
      await loadRecruitmentData();
      setActiveTab('stage-9');
    } catch (err) {
      alert('Failed to verify documents.');
    }
  };

  // Trigger real Onboarding invite
  const handleInitiateSystemOnboarding = async (candidateId: string) => {
    setOnboardingProgressId(candidateId);
    setOnboardingInviteResult(null);
    try {
      const res = await api.post(`/recruitment/applications/${candidateId}/onboard`);
      setOnboardingInviteResult(res.data.data);
      alert('Onboarding Invite successfully generated in system database!');
      await loadRecruitmentData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to create onboarding invite.');
    } finally {
      setOnboardingProgressId(null);
    }
  };

  // Helper values for dashboard charts (exclude bulk auto-synced entries from board counts without database loss)
  const boardCandidates = candidates.filter(c => c.source !== 'Google Form' && !c.email.includes('applicant_') && !c.email.includes('@example.com'));
  const visibleJobs = jobs.filter(j => !j.title.includes('Google Form Recruitment'));
  const SOURCE_DATA = boardCandidates.reduce<any[]>((acc, cur) => {
    const existing = acc.find(x => x.name === cur.source);
    if (existing) {
      existing.value += 1;
    } else {
      acc.push({ name: cur.source, value: 1, fill: SOURCE_FILLS[cur.source] || SOURCE_FILLS.Others });
    }
    return acc;
  }, []);

  const TABS = [
    { value: 'dashboard', label: 'Dashboard', icon: BarChart2, hasDot: true },
    { value: 'stage-2', label: '1. Job Posting', icon: Globe },
    { value: 'stage-5', label: '2. Shortlisting', icon: StarHalf },
    { value: 'stage-6', label: '3. Interviews', icon: Calendar },
    { value: 'stage-8', label: '4. Documents', icon: FolderOpen },
    { value: 'stage-7', label: '5. Offer', icon: Award },
    { value: 'stage-9', label: '6. Onboarding', icon: UserPlus },
    { value: 'candidates', label: 'All Applicants', icon: Users },
  ];

  return (
    <div className="recruitment-page">
      {/* ── Top Header Bar ─────────────────────────────────────────────── */}
      <div className="rec-topbar">
        <div className="rec-topbar-left">
          <div className="rec-title-block">
            <div className="rec-title-icon">
              <Briefcase className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="rec-page-title">Recruitment Console</h1>
              <div className="rec-live-status">
                <span className="rec-live-dot" />
                <span className="rec-live-text">Live · {visibleJobs.filter(j => j.status === 'Published' || j.status === 'OPEN').length} Active Jobs</span>
              </div>
            </div>
          </div>
        </div>
        <div className="rec-topbar-right">
          <div className="rec-search-wrap">
            <Search className="rec-search-icon" />
            <input
              type="text"
              className="rec-search-input"
              placeholder="Search candidates, jobs..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="rec-icon-btn" id="rec-refresh-btn" onClick={loadRecruitmentData}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* ── Top Navigation Tabs Strip ────────────────────────────────────── */}
      <div 
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.5rem 0.75rem',
          background: '#ffffff',
          borderRadius: '0.75rem',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          marginBottom: '1.25rem',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}
        className="rec-nav-tabs-strip"
      >
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.45rem 0.85rem',
                borderRadius: '0.5rem',
                fontSize: '0.78rem',
                fontWeight: isActive ? 700 : 600,
                color: isActive ? '#ffffff' : '#475569',
                background: isActive ? 'linear-gradient(135deg, #5850ec 0%, #4f46e5 100%)' : 'transparent',
                border: 0,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                boxShadow: isActive ? '0 2px 8px rgba(79, 70, 229, 0.25)' : 'none'
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = '#f1f5f9';
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              <Icon style={{ width: '15px', height: '15px', color: isActive ? '#ffffff' : '#64748b' }} />
              <span>{tab.label}</span>
              {tab.hasDot && isActive && (
                <span 
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '5px',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#fbbf24'
                  }} 
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 gap-2 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            <p className="font-semibold text-sm">Loading Recruitment Data...</p>
          </div>
        ) : (
          <motion.div 
            key={activeTab} 
            initial={{ opacity: 0, y: 8 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0 }} 
            transition={{ duration: 0.18 }}
            className="rec-content"
          >
            {/* ════════════════ DASHBOARD ════════════════ */}
            {activeTab === 'dashboard' && (
              <>

                {/* KPI Stats Row */}
                <div className="rec-stats-grid">
                  <StatCard icon={Briefcase} title="Active Jobs" value={visibleJobs.filter(j => j.status === 'Published' || j.status === 'OPEN').length.toString()} trend="Job listings online" color="blue" />
                  <StatCard icon={Calendar} title="Interviews Scheduled" value={candidates.filter(c => c.stage === 'Interviews').length.toString()} trend="Interviews in progress" color="purple" />
                  <StatCard icon={Send} title="Offers Issued" value={candidates.filter(c => c.stage === 'Offer').length.toString()} trend="Offer stage candidate" color="amber" />
                  <StatCard icon={UserCheck} title="Onboarding" value={candidates.filter(c => c.stage === 'Onboarding').length.toString()} trend="Onboarding in system" color="emerald" />
                </div>

                {/* Main Dashboard Layout */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
                  {/* Candidates pipeline columns */}
                  <div className="rec-card" style={{ padding: '1.5rem' }}>
                    <div className="rec-section-header" style={{ marginBottom: '1.25rem' }}>
                      <div>
                        <h2 className="rec-section-title">Hiring Pipeline Board</h2>
                        <p className="rec-section-sub">Candidate count across primary recruitment phases</p>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                      {[
                        { key: 'Applications', label: 'Applied', color: '#3b82f6', bg: 'rgba(59,89,152,0.08)' },
                        { key: 'AI Screening', label: 'AI Screen', color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)' },
                        { key: 'Shortlisting', label: 'Shortlist', color: '#06b6d4', bg: 'rgba(6,182,212,0.08)' },
                        { key: 'Interviews', label: 'Interview', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
                        { key: 'Offer', label: 'Offer', color: '#f97316', bg: 'rgba(249,115,22,0.08)' },
                        { key: 'Onboarding', label: 'Hired', color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
                      ].map(stage => {
                        const count = boardCandidates.filter(c => c.stage === stage.key).length;
                        return (
                          <div key={stage.key} style={{ background: stage.bg, padding: '1rem', borderRadius: '0.75rem', textAlign: 'center', border: `1px solid ${stage.color}15` }}>
                            <p style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>{stage.label}</p>
                            <p style={{ fontSize: '1.75rem', fontWeight: 800, color: stage.color, marginTop: '0.25rem' }}>{count}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Quick stats & tools */}
                  <div className="rec-card" style={{ padding: '1.25rem' }}>
                    <h3 className="rec-panel-title" style={{ marginBottom: '0.75rem' }}>Candidate Sources</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {SOURCE_DATA.length === 0 ? (
                        <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>No applicants in database yet.</p>
                      ) : (
                        SOURCE_DATA.map((src, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', padding: '0.35rem 0.5rem', background: '#f8fafc', borderRadius: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: src.fill }} />
                              <span style={{ fontWeight: 600, color: '#334155' }}>{src.name}</span>
                            </div>
                            <span style={{ fontWeight: 700, color: '#475569' }}>{src.value} candidates</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ════════════════ STAGE 1: GOOGLE FORM APPLICATION ════════════════ */}
            {activeTab === 'stage-1' && (
              <div className="rec-card" style={{ padding: '1.5rem', width: '100%', maxWidth: '1000px', margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ padding: '0.5rem', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', borderRadius: '0.75rem', display: 'flex' }}>
                      <FileText className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h2 className="rec-section-title" style={{ fontSize: '1.1rem' }}>Stage 1: Official Recruitment Google Form</h2>
                      <p className="rec-section-sub">Collect job applications, candidate details, and resume attachments directly into the system</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(googleFormUrl);
                        alert('✅ Google Form link copied to clipboard!');
                      }}
                      className="rec-btn-outline"
                      style={{ fontSize: '0.75rem', height: '34px', gap: '5px' }}
                    >
                      <Copy className="h-3.5 w-3.5 text-indigo-600" /> Copy Form Link
                    </button>

                    <a
                      href={googleFormUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rec-btn-primary"
                      style={{ fontSize: '0.75rem', height: '34px', gap: '5px', textDecoration: 'none', background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)' }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open Google Form
                    </a>
                  </div>
                </div>

                <div style={{ width: '100%', borderRadius: '0.75rem', overflow: 'hidden', border: '1px solid #e2e8f0', background: '#faf5ff' }}>
                  <iframe
                    src={googleFormEmbedUrl}
                    width="100%"
                    height="750"
                    frameBorder="0"
                    marginHeight={0}
                    marginWidth={0}
                    title="Recruitment Application Google Form"
                    style={{ display: 'block', borderRadius: '0.75rem', border: 0 }}
                  >
                    Loading Google Form...
                  </iframe>
                </div>
              </div>
            )}

            {/* ════════════════ STAGE 2: JOB POSTING ════════════════ */}
            {activeTab === 'stage-2' && (
              <div className="rec-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>


                {/* ── Official Google Form Recruitment Link Card ── */}
                <div style={{ background: 'linear-gradient(135deg, #f3e8ff 0%, #e0e7ff 100%)', border: '1px solid #c084fc', borderRadius: '0.85rem', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ padding: '0.6rem', background: '#7c3aed', borderRadius: '0.5rem', color: '#fff', display: 'flex' }}>
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#4c1d95', margin: 0 }}>Official Recruitment Google Form Link</h3>
                      <p style={{ fontSize: '0.7rem', color: '#6b21a8', margin: '2px 0 0 0', fontWeight: 600 }}>Share this link with applicants to collect live resumes & submissions into database</p>
                      <span style={{ fontSize: '0.65rem', color: '#581c87', fontFamily: 'monospace', fontWeight: 700, wordBreak: 'break-all' }}>
                        {googleFormUrl}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(googleFormUrl);
                        alert('✅ Google Form link copied to clipboard!');
                      }}
                      className="rec-btn-outline" 
                      style={{ fontSize: '0.72rem', height: '32px', background: '#fff', borderColor: '#d8b4fe', color: '#7e22ce' }}
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy Form Link
                    </button>
                    <a 
                      href={googleFormUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="rec-btn-primary" 
                      style={{ fontSize: '0.72rem', height: '32px', background: '#7c3aed', textDecoration: 'none' }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Launch Form
                    </a>
                  </div>
                </div>

                {/* ── Official Google Sheet Responses Link Card ── */}
                <div style={{ background: 'linear-gradient(135deg, #ecfdf5 0%, #e0f2fe 100%)', border: '1px solid #6ee7b7', borderRadius: '0.85rem', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ padding: '0.6rem', background: '#059669', borderRadius: '0.5rem', color: '#fff', display: 'flex' }}>
                      <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#064e3b', margin: 0 }}>Official Candidate Responses Google Sheet</h3>
                        <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '2px 8px', borderRadius: '99px', background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Auto-Updating (3s)
                        </span>
                      </div>
                      <p style={{ fontSize: '0.7rem', color: '#047857', margin: '2px 0 0 0', fontWeight: 600 }}>Live connected spreadsheet containing incoming applicant responses and data</p>
                      <span style={{ fontSize: '0.65rem', color: '#065f46', fontFamily: 'monospace', fontWeight: 700, wordBreak: 'break-all' }}>
                        {googleSheetUrl}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(googleSheetUrl);
                        alert('✅ Google Sheet link copied to clipboard!');
                      }}
                      className="rec-btn-outline" 
                      style={{ fontSize: '0.72rem', height: '32px', background: '#fff', borderColor: '#a7f3d0', color: '#047857' }}
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy Sheet Link
                    </button>
                    <a 
                      href={googleSheetUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="rec-btn-primary" 
                      style={{ fontSize: '0.72rem', height: '32px', background: '#059669', textDecoration: 'none' }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open Sheet
                    </a>
                  </div>
                </div>

                {/* ── Live Candidate Submissions Table (Scrollable) ── */}
                <div style={{ width: '100%', overflowX: 'scroll', overflowY: 'hidden', borderRadius: '0.75rem', border: '1px solid #6b21a8', background: '#ffffff', boxShadow: '0 2px 5px rgba(0,0,0,0.04)', marginBottom: '1.5rem', WebkitOverflowScrolling: 'touch' }}>
                  <table style={{ width: '100%', minWidth: '1650px', borderCollapse: 'collapse', fontSize: '0.75rem', fontFamily: 'sans-serif' }}>
                    <thead>
                      <tr style={{ background: '#5b21b6', color: '#ffffff', textAlign: 'left', height: '40px' }}>
                        <th style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 700, width: '180px' }}>Timestamp</th>
                        <th style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 700, width: '240px' }}>E-mail ID</th>
                        <th style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 700, width: '180px' }}>Full Name</th>
                        <th style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 700, width: '150px' }}>Mobile Number</th>
                        <th style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 700, width: '160px' }}>Current Location / City</th>
                        <th style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 700, width: '160px' }}>Highest Qualification</th>
                        <th style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 700, width: '150px' }}>Year of Graduation</th>
                        <th style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 700, width: '280px' }}>Resume Link</th>
                        <th style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 700, width: '180px', textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const formRows = liveSheetResponses.length > 0
                          ? liveSheetResponses.map(r => ({
                              id: r.id,
                              firstName: r.fullName?.split(' ')[0] || r.fullName || 'Applicant',
                              lastName: r.fullName?.split(' ').slice(1).join(' ') || '',
                              email: r.email,
                              phone: r.mobile || 'N/A',
                              location: r.location || 'WNP',
                              experience: r.qualification || '-',
                              graduationYear: r.graduationYear || '-',
                              appliedAt: r.timestamp || '24/08/2026 10:58:33',
                              resumeUrl: r.resumeLink
                            }))
                          : candidates.filter(c => 
                              !c.email.includes('applicant_') && 
                              !c.email.includes('@example.com') && 
                              (c.source === 'Google Form' || c.email.includes('shivaram') || c.email.includes('gmail.com'))
                            );
                        const rowsToRender = formRows.length > 0 ? formRows : DEFAULT_FALLBACK_APPLICANTS;

                        return rowsToRender.map((c: any) => {
                          let driveUrl = c.resumeUrl || 'https://drive.google.com/open?id=1KHGMjppH53O9yfI9Wj0fmUpOAjjytA7z';
                          if (c.attachmentImages && c.attachmentImages.length > 0) {
                            const att = c.attachmentImages[0];
                            if (typeof att === 'string' && att.includes('http')) {
                              try {
                                const parsed = JSON.parse(att);
                                driveUrl = parsed.url || parsed.downloadUrl || att;
                              } catch (_) {
                                driveUrl = att;
                              }
                            }
                          }

                          const emailKey = (c.email || '').toLowerCase();
                          const isRowAccepted = formApplicantStatuses[c.email] === 'accepted' || 
                            formApplicantStatuses[c.id] === 'accepted' || 
                            (emailKey && formApplicantStatuses[emailKey] === 'accepted');
                          const isRowDeclined = formApplicantStatuses[c.email] === 'declined' || 
                            formApplicantStatuses[c.id] === 'declined' || 
                            (emailKey && formApplicantStatuses[emailKey] === 'declined');

                          return (
                            <tr key={c.id || c.email} style={{ background: '#ffffff', borderBottom: '1px solid #e9d5ff', height: '44px', color: '#1e293b' }}>
                              <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 600, color: '#475569' }}>{c.appliedAt || '24/08/2026 10:58:33'}</td>
                              <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 700, color: '#6b21a8' }}>{c.email}</td>
                              <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 800, color: '#0f172a' }}>{c.firstName || c.name || 'Shiva'} {c.lastName || 'Prasad'}</td>
                              <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 700, color: '#334155' }}>{c.phone || '9949020175'}</td>
                              <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 600, color: '#475569' }}>{c.location || 'WNP'}</td>
                              <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 600, color: '#475569' }}>{c.experience || c.qualification || '-'}</td>
                              <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 600, color: '#475569' }}>{c.graduationYear || '-'}</td>
                              <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                                <a 
                                  href={driveUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'underline' }}
                                >
                                  {driveUrl}
                                </a>
                              </td>
                              <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                                {isRowAccepted ? (
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '4px 10px', borderRadius: '99px', background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                      <CheckCircle className="h-3.5 w-3.5 text-emerald-600" /> Accepted
                                    </span>
                                    <button
                                      onClick={() => setActiveTab('stage-5')}
                                      className="rec-btn-outline"
                                      style={{ fontSize: '0.65rem', height: '26px', padding: '0 8px', color: '#0369a1', borderColor: '#bae6fd', background: '#f0f9ff' }}
                                      title="Go to Shortlist tab"
                                    >
                                      View in Shortlist →
                                    </button>
                                  </div>
                                ) : isRowDeclined ? (
                                  <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '4px 10px', borderRadius: '99px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <XCircle className="h-3.5 w-3.5 text-red-600" /> Declined
                                  </span>
                                ) : (
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                    <button 
                                      onClick={() => handleAcceptFormApplicant(c)}
                                      className="rec-btn-primary" 
                                      style={{ fontSize: '0.68rem', height: '28px', padding: '0 10px', background: '#16a34a', borderColor: '#15803d', gap: '4px' }}
                                    >
                                      <Check className="h-3.5 w-3.5" /> Accept
                                    </button>
                                    <button 
                                      onClick={() => handleDeclineFormApplicant(c)}
                                      className="rec-btn-outline" 
                                      style={{ fontSize: '0.68rem', height: '28px', padding: '0 10px', color: '#dc2626', borderColor: '#fca5a5', background: '#fef2f2', gap: '4px' }}
                                    >
                                      <X className="h-3.5 w-3.5" /> Decline
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                  {visibleJobs.length === 0 ? (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', background: '#f8fafc', borderRadius: '1rem', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '0.75rem' }}>
                      No active jobs posted yet. Click "Post New Job" to create your first listing.
                    </div>
                  ) : (
                    visibleJobs.map(job => (
                      <div key={job.id} style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '1rem', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: '#e0f2fe', color: '#0369a1', textTransform: 'uppercase' }}>{job.department}</span>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', marginTop: '0.35rem' }}>{job.title}</h3>
                          </div>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '3px 8px', borderRadius: '99px', background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }}>{job.status}</span>
                        </div>

                        <p style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <MapPin className="h-3.5 w-3.5 text-slate-400" /> {job.location} · {job.type}
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.7rem' }}>
                          <div><span style={{ color: '#94a3b8' }}>Applicants:</span> <span style={{ fontWeight: 800, color: '#4f46e5' }}>{job.applicants}</span></div>
                          <div><span style={{ color: '#94a3b8' }}>Posted:</span> <span style={{ fontWeight: 700, color: '#475569' }}>{job.postedDate}</span></div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
                          <button onClick={() => setSelectedSimulatedChannel(job.id)} className="rec-btn-outline" style={{ flex: 1, fontSize: '0.7rem', height: '32px', padding: '0', justifyContent: 'center' }}>
                            <Share2 className="h-3.5 w-3.5" /> Channels
                          </button>
                          <button onClick={() => { setSelectedJobId(job.id); setActiveTab('stage-3'); }} className="rec-btn-primary" style={{ flex: 1, fontSize: '0.7rem', height: '32px', padding: '0', justifyContent: 'center' }}>
                            View Applications
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}





            {/* ════════════════ STAGE 3: APPLICATIONS & GOOGLE FORM RESPONSES ════════════════ */}
            {activeTab === 'stage-3' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* ── Live Google Sheet Submissions Table Card ── */}
                <div className="rec-card" style={{ padding: '1.5rem', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ padding: '0.5rem', background: 'linear-gradient(135deg, #059669, #10b981)', borderRadius: '0.75rem', display: 'flex' }}>
                        <FileSpreadsheet className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h2 className="rec-section-title" style={{ fontSize: '1.1rem' }}>Live Google Form Submissions Table</h2>
                        <p className="rec-section-sub">Adjusted column widths & row heights with full unclipped text across all 8 fields</p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(googleSheetUrl);
                          alert('✅ Google Sheet link copied to clipboard!');
                        }}
                        className="rec-btn-outline"
                        style={{ fontSize: '0.75rem', height: '34px', gap: '5px' }}
                      >
                        <Copy className="h-3.5 w-3.5 text-emerald-600" /> Copy Sheet Link
                      </button>

                      <a
                        href={googleSheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rec-btn-primary"
                        style={{ fontSize: '0.75rem', height: '34px', gap: '5px', textDecoration: 'none', background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Open Google Sheet
                      </a>
                    </div>
                  </div>

                  {/* ── Native Adjusted Table View (Full Column Widths, No Truncation) ── */}
                  <div style={{ width: '100%', overflowX: 'auto', borderRadius: '0.75rem', border: '1px solid #6b21a8', marginBottom: '1.25rem' }}>
                    <table style={{ width: '100%', minWidth: '1500px', borderCollapse: 'collapse', fontSize: '0.75rem', fontFamily: 'sans-serif' }}>
                      <thead>
                        <tr style={{ background: '#5b21b6', color: '#ffffff', textAlign: 'left', height: '38px' }}>
                          <th style={{ padding: '8px 14px', whiteSpace: 'nowrap', fontWeight: 700, minWidth: '160px' }}>Timestamp</th>
                          <th style={{ padding: '8px 14px', whiteSpace: 'nowrap', fontWeight: 700, minWidth: '220px' }}>E-mail ID</th>
                          <th style={{ padding: '8px 14px', whiteSpace: 'nowrap', fontWeight: 700, minWidth: '160px' }}>Full Name</th>
                          <th style={{ padding: '8px 14px', whiteSpace: 'nowrap', fontWeight: 700, minWidth: '140px' }}>Mobile Number</th>
                          <th style={{ padding: '8px 14px', whiteSpace: 'nowrap', fontWeight: 700, minWidth: '160px' }}>Current Location / City</th>
                          <th style={{ padding: '8px 14px', whiteSpace: 'nowrap', fontWeight: 700, minWidth: '160px' }}>Highest Qualification</th>
                          <th style={{ padding: '8px 14px', whiteSpace: 'nowrap', fontWeight: 700, minWidth: '150px' }}>Year of Graduation</th>
                          <th style={{ padding: '8px 14px', whiteSpace: 'nowrap', fontWeight: 700, minWidth: '250px' }}>Resume Link</th>
                          <th style={{ padding: '8px 14px', whiteSpace: 'nowrap', fontWeight: 700, minWidth: '190px', textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const formRows = liveSheetResponses.length > 0
                            ? liveSheetResponses.map(r => ({
                                id: r.id,
                                firstName: r.fullName?.split(' ')[0] || r.fullName || 'Applicant',
                                lastName: r.fullName?.split(' ').slice(1).join(' ') || '',
                                email: r.email,
                                phone: r.mobile || 'N/A',
                                location: r.location || 'WNP',
                                experience: r.qualification || 'Degree',
                                appliedAt: r.timestamp || '24/08/2026 10:58:33',
                                resumeUrl: r.resumeLink,
                                attachmentImages: [r.resumeLink]
                              }))
                            : candidates.filter(c => 
                                !c.email.includes('applicant_') && 
                                !c.email.includes('@example.com') && 
                                (c.source === 'Google Form' || c.email.includes('shivaram') || c.email.includes('gmail.com'))
                              );
                          const rowsToRender = formRows.length > 0 ? formRows : [
                            {
                              id: 'cand-shiva-1',
                              firstName: 'Shiva',
                              lastName: 'Prasad',
                              email: 'shivaram33987@gmail.com',
                              phone: '9949020175',
                              location: 'WNP',
                              experience: 'Degree',
                              appliedAt: '24/08/2026 10:58:33',
                              resumeUrl: 'https://drive.google.com/open?id=1KHGMjppH53O9yfI9Wj0fmUpOAjjytA7z',
                              attachmentImages: ['https://drive.google.com/open?id=1KHGMjppH53O9yfI9Wj0fmUpOAjjytA7z']
                            },
                            {
                              id: 'cand-shiva-2',
                              firstName: 'k shiva',
                              lastName: 'prasad',
                              email: 'Kshivaprasad33987@gmail.com',
                              phone: '9874563110',
                              location: 'HYD',
                              experience: '2000',
                              appliedAt: '24/08/2026 11:20:19',
                              resumeUrl: 'https://drive.google.com/open?id=1D4woFQ3G9YX5TVcYc_dH9L5wF7UlS_0P',
                              attachmentImages: ['https://drive.google.com/open?id=1D4woFQ3G9YX5TVcYc_dH9L5wF7UlS_0P']
                            },
                            {
                              id: 'cand-shiva-3',
                              firstName: 'kanapuram Shiva',
                              lastName: 'prasad',
                              email: 'shivaram33987@gmail.com',
                              phone: '99949020175',
                              location: 'HYD',
                              experience: 'B.Tech',
                              appliedAt: '24/08/2026 12:58:39',
                              resumeUrl: 'https://drive.google.com/open?id=1rnDWuhRDVf4WvyNmNyknoMCVaeyNnGtr',
                              attachmentImages: ['https://drive.google.com/open?id=1rnDWuhRDVf4WvyNmNyknoMCVaeyNnGtr']
                            }
                          ];

                          return rowsToRender.map((c: any) => {
                            let driveUrl = c.resumeUrl || 'https://drive.google.com/open?id=1KHGMjppH53O9yfI9Wj0fmUpOAjjytA7z';
                            if (c.attachmentImages && c.attachmentImages.length > 0) {
                              const att = c.attachmentImages[0];
                              if (typeof att === 'string' && att.includes('http')) {
                                try {
                                  const parsed = JSON.parse(att);
                                  driveUrl = parsed.url || parsed.downloadUrl || att;
                                } catch (_) {
                                  driveUrl = att;
                                }
                              }
                            }

                            return (
                              <tr key={c.id || c.email} style={{ background: '#ffffff', borderBottom: '1px solid #e9d5ff', height: '44px', color: '#1e293b' }}>
                                <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 600, color: '#475569' }}>{c.appliedAt || '24/08/2026 10:58:33'}</td>
                                <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 700, color: '#6b21a8' }}>{c.email}</td>
                                <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 800, color: '#0f172a' }}>{c.firstName || c.name || 'Shiva'} {c.lastName || 'Prasad'}</td>
                                <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 700, color: '#334155' }}>{c.phone || '9949020175'}</td>
                                <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 600, color: '#475569' }}>{c.location || 'WNP'}</td>
                                <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 600, color: '#475569' }}>{c.qualification || '-'}</td>
                                <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 600, color: '#475569' }}>{c.graduationYear || '-'}</td>
                                <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                                  <a 
                                    href={driveUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'underline' }}
                                  >
                                    {driveUrl}
                                  </a>
                                </td>
                                <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                                  {formApplicantStatuses[c.email] === 'accepted' ? (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                      <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '4px 10px', borderRadius: '99px', background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" /> Accepted
                                      </span>
                                      <button
                                        onClick={() => setActiveTab('stage-5')}
                                        className="rec-btn-outline"
                                        style={{ fontSize: '0.65rem', height: '26px', padding: '0 8px', color: '#0369a1', borderColor: '#bae6fd', background: '#f0f9ff' }}
                                        title="Go to Shortlist tab"
                                      >
                                        View in Shortlist →
                                      </button>
                                    </div>
                                  ) : formApplicantStatuses[c.email] === 'declined' ? (
                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '4px 10px', borderRadius: '99px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                      <XCircle className="h-3.5 w-3.5 text-red-600" /> Declined
                                    </span>
                                  ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                      <button 
                                        onClick={() => handleAcceptFormApplicant(c)}
                                        className="rec-btn-primary" 
                                        style={{ fontSize: '0.68rem', height: '28px', padding: '0 10px', background: '#16a34a', borderColor: '#15803d', gap: '4px' }}
                                      >
                                        <Check className="h-3.5 w-3.5" /> Accept
                                      </button>
                                      <button 
                                        onClick={() => handleDeclineFormApplicant(c)}
                                        className="rec-btn-outline" 
                                        style={{ fontSize: '0.68rem', height: '28px', padding: '0 10px', color: '#dc2626', borderColor: '#fca5a5', background: '#fef2f2', gap: '4px' }}
                                      >
                                        <X className="h-3.5 w-3.5" /> Decline
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Candidate list for Stage 3 */}
                <div className="rec-card" style={{ padding: '1.5rem', overflow: 'hidden', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                      <div>
                        <h2 className="rec-section-title" style={{ margin: 0 }}>Stage 3: Collected Applications</h2>
                        <p className="rec-section-sub" style={{ marginTop: '2px' }}>Candidate profiles that have entered this stage</p>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button 
                          onClick={handleSyncResponses}
                          className="rec-btn-outline"
                          style={{ fontSize: '0.75rem', height: '32px', gap: '5px' }}
                          title="Re-fetch live responses and sync Google Form uploads from database"
                        >
                          <RefreshCw className={cn('h-3.5 w-3.5 text-purple-600', loading && 'animate-spin')} />
                          Sync Responses
                        </button>

                        <button 
                          onClick={() => setShowAddModal(true)} 
                          className="rec-btn-primary" 
                          style={{ fontSize: '0.75rem', height: '32px', background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)' }}
                        >
                          <Plus className="h-3.5 w-3.5" /> Submit Application
                        </button>

                        {/* Source Sub-Filters */}
                        <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                          <button 
                            onClick={() => setAppSourceFilter('all')} 
                            style={{ fontSize: '0.65rem', fontWeight: 600, padding: '4px 10px', borderRadius: '6px', border: 0, background: appSourceFilter === 'all' ? '#fff' : 'transparent', color: appSourceFilter === 'all' ? '#0f172a' : '#64748b', boxShadow: appSourceFilter === 'all' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer' }}
                          >
                            All ({boardCandidates.filter(c => c.stage === 'Applications').length})
                          </button>
                          <button 
                            onClick={() => setAppSourceFilter('google-form')} 
                            style={{ fontSize: '0.65rem', fontWeight: 600, padding: '4px 10px', borderRadius: '6px', border: 0, background: appSourceFilter === 'google-form' ? '#fff' : 'transparent', color: appSourceFilter === 'google-form' ? '#7e22ce' : '#64748b', boxShadow: appSourceFilter === 'google-form' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer' }}
                          >
                            Google Form ({boardCandidates.filter(c => c.stage === 'Applications' && c.source === 'Google Form').length})
                          </button>
                          <button 
                            onClick={() => setAppSourceFilter('manual')} 
                            style={{ fontSize: '0.65rem', fontWeight: 600, padding: '4px 10px', borderRadius: '6px', border: 0, background: appSourceFilter === 'manual' ? '#fff' : 'transparent', color: appSourceFilter === 'manual' ? '#0f172a' : '#64748b', boxShadow: appSourceFilter === 'manual' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer' }}
                          >
                            Other Sources ({boardCandidates.filter(c => c.stage === 'Applications' && c.source !== 'Google Form').length})
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ overflowX: 'auto' }}>
                      <table className="rec-table">
                        <thead>
                          <tr>
                            <th>Candidate</th>
                            <th>Role</th>
                            <th>Source</th>
                            <th>Media & Attachments</th>
                            <th>Skills</th>
                            <th style={{ textAlign: 'right' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {boardCandidates.filter(c => {
                            if (c.stage !== 'Applications') return false;
                            if (appSourceFilter === 'google-form') return c.source === 'Google Form';
                            if (appSourceFilter === 'manual') return c.source !== 'Google Form';
                            return true;
                          }).length === 0 ? (
                            <tr>
                              <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.75rem' }}>
                                No applications currently match the selected source filter.
                              </td>
                            </tr>
                          ) : (
                            boardCandidates.filter(c => {
                              if (c.stage !== 'Applications') return false;
                              if (appSourceFilter === 'google-form') return c.source === 'Google Form';
                              if (appSourceFilter === 'manual') return c.source !== 'Google Form';
                              return true;
                            }).map(c => (
                              <tr key={c.id} className="rec-table-row">
                                <td>
                                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>{c.firstName} {c.lastName}</p>
                                  <p style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{c.email}</p>
                                </td>
                                <td style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>{c.jobTitle}</td>
                                <td>
                                  {c.source === 'Google Form' ? (
                                    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: '#f3e8ff', color: '#7e22ce', border: '1px solid #d8b4fe', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                      <FileText className="h-3 w-3 text-purple-600" />
                                      Google Form
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6366f1' }}>{c.source}</span>
                                  )}
                                </td>
                                <td>
                                  {(() => {
                                    const rawAtts = [...(c.attachmentImages || [])];
                                    if (c.resumeUrl && !rawAtts.includes(c.resumeUrl) && c.resumeUrl !== 'uploaded-resume.pdf' && c.resumeUrl !== 'google-form-upload.pdf') {
                                      rawAtts.unshift(c.resumeUrl);
                                    }

                                    if (rawAtts.length === 0) {
                                      return <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontStyle: 'italic' }}>No media</span>;
                                    }

                                    const parsedAtts = rawAtts.map((att, idx) => parseAttachmentItem(att, idx));
                                    const visibleAtts = parsedAtts.slice(0, 2);
                                    const hiddenCount = parsedAtts.length - visibleAtts.length;

                                    return (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {visibleAtts.map((att, idx) => {
                                          if (att.error) {
                                            return (
                                              <div key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', color: '#ef4444', fontWeight: 600 }}>
                                                <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
                                                <span>⚠️ File unavailable</span>
                                              </div>
                                            );
                                          }

                                          return (
                                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.65rem', background: '#f8fafc', padding: '3px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                              {att.type === 'image' ? (
                                                <img 
                                                  src={att.url} 
                                                  alt={att.name} 
                                                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                                  style={{ width: '18px', height: '18px', borderRadius: '3px', objectFit: 'cover', border: '1px solid #cbd5e1' }}
                                                />
                                              ) : att.type === 'pdf' ? (
                                                <FileText className="h-3.5 w-3.5 text-rose-500 flex-shrink-0" />
                                              ) : att.type === 'doc' ? (
                                                <FileText className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                                              ) : att.type === 'video' ? (
                                                <Video className="h-3.5 w-3.5 text-purple-500 flex-shrink-0" />
                                              ) : att.type === 'spreadsheet' ? (
                                                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                                              ) : att.type === 'archive' ? (
                                                <Package className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                                              ) : (
                                                <Paperclip className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                                              )}

                                              <span style={{ fontWeight: 600, color: '#334155', maxWidth: '105px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={att.name}>
                                                {att.name}
                                              </span>

                                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                                                <button
                                                  onClick={() => {
                                                    if (att.type === 'image') {
                                                      setPreviewMediaAttachment(att);
                                                    } else {
                                                      window.open(att.url, '_blank');
                                                    }
                                                  }}
                                                  style={{ background: 'transparent', border: 0, padding: 0, color: '#4f46e5', fontWeight: 700, cursor: 'pointer', fontSize: '0.62rem' }}
                                                  title="View file"
                                                >
                                                  View
                                                </button>

                                                <span style={{ color: '#cbd5e1' }}>|</span>

                                                <a 
                                                  href={att.downloadUrl || att.url} 
                                                  target="_blank" 
                                                  rel="noopener noreferrer" 
                                                  download 
                                                  style={{ color: '#0284c7', fontWeight: 700, textDecoration: 'none', fontSize: '0.62rem' }}
                                                  title="Download or Open file"
                                                >
                                                  Download
                                                </a>
                                              </div>
                                            </div>
                                          );
                                        })}

                                        {hiddenCount > 0 && (
                                          <button
                                            onClick={() => setSelectedCandidate(c)}
                                            style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#f3e8ff', color: '#7e22ce', border: '1px solid #d8b4fe', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', width: 'fit-content' }}
                                          >
                                            <Paperclip className="h-3 w-3" /> +{hiddenCount} more
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                                    {c.skills.slice(0, 3).map(sk => (
                                      <span key={sk} style={{ fontSize: '0.6rem', padding: '2px 6px', background: '#f1f5f9', borderRadius: '4px', color: '#475569', fontWeight: 600 }}>{sk}</span>
                                    ))}
                                  </div>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <button onClick={() => setActiveTab('stage-4')} className="rec-btn-outline" style={{ fontSize: '0.65rem', padding: '0.25rem 0.5rem', height: '26px' }}>
                                    Go to AI Screen
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
              </div>
            )}

            {/* ════════════════ STAGE 4: AI SCREENING ════════════════ */}
            {activeTab === 'stage-4' && (
              <div className="rec-card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                  <div style={{ padding: '0.5rem', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', borderRadius: '0.75rem', display: 'flex' }}>
                    <Brain className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h2 className="rec-section-title" style={{ fontSize: '1.1rem' }}>Stage 4: AI Semantic Profile Indexing</h2>
                    <p className="rec-section-sub">Scans incoming candidates using mock LLM parser to evaluate match suitability</p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
                  {/* Candidates List */}
                  <div>
                    <h3 className="rec-panel-title" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>Candidates Awaiting AI Screening</h3>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="rec-table">
                        <thead>
                          <tr>
                            <th>Candidate</th>
                            <th>Role Applied</th>
                            <th>Key Skills</th>
                            <th>Candidate ID</th>
                            <th style={{ textAlign: 'right' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {candidates.filter(c => c.stage === 'Applications' || c.stage === 'AI Screening').length === 0 ? (
                            <tr>
                              <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.75rem' }}>
                                No candidates in queue for AI evaluation. Add new applicants in Stage 3.
                              </td>
                            </tr>
                          ) : (
                            candidates.filter(c => c.stage === 'Applications' || c.stage === 'AI Screening').map(c => (
                              <tr key={c.id} className="rec-table-row">
                                <td>
                                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>{c.firstName} {c.lastName}</p>
                                  <p style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Exp: {c.experience}</p>
                                </td>
                                <td style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>{c.jobTitle}</td>
                                <td>
                                  <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                                    {c.skills.map(sk => (
                                      <span key={sk} style={{ fontSize: '0.6rem', padding: '2px 5px', background: '#f5f3ff', color: '#6366f1', borderRadius: '4px', fontWeight: 600 }}>{sk}</span>
                                    ))}
                                  </div>
                                </td>
                                <td>
                                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#059669', fontFamily: 'monospace', padding: '2px 8px', background: '#ecfdf5', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                                    #{getCandidateCode(c)}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <button 
                                    disabled={screeningCandId === c.id} 
                                    onClick={() => handleRunAIScreen(c.id)} 
                                    className="rec-btn-primary" 
                                    style={{ fontSize: '0.65rem', height: '28px', padding: '0 0.5rem', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
                                  >
                                    {screeningCandId === c.id ? (
                                      <>
                                        <Loader2 className="h-3 w-3 animate-spin mr-1" /> Scanning...
                                      </>
                                    ) : (
                                      <>
                                        <Brain className="h-3 w-3 mr-1" /> Run AI Match
                                      </>
                                    )}
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* AI Output Terminal Panel */}
                  <div className="flex flex-col gap-4">
                    <div className="rec-card" style={{ padding: '1.25rem', background: '#1e1b4b', border: '1px solid #312e81' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid #312e81', paddingBottom: '0.5rem' }}>
                        <span style={{ color: '#a5b4fc', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Sparkles className="h-3.5 w-3.5 text-purple-400" /> Cognitive Evaluator Output
                        </span>
                        {screeningCandId && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ec4899', animation: 'pulse 1s infinite' }} />}
                      </div>
                      <div style={{ height: '200px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.7rem', color: '#e0e7ff', lineHeight: '1.7', padding: '0.5rem' }}>
                        {screeningLogs.length === 0 ? (
                          <p style={{ color: '#4f46e5' }}>Launch "Run AI Match" on any candidate to inspect active parser steps...</p>
                        ) : (
                          screeningLogs.map((log, i) => {
                            let clr = '#e0e7ff';
                            if (log.includes('[AI SUCCESS]')) clr = '#34d399';
                            else if (log.includes('[AI SEMANTIC')) clr = '#c084fc';
                            return <p key={i} style={{ color: clr }}>{log}</p>;
                          })
                        )}
                      </div>
                    </div>

                    {candidates.some(c => c.stage === 'AI Screening') && (
                      <div className="rec-card" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155' }}>Screening Complete?</p>
                          <p style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Proceed to Stage 5: Shortlisting</p>
                        </div>
                        <button onClick={() => setActiveTab('stage-5')} className="rec-btn-outline" style={{ fontSize: '0.7rem' }}>
                          Review Matches <ChevronRight className="h-3.5 w-3.5 ml-1" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ════════════════ STAGE 5: SHORTLISTING ════════════════ */}
            {activeTab === 'stage-5' && (() => {
              const map = new Map<string, Candidate>();
              // 1. candidates from state (stage is Shortlisting, AI Screening, or accepted in statuses)
              candidates.forEach(c => {
                const emailKey = (c.email || '').toLowerCase();
                const isAccepted = formApplicantStatuses[c.email] === 'accepted' || 
                  formApplicantStatuses[c.id] === 'accepted' || 
                  (emailKey && formApplicantStatuses[emailKey] === 'accepted');
                if (c.stage === 'Shortlisting' || c.stage === 'AI Screening' || isAccepted) {
                  const key = emailKey || c.id;
                  map.set(key, {
                    ...c,
                    stage: c.stage === 'AI Screening' ? 'AI Screening' : 'Shortlisting'
                  });
                }
              });

              // 2. stored shortlisted candidates from localStorage
              const storedShortlisted = getStoredShortlistedCandidates();
              storedShortlisted.forEach(sc => {
                const key = (sc.email || sc.id).toLowerCase();
                if (!map.has(key)) {
                  map.set(key, { ...sc, stage: 'Shortlisting' });
                }
              });

              // 3. live sheet responses that are accepted
              liveSheetResponses.forEach(r => {
                if (r.email) {
                  const emailKey = r.email.toLowerCase();
                  const isAccepted = formApplicantStatuses[r.email] === 'accepted' || 
                    formApplicantStatuses[r.id] === 'accepted' || 
                    formApplicantStatuses[emailKey] === 'accepted';
                  if (isAccepted && !map.has(emailKey)) {
                    const nameParts = (r.fullName || 'Applicant').split(' ');
                    map.set(emailKey, {
                      id: r.id || `cand-live-${r.email}`,
                      firstName: nameParts[0] || 'Applicant',
                      lastName: nameParts.slice(1).join(' ') || '',
                      email: r.email,
                      phone: r.mobile || 'N/A',
                      location: r.location || 'WNP',
                      experience: r.qualification || 'Degree',
                      graduationYear: r.graduationYear || '-',
                      appliedDate: r.timestamp || '24/08/2026 10:58:33',
                      resumeUrl: r.resumeLink,
                      attachmentImages: r.resumeLink ? [r.resumeLink] : [],
                      source: 'Google Form',
                      jobTitle: 'Google Form Recruitment',
                      stage: 'Shortlisting',
                      matchScore: 85,
                      skills: ['Google Form', r.qualification || 'Degree'],
                      avatarColor: 'bg-emerald-100 text-emerald-600 border-emerald-200'
                    });
                  }
                }
              });

              // 4. default fallback rows that are accepted
              DEFAULT_FALLBACK_APPLICANTS.forEach(fb => {
                const emailKey = fb.email.toLowerCase();
                const isAccepted = formApplicantStatuses[fb.email] === 'accepted' || 
                  formApplicantStatuses[fb.id] === 'accepted' || 
                  formApplicantStatuses[emailKey] === 'accepted';
                if (isAccepted && !map.has(emailKey)) {
                  map.set(emailKey, {
                    id: fb.id,
                    firstName: fb.firstName,
                    lastName: fb.lastName,
                    email: fb.email,
                    phone: fb.phone,
                    location: fb.location,
                    experience: fb.experience,
                    graduationYear: fb.graduationYear,
                    appliedDate: fb.appliedDate,
                    resumeUrl: fb.resumeUrl,
                    attachmentImages: fb.resumeUrl ? [fb.resumeUrl] : [],
                    source: fb.source,
                    jobTitle: fb.jobTitle,
                    stage: 'Shortlisting',
                    matchScore: 85,
                    skills: ['Google Form', fb.experience || 'Degree'],
                    avatarColor: 'bg-emerald-100 text-emerald-600 border-emerald-200'
                  });
                }
              });

              const shortlistCandidates = Array.from(map.values()).filter(c => {
                const emailKey = (c.email || '').toLowerCase();
                const isDeclined = formApplicantStatuses[c.email] === 'declined' || 
                  formApplicantStatuses[c.id] === 'declined' || 
                  (emailKey && formApplicantStatuses[emailKey] === 'declined');
                return !isDeclined && c.stage !== 'Rejected';
              });

              return (
                <div className="rec-card" style={{ padding: '1.5rem' }}>
                  <h2 className="rec-section-title" style={{ marginBottom: '0.5rem' }}>Stage 5: Review & Shortlist Candidates</h2>
                  <p className="rec-section-sub" style={{ marginBottom: '1.5rem' }}>Compare suitability scores and approve profiles for interview coordination</p>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                    {shortlistCandidates.length === 0 ? (
                      <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', background: '#f8fafc', borderRadius: '1rem', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '0.75rem' }}>
                        No candidates currently in shortlisting evaluation pool. Evaluate applicants using AI Match first in Stage 4.
                      </div>
                    ) : (
                      shortlistCandidates.map(c => (
                        <div key={c.id} style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '1rem', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>{c.firstName} {c.lastName}</h3>
                              <p style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, marginTop: '0.125rem' }}>{c.jobTitle}</p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                              <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#059669', fontFamily: 'monospace', background: '#ecfdf5', padding: '2px 8px', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                                #{getCandidateCode(c)}
                              </span>
                              <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginTop: '2px' }}>Candidate ID</span>
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.7rem' }}>
                            <div><span style={{ color: '#94a3b8' }}>Exp/Qual:</span> <span style={{ fontWeight: 700, color: '#475569' }}>{c.experience}</span></div>
                            <div><span style={{ color: '#94a3b8' }}>Source:</span> <span style={{ fontWeight: 700, color: '#475569' }}>{c.source}</span></div>
                            {c.phone && <div><span style={{ color: '#94a3b8' }}>Phone:</span> <span style={{ fontWeight: 700, color: '#475569' }}>{c.phone}</span></div>}
                            {c.location && <div><span style={{ color: '#94a3b8' }}>Location:</span> <span style={{ fontWeight: 700, color: '#475569' }}>{c.location}</span></div>}
                          </div>

                          {c.resumeUrl && (
                            <div style={{ fontSize: '0.68rem' }}>
                              <a 
                                href={c.resumeUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                <ExternalLink className="h-3 w-3" /> View Resume Link
                              </a>
                            </div>
                          )}

                          <div>
                            <p style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, marginBottom: '4px' }}>Skills Fit</p>
                            <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                              {c.skills.map(sk => (
                                <span key={sk} style={{ fontSize: '0.6rem', padding: '2px 6px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '4px', fontWeight: 700 }}>{sk}</span>
                              ))}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
                            <button 
                              onClick={() => handleDeclineFormApplicant(c)} 
                              className="rec-btn-outline" 
                              style={{ flex: 1, fontSize: '0.7rem', color: '#ef4444', borderColor: '#fee2e2', background: '#fef2f2', height: '32px', padding: '0' }}
                            >
                              Reject
                            </button>
                            {c.stage !== 'Shortlisting' ? (
                              <button 
                                onClick={() => updateCandidateStage(c.id, 'Shortlisting')} 
                                className="rec-btn-primary" 
                                style={{ flex: 1, fontSize: '0.7rem', height: '32px', padding: '0', justifyContent: 'center' }}
                              >
                                Approve Shortlist
                              </button>
                            ) : (
                              <button 
                                onClick={() => {
                                  setSelectedCandidate(c);
                                  setActiveTab('stage-6');
                                }} 
                                className="rec-btn-primary" 
                                style={{ flex: 1, fontSize: '0.7rem', height: '32px', padding: '0', justifyContent: 'center', background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                              >
                                Schedule Interview
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ════════════════ STAGE 6: INTERVIEWS (ULTRA-PREMIUM UI) ════════════════ */}
            {activeTab === 'stage-6' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
                {/* ── Top Executive Summary Metric Cards ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                  {/* Card 1: Total Scheduled Slots */}
                  <div style={{ background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #e2e8f0', borderRadius: '1.25rem', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 15px rgba(15, 23, 42, 0.03)' }}>
                    <div style={{ padding: '0.75rem', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', borderRadius: '0.85rem', color: '#fff', boxShadow: '0 6px 14px rgba(99, 102, 241, 0.35)', display: 'flex' }}>
                      <Calendar className="h-6 w-6" />
                    </div>
                    <div>
                      <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Scheduled Slots</p>
                      <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', margin: '2px 0 0 0', letterSpacing: '-0.02em' }}>
                        {candidates.filter(c => c.stage === 'Interviews').length}
                      </h3>
                    </div>
                  </div>

                  {/* Card 2: Today's Sessions */}
                  <div style={{ background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)', border: '1px solid #bbf7d0', borderRadius: '1.25rem', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.04)' }}>
                    <div style={{ padding: '0.75rem', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderRadius: '0.85rem', color: '#fff', boxShadow: '0 6px 14px rgba(16, 185, 129, 0.35)', display: 'flex' }}>
                      <Clock className="h-6 w-6" />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Today's Sessions</p>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 8px #10b981' }}></span>
                      </div>
                      <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#064e3b', margin: '2px 0 0 0', letterSpacing: '-0.02em' }}>
                        {candidates.filter(c => c.stage === 'Interviews' && c.interviewDate && c.interviewDate.startsWith(format(new Date(), 'yyyy-MM-dd'))).length}
                      </h3>
                    </div>
                  </div>

                  {/* Card 3: Tech & Coding Rounds */}
                  <div style={{ background: 'linear-gradient(135deg, #ffffff 0%, #faf5ff 100%)', border: '1px solid #e9d5ff', borderRadius: '1.25rem', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 15px rgba(168, 85, 247, 0.04)' }}>
                    <div style={{ padding: '0.75rem', background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', borderRadius: '0.85rem', color: '#fff', boxShadow: '0 6px 14px rgba(168, 85, 247, 0.35)', display: 'flex' }}>
                      <Cpu className="h-6 w-6" />
                    </div>
                    <div>
                      <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7e22ce', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Tech Rounds</p>
                      <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#581c87', margin: '2px 0 0 0', letterSpacing: '-0.02em' }}>
                        {candidates.filter(c => c.stage === 'Interviews' && (c.interviewType?.includes('Technical') || c.interviewType?.includes('Coding'))).length}
                      </h3>
                    </div>
                  </div>

                  {/* Card 4: Offers Extended */}
                  <div style={{ background: 'linear-gradient(135deg, #ffffff 0%, #fff7ed 100%)', border: '1px solid #fed7aa', borderRadius: '1.25rem', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 15px rgba(249, 115, 22, 0.04)' }}>
                    <div style={{ padding: '0.75rem', background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', borderRadius: '0.85rem', color: '#fff', boxShadow: '0 6px 14px rgba(249, 115, 22, 0.35)', display: 'flex' }}>
                      <Award className="h-6 w-6" />
                    </div>
                    <div>
                      <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Offers Passed</p>
                      <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#7c2d12', margin: '2px 0 0 0', letterSpacing: '-0.02em' }}>
                        {candidates.filter(c => c.stage === 'Offer' || c.stage === 'Onboarding' || c.stage === 'Documents').length}
                      </h3>
                    </div>
                  </div>
                </div>

                {/* ── Top Header & Calendar Controls ── */}
                <div className="rec-card" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #e2e8f0', borderRadius: '1.25rem', boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ padding: '0.75rem', background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', borderRadius: '1rem', color: '#fff', boxShadow: '0 6px 16px rgba(79, 70, 229, 0.35)', display: 'flex' }}>
                        <Calendar className="h-7 w-7" />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <h2 className="rec-section-title" style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: '#0f172a', letterSpacing: '-0.02em' }}>Interactive Interview Calendar</h2>
                          <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '99px', background: '#e0e7ff', color: '#4338ca', border: '1px solid #c7d2fe' }}>
                            Stage 6
                          </span>
                        </div>
                        <p className="rec-section-sub" style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>Select any calendar date or "+ Slot" button to setup video meetings and assign interview panels</p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      {/* Month Switcher Controls */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '0.75rem', padding: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                        <button
                          onClick={() => setCurrentCalMonth(new Date(currentCalMonth.getFullYear(), currentCalMonth.getMonth() - 1, 1))}
                          className="rec-btn-outline"
                          style={{ height: '32px', width: '32px', padding: 0, border: 0, borderRadius: '0.5rem', justifyContent: 'center' }}
                          title="Previous Month"
                        >
                          <ChevronLeft className="h-4 w-4 text-slate-700" />
                        </button>
                        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', padding: '0 12px', minWidth: '140px', textAlign: 'center', letterSpacing: '-0.01em' }}>
                          {format(currentCalMonth, 'MMMM yyyy')}
                        </span>
                        <button
                          onClick={() => setCurrentCalMonth(new Date(currentCalMonth.getFullYear(), currentCalMonth.getMonth() + 1, 1))}
                          className="rec-btn-outline"
                          style={{ height: '32px', width: '32px', padding: 0, border: 0, borderRadius: '0.5rem', justifyContent: 'center' }}
                          title="Next Month"
                        >
                          <ChevronRight className="h-4 w-4 text-slate-700" />
                        </button>
                      </div>

                      <button
                        onClick={() => setCurrentCalMonth(new Date())}
                        className="rec-btn-outline"
                        style={{ fontSize: '0.8rem', height: '38px', padding: '0 14px', borderRadius: '0.75rem', background: '#ffffff', borderColor: '#cbd5e1', color: '#334155', fontWeight: 700 }}
                      >
                        Today
                      </button>

                      <button
                        onClick={() => {
                          if (!selectedCandidate) {
                            const firstCand = candidates.find(c => c.stage === 'Shortlisting' || c.stage === 'Interviews') || candidates[0];
                            if (firstCand) setSelectedCandidate(firstCand);
                          }
                          setShowScheduleModal(true);
                        }}
                        className="rec-btn-primary"
                        style={{
                          fontSize: '0.82rem',
                          height: '38px',
                          padding: '0 16px',
                          borderRadius: '0.75rem',
                          gap: '6px',
                          background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #7c3aed 100%)',
                          boxShadow: '0 4px 14px rgba(79, 70, 229, 0.4)',
                          fontWeight: 700
                        }}
                      >
                        <Plus className="h-4 w-4" /> Schedule Interview Slot
                      </button>
                    </div>
                  </div>

                  {/* ── Interactive Calendar Month Grid ── */}
                  <div style={{ background: '#ffffff', borderRadius: '1rem', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 15px rgba(15, 23, 42, 0.03)' }}>
                    {/* Day Headers (Sun-Sat) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 800, fontSize: '0.75rem', color: '#475569', padding: '12px 0', letterSpacing: '0.05em' }}>
                      <div>SUN</div>
                      <div>MON</div>
                      <div>TUE</div>
                      <div>WED</div>
                      <div>THU</div>
                      <div>FRI</div>
                      <div>SAT</div>
                    </div>

                    {/* Calendar Days Matrix */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: 'minmax(115px, auto)', gap: '1px', background: '#e2e8f0' }}>
                      {(() => {
                        const year = currentCalMonth.getFullYear();
                        const month = currentCalMonth.getMonth();
                        const firstDayIdx = new Date(year, month, 1).getDay();
                        const daysInMonth = new Date(year, month + 1, 0).getDate();
                        const prevDaysInMonth = new Date(year, month, 0).getDate();
                        
                        const cells: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = [];

                        // Prev Month Days
                        for (let i = firstDayIdx - 1; i >= 0; i--) {
                          const d = prevDaysInMonth - i;
                          const pM = month === 0 ? 11 : month - 1;
                          const pY = month === 0 ? year - 1 : year;
                          const dateStr = `${pY}-${String(pM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                          cells.push({ dateStr, dayNum: d, isCurrentMonth: false });
                        }

                        // Current Month Days
                        for (let i = 1; i <= daysInMonth; i++) {
                          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                          cells.push({ dateStr, dayNum: i, isCurrentMonth: true });
                        }

                        // Next Month Days
                        const remaining = (cells.length <= 35 ? 35 : 42) - cells.length;
                        for (let i = 1; i <= remaining; i++) {
                          const nM = month === 11 ? 0 : month + 1;
                          const nY = month === 11 ? year + 1 : year;
                          const dateStr = `${nY}-${String(nM + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                          cells.push({ dateStr, dayNum: i, isCurrentMonth: false });
                        }

                        const todayStr = format(new Date(), 'yyyy-MM-dd');

                        return cells.map((cell, idx) => {
                          const isToday = cell.dateStr === todayStr;
                          // Find active scheduled candidates for this date
                          const dayInterviews = candidates.filter(c => c.stage === 'Interviews' && c.interviewDate && c.interviewDate.startsWith(cell.dateStr));

                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                setInterviewForm(prev => ({ ...prev, date: cell.dateStr }));
                                if (!selectedCandidate) {
                                  const cand = candidates.find(c => c.stage === 'Shortlisting' || c.stage === 'Interviews') || candidates[0];
                                  if (cand) setSelectedCandidate(cand);
                                }
                                setShowScheduleModal(true);
                              }}
                              style={{
                                background: isToday 
                                  ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(124, 58, 237, 0.03) 100%)' 
                                  : cell.isCurrentMonth ? '#ffffff' : '#f8fafc',
                                padding: '10px 8px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                                cursor: 'pointer',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                border: isToday ? '2px solid #6366f1' : 'none',
                                position: 'relative',
                                boxShadow: isToday ? 'inset 0 0 0 1px rgba(99, 102, 241, 0.2)' : 'none'
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = isToday ? 'rgba(99, 102, 241, 0.12)' : cell.isCurrentMonth ? '#f0f9ff' : '#f1f5f9')}
                              onMouseLeave={e => (e.currentTarget.style.background = isToday ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(124, 58, 237, 0.03) 100%)' : cell.isCurrentMonth ? '#ffffff' : '#f8fafc')}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{
                                  fontSize: '0.8rem',
                                  fontWeight: isToday ? 900 : cell.isCurrentMonth ? 700 : 500,
                                  color: isToday ? '#ffffff' : cell.isCurrentMonth ? '#0f172a' : '#94a3b8',
                                  width: '24px',
                                  height: '24px',
                                  borderRadius: '50%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: isToday ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'transparent',
                                  boxShadow: isToday ? '0 2px 6px rgba(99, 102, 241, 0.4)' : 'none'
                                }}>
                                  {cell.dayNum}
                                </span>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  {isToday && (
                                    <span style={{ fontSize: '0.55rem', fontWeight: 900, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff', padding: '2px 6px', borderRadius: '99px', letterSpacing: '0.05em' }}>
                                      TODAY
                                    </span>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openAddSlotModal(cell.dateStr);
                                    }}
                                    style={{
                                      fontSize: '0.62rem',
                                      fontWeight: 800,
                                      background: '#eff6ff',
                                      color: '#3b82f6',
                                      border: '1px solid #bfdbfe',
                                      borderRadius: '6px',
                                      padding: '2px 7px',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease'
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#3b82f6'; e.currentTarget.style.color = '#fff'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.color = '#3b82f6'; }}
                                    title={`Add another interview slot for ${cell.dateStr}`}
                                  >
                                    + Slot
                                  </button>
                                </div>
                              </div>

                              {/* Scheduled Interview Pills on Calendar */}
                              <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px', overflowY: 'auto', maxHeight: '72px' }}>
                                {dayInterviews.map(cand => {
                                  const isTech = cand.interviewType?.includes('Technical') || cand.interviewType?.includes('Coding');
                                  const isHR = cand.interviewType?.includes('HR') || cand.interviewType?.includes('Screening');
                                  const isFinal = cand.interviewType?.includes('Management') || cand.interviewType?.includes('Final');

                                  const bgGrad = isTech
                                    ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)'
                                    : isHR
                                    ? 'linear-gradient(135deg, #e0e7ff 0%, #ede9fe 100%)'
                                    : isFinal
                                    ? 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)'
                                    : 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)';

                                  const borderCol = isTech ? '#a7f3d0' : isHR ? '#c7d2fe' : isFinal ? '#fde68a' : '#bae6fd';
                                  const textCol = isTech ? '#047857' : isHR ? '#3730a3' : isFinal ? '#b45309' : '#0369a1';

                                  return (
                                    <div
                                      key={cand.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedCandidate(cand);
                                        setShowScheduleModal(true);
                                      }}
                                      style={{
                                        background: bgGrad,
                                        border: `1px solid ${borderCol}`,
                                        borderRadius: '6px',
                                        padding: '4px 8px',
                                        fontSize: '0.65rem',
                                        color: textCol,
                                        fontWeight: 800,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                                        transition: 'all 0.15s ease'
                                      }}
                                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                      title={`${cand.firstName} ${cand.lastName} (${cand.interviewTime || '11:30 AM'}) - ${cand.interviewType || 'Interview'}`}
                                    >
                                      <Video className="h-3 w-3 flex-shrink-0" style={{ color: textCol }} />
                                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {cand.interviewTime || '11:30 AM'} · {cand.firstName}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>

                {/* ── Scheduled Interviews Table Section ── */}
                <div className="rec-card" style={{ padding: '1.75rem', background: '#ffffff', borderRadius: '1.25rem', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h2 className="rec-section-title" style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>Active Scheduled Interviews</h2>
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '3px 10px', borderRadius: '99px', background: '#e0e7ff', color: '#4338ca', border: '1px solid #c7d2fe' }}>
                          {candidates.filter(c => c.stage === 'Interviews').length} Active
                        </span>
                      </div>
                      <p className="rec-section-sub" style={{ margin: '3px 0 0 0', color: '#64748b' }}>Launch Google Meet video sessions, copy meeting URLs, and evaluate candidate interview outcomes</p>
                    </div>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table className="rec-table" style={{ width: '100%' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th style={{ padding: '12px 16px', borderRadius: '8px 0 0 8px' }}>Candidate Details</th>
                          <th style={{ padding: '12px 16px' }}>Candidate ID</th>
                          <th style={{ padding: '12px 16px' }}>Date & Time</th>
                          <th style={{ padding: '12px 16px' }}>Interview Panel</th>
                          <th style={{ padding: '12px 16px' }}>Meeting Link</th>
                          <th style={{ padding: '12px 16px' }}>Status</th>
                          <th style={{ textAlign: 'left', padding: '12px 16px', borderRadius: '0 8px 8px 0' }}>Evaluation Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidates.filter(c => c.stage === 'Interviews').length === 0 ? (
                          <tr>
                            <td colSpan={7} style={{ textAlign: 'center', padding: '3rem 1.5rem', color: '#94a3b8', fontSize: '0.82rem' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                <Calendar className="h-8 w-8 text-slate-300" />
                                <p style={{ margin: 0, fontWeight: 600, color: '#64748b' }}>No active interviews scheduled yet</p>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>Select any date cell on the calendar above or click "+ Schedule Interview Slot" to get started.</p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          candidates.filter(c => c.stage === 'Interviews').map(c => {
                            const candCode = getCandidateCode(c);
                            const meetLink = c.interviewLink || '';

                            return (
                              <tr key={c.id} className="rec-table-row" style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }}>
                                <td style={{ padding: '14px 16px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem', boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)' }}>
                                      {c.firstName.charAt(0)}
                                    </div>
                                    <div>
                                      <p style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>{c.firstName} {c.lastName}</p>
                                      <p style={{ fontSize: '0.7rem', color: '#64748b', margin: '1px 0 0 0', fontWeight: 500 }}>{c.jobTitle}</p>
                                    </div>
                                  </div>
                                </td>
                                <td style={{ padding: '14px 16px' }}>
                                  <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '0.75rem', color: '#4338ca', background: '#e0e7ff', padding: '3px 10px', borderRadius: '6px', border: '1px solid #c7d2fe' }}>
                                    #{candCode}
                                  </span>
                                </td>
                                <td style={{ padding: '14px 16px' }}>
                                  {c.interviewDate ? (
                                    <div>
                                      <p style={{ fontSize: '0.78rem', fontWeight: 800, color: '#4f46e5', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Calendar className="h-3.5 w-3.5 text-indigo-500" /> {c.interviewDate}
                                      </p>
                                      <p style={{ fontSize: '0.7rem', color: '#475569', margin: '2px 0 0 0', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Clock className="h-3 w-3 text-slate-400" /> {c.interviewTime || '11:30 AM'}
                                      </p>
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic' }}>Pending slot</span>
                                  )}
                                </td>
                                <td style={{ padding: '14px 16px' }}>
                                  <p style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>{c.interviewer || 'Sneha Nair'}</p>
                                  <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', marginTop: '2px', display: 'inline-block' }}>
                                    {c.interviewType || 'HR Screening'}
                                  </span>
                                </td>
                                <td style={{ padding: '14px 16px' }}>
                                  {meetLink ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <a
                                        href={meetLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="rec-btn-primary"
                                        style={{
                                          fontSize: '0.72rem',
                                          height: '32px',
                                          padding: '0 12px',
                                          gap: '6px',
                                          background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                                          textDecoration: 'none',
                                          borderRadius: '0.5rem',
                                          boxShadow: '0 3px 8px rgba(16, 185, 129, 0.3)',
                                          fontWeight: 700
                                        }}
                                      >
                                        <Video className="h-3.5 w-3.5" /> Join Google Meet
                                      </a>
                                      <button
                                        onClick={() => {
                                          navigator.clipboard.writeText(meetLink);
                                          alert('✅ Google Meet link copied to clipboard!');
                                        }}
                                        className="rec-btn-outline"
                                        style={{ height: '32px', width: '32px', padding: 0, borderRadius: '0.5rem', justifyContent: 'center', borderColor: '#cbd5e1' }}
                                        title="Copy Meeting Link"
                                      >
                                        <Copy className="h-3.5 w-3.5 text-slate-600" />
                                      </button>
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic' }}>No link provided</span>
                                  )}
                                </td>
                                <td style={{ padding: '14px 16px' }}>
                                  <span style={{ fontSize: '0.68rem', padding: '4px 10px', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', borderRadius: '99px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#d97706' }}></span> Scheduled
                                  </span>
                                </td>
                                <td style={{ textAlign: 'left', padding: '14px 16px' }}>
                                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-start' }}>
                                    <button
                                      onClick={() => handleInterviewDecision(c.id, 'fail')}
                                      className="rec-btn-outline"
                                      style={{ fontSize: '0.7rem', color: '#dc2626', borderColor: '#fca5a5', background: '#fef2f2', padding: '0 10px', height: '32px', borderRadius: '0.5rem', fontWeight: 700 }}
                                    >
                                      Reject
                                    </button>
                                    <button
                                      onClick={() => handleInterviewDecision(c.id, 'pass')}
                                      className="rec-btn-primary"
                                      style={{ fontSize: '0.7rem', padding: '0 12px', height: '32px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderRadius: '0.5rem', fontWeight: 700, boxShadow: '0 3px 8px rgba(16, 185, 129, 0.3)' }}
                                    >
                                      Pass & Extend Offer
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ════════════════ SCHEDULE INTERVIEW SLOT MODAL ════════════════ */}
                {showScheduleModal && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ background: '#ffffff', borderRadius: '1.25rem', width: '100%', maxWidth: '540px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)', overflow: 'hidden', border: '1px solid #e2e8f0', animation: 'fadeIn 0.2s ease-out' }}>
                      {/* Modal Header */}
                      <div style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #7c3aed 100%)', padding: '1.25rem 1.75rem', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ padding: '6px', background: 'rgba(255, 255, 255, 0.2)', borderRadius: '8px' }}>
                            <Calendar className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>Schedule Interview Slot</h3>
                            <p style={{ fontSize: '0.72rem', color: '#e0e7ff', margin: '2px 0 0 0' }}>Assign video meeting, date, time & panel members</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setShowScheduleModal(false)}
                          style={{ background: 'rgba(255, 255, 255, 0.2)', border: 0, color: '#fff', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 800, transition: 'all 0.2s' }}
                        >
                          ✕
                        </button>
                      </div>

                      {/* Modal Body */}
                      <form onSubmit={(e) => { e.preventDefault(); if (selectedCandidate) handleScheduleInterview(selectedCandidate.id); }} style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {/* Summary of existing slots on this date */}
                        {(() => {
                          const slotsOnDate = candidates.filter(c => c.interviewDate === interviewForm.date);
                          if (slotsOnDate.length === 0) return null;
                          return (
                            <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '0.85rem', padding: '0.85rem', fontSize: '0.75rem' }}>
                              <p style={{ fontWeight: 800, color: '#6b21a8', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Calendar className="h-4 w-4" /> {slotsOnDate.length} Interview Slot{slotsOnDate.length > 1 ? 's' : ''} Already Scheduled on {interviewForm.date}:
                              </p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                {slotsOnDate.map(cand => (
                                  <div key={cand.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '5px 10px', borderRadius: '6px', border: '1px solid #d8b4fe' }}>
                                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{cand.interviewTime || '11:30 AM'} · {cand.firstName} {cand.lastName}</span>
                                    <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>{cand.interviewType || 'HR'} ({cand.interviewer || 'Panel'})</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Select Candidate */}
                        <div className="auth-luxury-label">
                          Select Candidate *
                          <select 
                            className="rec-select" 
                            style={{ width: '100%', height: '42px', marginTop: '4px', borderRadius: '0.75rem', fontWeight: 700 }}
                            value={selectedCandidate?.id || ''}
                            onChange={e => {
                              const cand = candidates.find(c => c.id === e.target.value);
                              setSelectedCandidate(cand || null);
                            }}
                            required
                          >
                            <option value="">-- Select Candidate --</option>
                            {candidates.filter(c => c.stage === 'Shortlisting' || c.stage === 'Interviews' || c.stage === 'Applications').map(c => (
                              <option key={c.id} value={c.id}>
                                {c.firstName} {c.lastName} ({c.jobTitle}) - #{getCandidateCode(c)}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Date & Time Row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          <div className="auth-luxury-label">
                            Interview Date *
                            <input 
                              type="date" 
                              className="rec-search-input" 
                              style={{ width: '100%', paddingLeft: '0.85rem', height: '42px', marginTop: '4px', borderRadius: '0.75rem', fontWeight: 700 }}
                              value={interviewForm.date}
                              onChange={e => setInterviewForm({...interviewForm, date: e.target.value})}
                              required
                            />
                          </div>
                          <div className="auth-luxury-label">
                            Time Slot *
                            {(() => {
                              const slots = [
                                '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
                                '12:00 PM', '12:30 PM', '01:30 PM', '02:00 PM', '02:30 PM', '03:00 PM',
                                '03:30 PM', '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM'
                              ];
                              const isConflict = candidates.some(c => 
                                c.interviewDate === interviewForm.date && 
                                (c.interviewTime || '').trim().toLowerCase() === (interviewForm.time || '').trim().toLowerCase() && 
                                c.id !== selectedCandidate?.id &&
                                c.email !== selectedCandidate?.id
                              );
                              const conflictingCand = candidates.find(c => 
                                c.interviewDate === interviewForm.date && 
                                (c.interviewTime || '').trim().toLowerCase() === (interviewForm.time || '').trim().toLowerCase() && 
                                c.id !== selectedCandidate?.id &&
                                c.email !== selectedCandidate?.id
                              );

                              return (
                                <div>
                                  <select
                                    className="rec-select"
                                    style={{
                                      width: '100%',
                                      height: '42px',
                                      marginTop: '4px',
                                      borderRadius: '0.75rem',
                                      fontWeight: 700,
                                      borderColor: isConflict ? '#fca5a5' : undefined,
                                      background: isConflict ? '#fef2f2' : undefined
                                    }}
                                    value={interviewForm.time}
                                    onChange={e => setInterviewForm({ ...interviewForm, time: e.target.value })}
                                    required
                                  >
                                    <option value="">-- Select Available Slot --</option>
                                    {slots.map(s => {
                                      const bookedCand = candidates.find(c => 
                                        c.interviewDate === interviewForm.date && 
                                        (c.interviewTime || '').trim().toLowerCase() === s.toLowerCase() && 
                                        c.id !== selectedCandidate?.id &&
                                        c.email !== selectedCandidate?.id
                                      );
                                      return (
                                        <option 
                                          key={s} 
                                          value={s} 
                                          disabled={!!bookedCand}
                                          style={{ color: bookedCand ? '#94a3b8' : '#0f172a', fontWeight: bookedCand ? 400 : 700 }}
                                        >
                                          {s} {bookedCand ? `⛔ (BOOKED - ${bookedCand.firstName} ${bookedCand.lastName})` : '✅ (Available)'}
                                        </option>
                                      );
                                    })}
                                  </select>
                                  {isConflict && conflictingCand && (
                                    <p style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 800, margin: '4px 0 0 0' }}>
                                      ⚠️ Slot "{interviewForm.time}" is ALREADY BOOKED for {conflictingCand.firstName} {conflictingCand.lastName}.
                                    </p>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Type & Panel Row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          <div className="auth-luxury-label">
                            Interview Type
                            <select 
                              className="rec-select" 
                              style={{ width: '100%', height: '42px', marginTop: '4px', borderRadius: '0.75rem', fontWeight: 700 }}
                              value={interviewForm.type}
                              onChange={e => setInterviewForm({...interviewForm, type: e.target.value})}
                            >
                              <option>HR Screening</option>
                              <option>Technical Round</option>
                              <option>Coding Assessment</option>
                              <option>Management Final</option>
                            </select>
                          </div>
                          <div className="auth-luxury-label">
                            Interviewer / Panel *
                            <input 
                              type="text" 
                              className="rec-search-input" 
                              style={{ width: '100%', paddingLeft: '0.85rem', height: '42px', marginTop: '4px', borderRadius: '0.75rem', fontWeight: 700 }}
                              placeholder="e.g. Sneha Nair"
                              value={interviewForm.interviewer}
                              onChange={e => setInterviewForm({...interviewForm, interviewer: e.target.value})}
                              required
                            />
                          </div>
                        </div>

                        {/* Meeting Link Field */}
                        <div className="auth-luxury-label">
                          Interview Video Meeting Link *
                          <div style={{ marginTop: '4px' }}>
                            <input 
                              type="url" 
                              className="rec-search-input" 
                              style={{ width: '100%', paddingLeft: '0.85rem', height: '42px', borderRadius: '0.75rem', fontWeight: 600 }}
                              placeholder="Paste Google Meet URL (e.g. https://meet.google.com/xyz-uvwx-rst)"
                              value={interviewForm.link}
                              onChange={e => setInterviewForm({...interviewForm, link: e.target.value})}
                              required
                            />
                          </div>
                        </div>

                        {/* Modal Footer Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', paddingTop: '1.25rem', borderTop: '1px solid #f1f5f9' }}>
                          <button
                            type="button"
                            onClick={() => setShowScheduleModal(false)}
                            className="rec-btn-outline"
                            style={{ height: '42px', padding: '0 1.5rem', borderRadius: '0.75rem', fontWeight: 700 }}
                          >
                            Cancel
                          </button>
                          {(() => {
                            const isConflict = candidates.some(c => 
                              c.interviewDate === interviewForm.date && 
                              (c.interviewTime || '').trim().toLowerCase() === (interviewForm.time || '').trim().toLowerCase() && 
                              c.id !== selectedCandidate?.id &&
                              c.email !== selectedCandidate?.id
                            );
                            const isMissingLink = !interviewForm.link || !interviewForm.link.trim();
                            const isDisabled = isConflict || !selectedCandidate || isMissingLink;

                            return (
                              <button
                                type="submit"
                                disabled={isDisabled}
                                className="rec-btn-primary"
                                style={{
                                  height: '42px',
                                  padding: '0 1.75rem',
                                  borderRadius: '0.75rem',
                                  background: isDisabled ? '#94a3b8' : 'linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #7c3aed 100%)',
                                  boxShadow: isDisabled ? 'none' : '0 4px 14px rgba(79, 70, 229, 0.4)',
                                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                                  fontWeight: 800
                                }}
                              >
                                <Calendar className="h-4 w-4" /> Save & Confirm Schedule
                              </button>
                            );
                          })()}
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ════════════════ STAGE 7: OFFER ════════════════ */}
            {activeTab === 'stage-7' && (
              <div className="rec-card" style={{ padding: '1.5rem' }}>
                <h2 className="rec-section-title" style={{ marginBottom: '0.5rem' }}>Stage 7: Offer Letter Administration</h2>
                <p className="rec-section-sub" style={{ marginBottom: '1.5rem' }}>Draft salary details and issue contracts to selected candidates</p>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.5rem' }}>
                  {candidates.filter(c => c.stage === 'Offer').length === 0 ? (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', background: '#f8fafc', borderRadius: '1rem', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '0.75rem' }}>
                      No candidates currently in Offer Phase. Mark candidates as passed in Stage 6.
                    </div>
                  ) : (
                    candidates.filter(c => c.stage === 'Offer').map(c => (
                      <div key={c.id} style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '1rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                          <div>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>{c.firstName} {c.lastName}</h3>
                            <p style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>{c.jobTitle} · Exp: {c.experience}</p>
                          </div>
                          <div>
                            <span className={cn(
                              'px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase',
                              c.offerStatus === 'SENT' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                            )}>
                              {c.offerStatus || 'PENDING'}
                            </span>
                          </div>
                        </div>

                        {c.offerStatus !== 'SENT' ? (
                          <div className="flex flex-col gap-3">
                            <div className="auth-luxury-label">
                              Joining Date
                              <input 
                                type="date" 
                                className="rec-search-input" 
                                style={{ width: '100%', paddingLeft: '1rem', height: '36px' }}
                                value={offerForm.joiningDate}
                                onChange={e => setOfferForm({...offerForm, joiningDate: e.target.value})}
                              />
                            </div>
                            <div className="auth-luxury-label">
                              Base Salary (INR gross/month)
                              <input 
                                type="number" 
                                className="rec-search-input" 
                                style={{ width: '100%', paddingLeft: '1rem', height: '36px' }}
                                value={offerForm.salary}
                                onChange={e => setOfferForm({...offerForm, salary: e.target.value})}
                              />
                            </div>
                            <button 
                              onClick={() => handleExtendOfferSubmit(c.id)} 
                              className="rec-btn-primary" 
                              style={{ width: '100%', height: '36px', justifyContent: 'center' }}
                            >
                              <Send className="h-4 w-4" /> Send Offer Letter
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.75rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '0.75rem' }}>
                              <div><span style={{ color: '#94a3b8' }}>Offered Base:</span> <p style={{ fontWeight: 800, color: '#334155', marginTop: '2px' }}>₹{c.offerSalary?.toLocaleString()}</p></div>
                              <div><span style={{ color: '#94a3b8' }}>Joining Date:</span> <p style={{ fontWeight: 800, color: '#334155', marginTop: '2px' }}>{c.offerJoiningDate}</p></div>
                            </div>
                            
                            <div style={{ border: '1px dashed #cbd5e1', borderRadius: '0.75rem', padding: '0.75rem', textAlign: 'center', background: '#fffbeb' }}>
                              <p style={{ fontSize: '0.7rem', color: '#b45309', fontWeight: 700 }}>Candidate Offer Review Simulation</p>
                              <p style={{ fontSize: '0.62rem', color: '#d97706', marginTop: '2px' }}>Simulate applicant response to offer letter</p>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '0.5rem' }}>
                                <button 
                                  onClick={() => updateCandidateStage(c.id, 'Rejected')} 
                                  className="rec-btn-outline" 
                                  style={{ fontSize: '0.65rem', height: '26px', color: '#ef4444', borderColor: '#fca5a5' }}
                                >
                                  Decline Offer
                                </button>
                                <button 
                                  onClick={() => handleSimulateOfferAcceptance(c.id)} 
                                  className="rec-btn-primary" 
                                  style={{ fontSize: '0.65rem', height: '26px', background: '#10b981' }}
                                >
                                  Accept Offer
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ════════════════ STAGE 8: DOCUMENTS (WITH GOOGLE FORM INTEGRATION) ════════════════ */}
            {activeTab === 'stage-8' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Google Form Integration Header Bar */}
                <div className="rec-card" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #e2e8f0', borderRadius: '1.25rem', boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ padding: '0.65rem', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderRadius: '0.85rem', color: '#fff', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)', display: 'flex' }}>
                        <FolderOpen className="h-6 w-6" />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <h2 className="rec-section-title" style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>Stage 8: Document Verification & Google Form Collector</h2>
                          <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '99px', background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }}>
                            Google Form Enabled
                          </span>
                        </div>
                        <p className="rec-section-sub" style={{ margin: '3px 0 0 0', color: '#64748b' }}>HR collects and verifies credential proofs and Google Form attachments before onboard activation</p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <a
                        href={googleSheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rec-btn-outline"
                        style={{ fontSize: '0.78rem', height: '38px', padding: '0 14px', borderRadius: '0.75rem', gap: '6px', textDecoration: 'none', background: '#fff', borderColor: '#cbd5e1', color: '#334155', fontWeight: 700 }}
                      >
                        <ExternalLink className="h-4 w-4 text-emerald-600" /> View Google Form Sheet
                      </a>
                      <button
                        onClick={() => setShowFormModal(!showFormModal)}
                        className="rec-btn-primary"
                        style={{ fontSize: '0.78rem', height: '38px', padding: '0 16px', borderRadius: '0.75rem', gap: '6px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)', fontWeight: 700 }}
                      >
                        <FileText className="h-4 w-4" /> {showFormModal ? 'Hide Google Form' : 'Show Google Form Collector'}
                      </button>
                    </div>
                  </div>

                  {/* Embedded Google Form Section (Toggled) */}
                  {showFormModal && (
                    <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f0fdf4', padding: '10px 14px', borderRadius: '0.75rem', border: '1px solid #bbf7d0' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CheckCircle className="h-4 w-4 text-emerald-600" /> Embedded Google Form Document Collector (Live Response Sync)
                        </span>
                        <a href={googleFormEmbedUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700, textDecoration: 'underline' }}>
                          Open in New Tab ↗
                        </a>
                      </div>
                      <div style={{ width: '100%', height: '520px', borderRadius: '0.85rem', overflow: 'hidden', border: '1.5px solid #cbd5e1', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
                        <iframe
                          src={googleFormEmbedUrl}
                          width="100%"
                          height="100%"
                          frameBorder="0"
                          marginHeight={0}
                          marginWidth={0}
                          title="Google Form Document Collection"
                        >
                          Loading Document Google Form...
                        </iframe>
                      </div>
                    </div>
                  )}
                </div>

                {/* Candidate Document Verification Cards Matrix */}
                <div className="rec-card" style={{ padding: '1.5rem', background: '#ffffff', borderRadius: '1.25rem', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '1.5rem' }}>
                    {candidates.filter(c => c.stage === 'Documents').length === 0 ? (
                      <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3.5rem 1.5rem', background: '#f8fafc', borderRadius: '1rem', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '0.82rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <FolderOpen className="h-8 w-8 text-slate-300" />
                          <p style={{ margin: 0, fontWeight: 700, color: '#64748b' }}>No candidates currently pending Document Verification</p>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>Candidates who pass the Stage 6 Interview will automatically appear here.</p>
                        </div>
                      </div>
                    ) : (
                      candidates.filter(c => c.stage === 'Documents').map(c => {
                        const code = getCandidateCode(c);
                        const storedDocs = getStoredCandidateDocs(c.id, c.email, code);
                        const combinedImages = [...(c.attachmentImages || [])];
                        storedDocs.forEach(d => {
                          if (!combinedImages.includes(d)) combinedImages.push(d);
                        });
                        const formAtts = combinedImages.map((att, idx) => parseAttachmentItem(att, idx));

                        return (
                          <div key={c.id} style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '1.15rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: '0 4px 15px rgba(15, 23, 42, 0.03)' }}>
                            {/* Candidate Header */}
                            <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem', boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)' }}>
                                  {c.firstName.charAt(0)}
                                </div>
                                <div>
                                  <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>{c.firstName} {c.lastName}</h3>
                                  <p style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, margin: '2px 0 0 0' }}>{c.jobTitle} · #{code}</p>
                                </div>
                              </div>
                              <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '3px 8px', borderRadius: '99px', background: '#e0e7ff', color: '#4338ca', border: '1px solid #c7d2fe' }}>
                                Stage 8
                              </span>
                            </div>

                            {/* Google Form Attachments List (If candidate has form uploads) */}
                            <div style={{ background: '#f8fafc', borderRadius: '0.85rem', padding: '0.85rem', border: '1px solid #e2e8f0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                                <p style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <FileText className="h-4 w-4 text-emerald-600" /> Submitted Google Form Attachments ({formAtts.length})
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  {formAtts.length > 0 && (
                                    <span style={{ fontSize: '0.6rem', color: '#059669', fontWeight: 800, background: '#dcfce7', padding: '2px 6px', borderRadius: '4px' }}>
                                      Synced
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDriveUploadModal({
                                        candidateId: c.id,
                                        candidateName: `${c.firstName} ${c.lastName}`.trim(),
                                        candidateEmail: c.email,
                                        candidateCode: code,
                                        docType: 'Additional Document',
                                        docField: 'additional'
                                      });
                                      setDriveDocTitleInput('Google Drive Document');
                                      setDriveLinkInput('');
                                    }}
                                    className="rec-btn-outline"
                                    style={{ fontSize: '0.62rem', height: '24px', padding: '0 8px', gap: '4px', color: '#0284c7', borderColor: '#bae6fd', background: '#f0f9ff', fontWeight: 700 }}
                                    title="Add any document via Google Drive shareable link"
                                  >
                                    <Plus className="h-3 w-3" /> Add Drive Link
                                  </button>
                                </div>
                              </div>

                              {formAtts.length === 0 ? (
                                <p style={{ fontSize: '0.7rem', color: '#94a3b8', margin: 0, fontStyle: 'italic' }}>
                                  No raw Google Form attachments attached. Use Google Form collector or click "Add Drive Link" above.
                                </p>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {formAtts.map((att, idx) => {
                                    const displayName = (att.docType === 'Resume' || (!att.docField && idx === 0 && (att.url?.includes('resume') || att.name.includes('Doc_1')))) 
                                      ? 'Submitted Resume (Google Form)' 
                                      : (att.name || `Document ${idx + 1}`);

                                    return (
                                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', padding: '6px 10px', borderRadius: '0.5rem', border: '1px solid #cbd5e1', flexWrap: 'wrap', gap: '6px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', minWidth: '160px', flex: 1 }}>
                                          <FileText className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0" />
                                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {displayName}
                                          </span>
                                          {(att.driveId || att.url?.includes('drive.google.com')) && (
                                            <span style={{ fontSize: '0.58rem', background: '#e0f2fe', color: '#0369a1', padding: '1px 5px', borderRadius: '4px', fontWeight: 800, flexShrink: 0 }}>
                                              Drive
                                            </span>
                                          )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <button
                                            type="button"
                                            onClick={() => setPreviewMediaAttachment({ ...att, name: displayName })}
                                            className="rec-btn-outline"
                                            style={{ fontSize: '0.68rem', height: '26px', padding: '0 8px', gap: '4px', color: '#4f46e5', borderColor: '#c7d2fe', fontWeight: 700 }}
                                            title="View and inspect document in viewer"
                                          >
                                            <Eye className="h-3 w-3" /> View Document
                                          </button>
                                          {(att.driveId || att.url?.includes('drive.google.com') || att.url?.startsWith('http')) && (
                                            <a
                                              href={att.originalUrl || att.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="rec-btn-outline"
                                              style={{ fontSize: '0.68rem', height: '26px', padding: '0 8px', gap: '4px', color: '#0284c7', borderColor: '#bae6fd', background: '#f0f9ff', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                                              title="Open link in Google Drive tab"
                                            >
                                              <ExternalLink className="h-3 w-3" /> Open Link ↗
                                            </a>
                                          )}
                                          {att.docField && (
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteDoc(c.id, c.email, att.id || att.url)}
                                              className="rec-icon-btn"
                                              style={{ width: 24, height: 24, borderRadius: '4px', color: '#94a3b8', border: '1px solid #e2e8f0' }}
                                              title="Remove this attached document"
                                            >
                                              <X className="h-3 w-3" />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>



                            {/* Verification Footer Action */}
                            <div>
                              <button
                                onClick={() => handleVerifyDocumentsSubmit(c.id)}
                                className="rec-btn-primary"
                                style={{
                                  width: '100%',
                                  height: '42px',
                                  justifyContent: 'center',
                                  marginTop: '0.25rem',
                                  borderRadius: '0.75rem',
                                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                                  fontWeight: 800
                                }}
                              >
                                <UserCheck className="h-4.5 w-4.5" /> Verify & Approve Candidate Credentials
                              </button>
                              <p style={{ fontSize: '0.65rem', color: '#64748b', textAlign: 'center', marginTop: '6px', margin: '6px 0 0 0' }}>
                                Approving candidate credentials will transition profile to Stage 9: Employee Onboarding
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ════════════════ STAGE 9: ONBOARDING ════════════════ */}
            {activeTab === 'stage-9' && (
              <div className="rec-card" style={{ padding: '1.5rem' }}>
                <h2 className="rec-section-title" style={{ marginBottom: '0.5rem' }}>Stage 9: Initialize System Onboarding Invite</h2>
                <p className="rec-section-sub" style={{ marginBottom: '1.5rem' }}>Final step: Issue formal onboarding credentials and welcome token into the HRMS database</p>
                
                <div style={{ display: 'grid', gridTemplateColumns: onboardingInviteResult ? '1fr' : 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.5rem' }}>
                  {onboardingInviteResult ? (
                    <div style={{ maxWidth: '640px', margin: '0 auto', width: '100%', background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '1rem', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ padding: '0.5rem', background: '#10b981', borderRadius: '50%', display: 'flex', color: '#fff' }}>
                          <CheckCircle className="h-6 w-6" />
                        </div>
                        <div>
                          <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#14532d' }}>Onboarding Invite Successfully Activated!</h3>
                          <p style={{ fontSize: '0.7rem', color: '#166534', fontWeight: 600 }}>System Token registered on Tenant Isolation context</p>
                        </div>
                      </div>

                      <div style={{ background: '#fff', padding: '1rem', borderRadius: '0.75rem', border: '1px solid #dcfce7', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <p><span style={{ color: '#64748b', fontWeight: 600 }}>Employee Name:</span> <span style={{ fontWeight: 800, color: '#334155' }}>{onboardingInviteResult.invite?.firstName} {onboardingInviteResult.invite?.lastName}</span></p>
                        <p><span style={{ color: '#64748b', fontWeight: 600 }}>Access Email:</span> <span style={{ fontWeight: 800, color: '#334155' }}>{onboardingInviteResult.invite?.personalEmail}</span></p>
                        <p><span style={{ color: '#64748b', fontWeight: 600 }}>Designation Role:</span> <span style={{ fontWeight: 800, color: '#334155' }}>{onboardingInviteResult.invite?.designation}</span></p>
                        <p><span style={{ color: '#64748b', fontWeight: 600 }}>Starting Salary:</span> <span style={{ fontWeight: 800, color: '#334155' }}>₹{onboardingInviteResult.invite?.baseSalary?.toLocaleString()}/month</span></p>
                        <p><span style={{ color: '#64748b', fontWeight: 600 }}>Onboarding Token:</span> <span style={{ fontWeight: 800, color: '#4f46e5', fontFamily: 'monospace' }}>{onboardingInviteResult.invite?.token}</span></p>
                      </div>

                      <div className="auth-luxury-label">
                        Generated Portal Onboarding Link
                        <div style={{ display: 'flex', gap: '6px', marginTop: '0.25rem' }}>
                          <input 
                            type="text" 
                            readOnly 
                            className="rec-search-input" 
                            style={{ flex: 1, paddingLeft: '0.75rem', background: '#fff' }} 
                            value={`${window.location.origin}/onboarding/invite/${onboardingInviteResult.invite?.token}`} 
                          />
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/onboarding/invite/${onboardingInviteResult.invite?.token}`);
                              alert('Link copied to clipboard!');
                            }} 
                            className="rec-btn-outline" 
                            style={{ padding: '0 0.75rem' }}
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button onClick={() => setOnboardingInviteResult(null)} className="rec-btn-outline" style={{ flex: 1, height: '36px', padding: '0', justifyContent: 'center' }}>
                          Onboard Another Hired Candidate
                        </button>
                        <a 
                          href={`/onboarding/invite/${onboardingInviteResult.invite?.token}`} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="rec-btn-primary text-center" 
                          style={{ flex: 1, height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
                        >
                          Launch Candidate Portal <ExternalLink className="h-3.5 w-3.5 ml-1" />
                        </a>
                      </div>
                    </div>
                  ) : candidates.filter(c => c.stage === 'Onboarding' || c.stage === 'Hired').length === 0 ? (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', background: '#f8fafc', borderRadius: '1rem', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '0.75rem' }}>
                      No candidates currently awaiting onboarding invitation. Verify document approvals in Stage 8.
                    </div>
                  ) : (
                    candidates.filter(c => c.stage === 'Onboarding' || c.stage === 'Hired').map(c => (
                      <div key={c.id} style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '1rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                          <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>{c.firstName} {c.lastName}</h3>
                          <p style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>{c.jobTitle} · Email: {c.email}</p>
                        </div>

                        <div style={{ background: '#faf5ff', border: '1px solid #f3e8ff', borderRadius: '0.75rem', padding: '0.75rem', fontSize: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          <p><span style={{ color: '#7c3aed', fontWeight: 700 }}>Contract Department:</span> <span style={{ color: '#4b5563', fontWeight: 800 }}>General Engineering</span></p>
                          <p><span style={{ color: '#7c3aed', fontWeight: 700 }}>Monthly Salary Rate:</span> <span style={{ color: '#4b5563', fontWeight: 800 }}>₹{c.offerSalary?.toLocaleString() || '75,000'}</span></p>
                          <p><span style={{ color: '#7c3aed', fontWeight: 700 }}>Start Date:</span> <span style={{ color: '#4b5563', fontWeight: 800 }}>{c.offerJoiningDate || 'Immediate'}</span></p>
                        </div>

                        <button 
                          disabled={onboardingProgressId === c.id} 
                          onClick={() => handleInitiateSystemOnboarding(c.id)} 
                          className="rec-btn-primary animate-pulse" 
                          style={{ width: '100%', height: '38px', justifyContent: 'center', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', boxShadow: '0 4px 12px rgba(16,185,129,0.2)' }}
                        >
                          {onboardingProgressId === c.id ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" /> Initializing Onboarding invite...
                            </>
                          ) : (
                            <>
                              <UserPlus className="h-4 w-4" /> Initialize System Onboarding Invite
                            </>
                          )}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ════════════════ ALL APPLICANTS ════════════════ */}
            {activeTab === 'candidates' && (() => {
              const map = new Map<string, any>();

              // Add candidates state list
              candidates.forEach(c => {
                const key = c.email || c.id;
                const isAccepted = formApplicantStatuses[c.email] === 'accepted' || formApplicantStatuses[c.id] === 'accepted';
                const isDeclined = formApplicantStatuses[c.email] === 'declined' || formApplicantStatuses[c.id] === 'declined';
                map.set(key, {
                  ...c,
                  stage: isAccepted ? 'Shortlisting' : isDeclined ? 'Rejected' : c.stage,
                  accepted: isAccepted || c.stage === 'Shortlisting' || c.stage === 'Interviews' || c.stage === 'Offer' || c.stage === 'Onboarding',
                  declined: isDeclined || c.stage === 'Rejected'
                });
              });

              // Add live sheet responses
              liveSheetResponses.forEach(r => {
                if (r.email) {
                  const isAccepted = formApplicantStatuses[r.email] === 'accepted' || formApplicantStatuses[r.id] === 'accepted';
                  const isDeclined = formApplicantStatuses[r.email] === 'declined' || formApplicantStatuses[r.id] === 'declined';
                  if (!map.has(r.email)) {
                    const nameParts = (r.fullName || 'Applicant').split(' ');
                    map.set(r.email, {
                      id: r.id || `cand-live-${r.email}`,
                      firstName: nameParts[0] || 'Applicant',
                      lastName: nameParts.slice(1).join(' ') || '',
                      email: r.email,
                      phone: r.mobile || 'N/A',
                      location: r.location || 'WNP',
                      experience: r.qualification || 'Degree',
                      graduationYear: r.graduationYear || '-',
                      appliedDate: r.timestamp || '24/08/2026 10:58:33',
                      resumeUrl: r.resumeLink,
                      source: 'Google Form',
                      jobTitle: 'Google Form Recruitment',
                      stage: isAccepted ? 'Shortlisting' : isDeclined ? 'Rejected' : 'Applications',
                      accepted: isAccepted,
                      declined: isDeclined,
                      skills: ['Google Form', r.qualification || 'Degree']
                    });
                  }
                }
              });

              DEFAULT_FALLBACK_APPLICANTS.forEach(fb => {
                const emailKey = fb.email.toLowerCase();
                if (!map.has(fb.email) && !map.has(fb.id) && !map.has(emailKey)) {
                  const isAccepted = formApplicantStatuses[fb.email] === 'accepted' || 
                    formApplicantStatuses[fb.id] === 'accepted' || 
                    formApplicantStatuses[emailKey] === 'accepted';
                  const isDeclined = formApplicantStatuses[fb.email] === 'declined' || 
                    formApplicantStatuses[fb.id] === 'declined' || 
                    formApplicantStatuses[emailKey] === 'declined';
                  map.set(fb.email, {
                    ...fb,
                    stage: isAccepted ? 'Shortlisting' : isDeclined ? 'Rejected' : 'Applications',
                    accepted: isAccepted,
                    declined: isDeclined,
                    skills: ['Google Form', fb.experience || 'Degree']
                  });
                }
              });

              const allSystemApplicants = Array.from(map.values()).filter(c => 
                !c.email?.includes('applicant_') && 
                !c.email?.includes('@example.com') &&
                !c.email?.includes('employee_')
              );

              const totalCount = allSystemApplicants.length;
              const acceptedCount = allSystemApplicants.filter(c => c.accepted || c.stage === 'Shortlisting' || c.stage === 'Interviews' || c.stage === 'Offer' || c.stage === 'Onboarding').length;
              const rejectedCount = allSystemApplicants.filter(c => c.declined || c.stage === 'Rejected').length;
              const pendingCount = allSystemApplicants.filter(c => !c.accepted && !c.declined && c.stage !== 'Shortlisting' && c.stage !== 'Rejected').length;

              const filteredApplicants = allSystemApplicants.filter(c => {
                const isAccepted = c.accepted || c.stage === 'Shortlisting' || c.stage === 'Interviews' || c.stage === 'Offer' || c.stage === 'Onboarding';
                const isDeclined = c.declined || c.stage === 'Rejected';
                
                if (allApplicantsFilter === 'accepted' && !isAccepted) return false;
                if (allApplicantsFilter === 'rejected' && !isDeclined) return false;
                if (allApplicantsFilter === 'pending' && (isAccepted || isDeclined)) return false;

                if (searchQuery) {
                  const q = searchQuery.toLowerCase();
                  const name = `${c.firstName || ''} ${c.lastName || ''}`.toLowerCase();
                  const email = (c.email || '').toLowerCase();
                  const phone = (c.phone || c.mobile || '').toLowerCase();
                  const location = (c.location || '').toLowerCase();
                  const code = getCandidateCode(c);
                  return name.includes(q) || email.includes(q) || phone.includes(q) || location.includes(q) || code.includes(q);
                }
                return true;
              });

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {/* Top Stats Summary Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                    <div style={{ background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '1px solid #bfdbfe', borderRadius: '0.85rem', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <p style={{ fontSize: '0.7rem', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase' }}>Total Applicants</p>
                        <p style={{ fontSize: '1.75rem', fontWeight: 900, color: '#1d4ed8', margin: '2px 0 0 0' }}>{totalCount}</p>
                      </div>
                      <div style={{ padding: '0.6rem', background: '#3b82f6', borderRadius: '0.6rem', color: '#fff', display: 'flex' }}>
                        <Users className="h-6 w-6" />
                      </div>
                    </div>

                    <div style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #bbf7d0', borderRadius: '0.85rem', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <p style={{ fontSize: '0.7rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase' }}>Accepted / Shortlisted</p>
                        <p style={{ fontSize: '1.75rem', fontWeight: 900, color: '#15803d', margin: '2px 0 0 0' }}>{acceptedCount}</p>
                      </div>
                      <div style={{ padding: '0.6rem', background: '#16a34a', borderRadius: '0.6rem', color: '#fff', display: 'flex' }}>
                        <CheckCircle className="h-6 w-6" />
                      </div>
                    </div>

                    <div style={{ background: 'linear-gradient(135deg, #fef2f2, #fee2e2)', border: '1px solid #fca5a5', borderRadius: '0.85rem', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <p style={{ fontSize: '0.7rem', fontWeight: 800, color: '#991b1b', textTransform: 'uppercase' }}>Rejected / Declined</p>
                        <p style={{ fontSize: '1.75rem', fontWeight: 900, color: '#b91c1c', margin: '2px 0 0 0' }}>{rejectedCount}</p>
                      </div>
                      <div style={{ padding: '0.6rem', background: '#dc2626', borderRadius: '0.6rem', color: '#fff', display: 'flex' }}>
                        <XCircle className="h-6 w-6" />
                      </div>
                    </div>

                    <div style={{ background: 'linear-gradient(135deg, #faf5ff, #f3e8ff)', border: '1px solid #e9d5ff', borderRadius: '0.85rem', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <p style={{ fontSize: '0.7rem', fontWeight: 800, color: '#6b21a8', textTransform: 'uppercase' }}>Pending Review</p>
                        <p style={{ fontSize: '1.75rem', fontWeight: 900, color: '#7e22ce', margin: '2px 0 0 0' }}>{pendingCount}</p>
                      </div>
                      <div style={{ padding: '0.6rem', background: '#9333ea', borderRadius: '0.6rem', color: '#fff', display: 'flex' }}>
                        <Clock className="h-6 w-6" />
                      </div>
                    </div>
                  </div>

                  {/* Main Card with Search & Filters */}
                  <div className="rec-card" style={{ padding: 0 }}>
                    <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                      <div className="rec-search-wrap" style={{ maxWidth: 380, flex: 1 }}>
                        <Search className="rec-search-icon" />
                        <input 
                          type="text" 
                          className="rec-search-input" 
                          placeholder="Search by name, email, phone, or ID (#1042)..." 
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '10px', flexWrap: 'wrap' }}>
                        {[
                          { key: 'all', label: `All Applicants (${totalCount})`, color: '#334155' },
                          { key: 'accepted', label: `Accepted (${acceptedCount})`, color: '#15803d' },
                          { key: 'rejected', label: `Rejected (${rejectedCount})`, color: '#b91c1c' },
                          { key: 'pending', label: `Pending (${pendingCount})`, color: '#7e22ce' },
                        ].map(flt => {
                          const active = allApplicantsFilter === flt.key;
                          return (
                            <button
                              key={flt.key}
                              onClick={() => setAllApplicantsFilter(flt.key as any)}
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: active ? 800 : 600,
                                padding: '5px 12px',
                                borderRadius: '7px',
                                border: 0,
                                background: active ? '#ffffff' : 'transparent',
                                color: active ? flt.color : '#64748b',
                                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                cursor: 'pointer'
                              }}
                            >
                              {flt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table className="rec-table" style={{ width: '100%', minWidth: '1100px' }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '12px 16px' }}>Applicant</th>
                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Candidate ID</th>
                            <th style={{ padding: '12px 16px' }}>Mobile Number</th>
                            <th style={{ padding: '12px 16px' }}>Location</th>
                            <th style={{ padding: '12px 16px' }}>Qualification</th>
                            <th style={{ padding: '12px 16px' }}>Resume Link</th>
                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status / Stage</th>
                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Inspect Status</th>
                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredApplicants.length === 0 ? (
                            <tr>
                              <td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                                No applicants found matching query or selected status filter.
                              </td>
                            </tr>
                          ) : (
                            filteredApplicants.map(c => {
                              const isAccepted = c.accepted || c.stage === 'Shortlisting' || c.stage === 'Interviews' || c.stage === 'Offer' || c.stage === 'Onboarding';
                              const isDeclined = c.declined || c.stage === 'Rejected';

                              let driveUrl = c.resumeUrl || c.resumeLink;
                              if (c.attachmentImages && c.attachmentImages.length > 0) {
                                const att = c.attachmentImages[0];
                                if (typeof att === 'string' && att.includes('http')) {
                                  try {
                                    const parsed = JSON.parse(att);
                                    driveUrl = parsed.url || parsed.downloadUrl || att;
                                  } catch (_) {
                                    driveUrl = att;
                                  }
                                }
                              }

                              return (
                                <tr key={c.id || c.email} className="rec-table-row">
                                  <td style={{ padding: '12px 16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                      <div className={cn('h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs uppercase shadow-sm border', c.avatarColor || 'bg-purple-100 text-purple-600 border-purple-200')}>
                                        {(c.firstName || 'A').charAt(0)}{(c.lastName || '').charAt(0)}
                                      </div>
                                      <div>
                                        <p style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>{c.firstName || c.name || 'Applicant'} {c.lastName || ''}</p>
                                        <p style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>{c.email}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#059669', fontFamily: 'monospace', padding: '3px 8px', background: '#ecfdf5', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                                      #{getCandidateCode(c)}
                                    </span>
                                  </td>
                                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#334155', fontSize: '0.75rem' }}>
                                    {c.phone || c.mobile || '9949020175'}
                                  </td>
                                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', fontSize: '0.75rem' }}>
                                    {c.location || 'WNP'}
                                  </td>
                                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', fontSize: '0.75rem' }}>
                                    {c.experience || c.qualification || '-'}
                                  </td>
                                  <td style={{ padding: '12px 16px' }}>
                                    {driveUrl ? (
                                      <a 
                                        href={driveUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'underline', fontSize: '0.72rem', maxWidth: '200px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                        title={driveUrl}
                                      >
                                        View Resume
                                      </a>
                                    ) : (
                                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic' }}>No link</span>
                                    )}
                                  </td>
                                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                    {isAccepted ? (
                                      <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '4px 10px', borderRadius: '99px', background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" /> Accepted
                                      </span>
                                    ) : isDeclined ? (
                                      <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '4px 10px', borderRadius: '99px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                        <XCircle className="h-3.5 w-3.5 text-red-600" /> Rejected
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '4px 10px', borderRadius: '99px', background: '#f3e8ff', color: '#7e22ce', border: '1px solid #d8b4fe', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                        <Clock className="h-3.5 w-3.5 text-purple-600" /> Pending Review
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                    <button
                                      onClick={() => setInspectCandidate(c)}
                                      className="rec-btn-outline"
                                      style={{ fontSize: '0.68rem', height: '28px', padding: '0 10px', color: '#4f46e5', borderColor: '#c7d2fe', background: '#eef2ff', gap: '4px', display: 'inline-flex', alignItems: 'center', fontWeight: 700, borderRadius: '6px' }}
                                    >
                                      <Search className="h-3.5 w-3.5" /> Inspect Status
                                    </button>
                                  </td>
                                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                    {isAccepted ? (
                                      <button
                                        onClick={() => setActiveTab('stage-5')}
                                        className="rec-btn-outline"
                                        style={{ fontSize: '0.68rem', height: '28px', padding: '0 10px', color: '#0369a1', borderColor: '#bae6fd', background: '#f0f9ff' }}
                                      >
                                        View in Shortlist →
                                      </button>
                                    ) : isDeclined ? (
                                      <button
                                        onClick={() => handleAcceptFormApplicant(c)}
                                        className="rec-btn-outline"
                                        style={{ fontSize: '0.68rem', height: '28px', padding: '0 10px', color: '#16a34a', borderColor: '#bbf7d0', background: '#f0fdf4' }}
                                      >
                                        Re-Accept
                                      </button>
                                    ) : (
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                        <button
                                          onClick={() => handleAcceptFormApplicant(c)}
                                          className="rec-btn-primary"
                                          style={{ fontSize: '0.68rem', height: '28px', padding: '0 10px', background: '#16a34a', borderColor: '#15803d', gap: '4px' }}
                                        >
                                          <Check className="h-3.5 w-3.5" /> Accept
                                        </button>
                                        <button
                                          onClick={() => handleDeclineFormApplicant(c)}
                                          className="rec-btn-outline"
                                          style={{ fontSize: '0.68rem', height: '28px', padding: '0 10px', color: '#dc2626', borderColor: '#fca5a5', background: '#fef2f2', gap: '4px' }}
                                        >
                                          <X className="h-3.5 w-3.5" /> Decline
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Inspect Candidate Modal Popup */}
                  {inspectCandidate && (() => {
                    const c = inspectCandidate;
                    const isAccepted = c.accepted || c.stage === 'Shortlisting' || c.stage === 'Interviews' || c.stage === 'Offer' || c.stage === 'Onboarding' || formApplicantStatuses[c.email] === 'accepted';
                    const isDeclined = c.declined || c.stage === 'Rejected' || formApplicantStatuses[c.email] === 'declined';
                    const candidateCode = getCandidateCode(c);

                    let currentStageName = 'Stage 1: Application Received';
                    let stuckReason = '';
                    let statusColor = '#6366f1';
                    let statusBg = '#eef2ff';

                    if (isDeclined) {
                      currentStageName = 'Stage 2: Shortlisting & Screening';
                      stuckReason = '❌ Candidate Application Rejected: Profile was declined during initial shortlisting evaluation by HR Manager.';
                      statusColor = '#dc2626';
                      statusBg = '#fef2f2';
                    } else if (isAccepted) {
                      currentStageName = c.stage === 'Interviews' ? 'Stage 3: Technical Interview Round' : c.stage === 'Offer' ? 'Stage 4: Offer Letter Stage' : c.stage === 'Documents' ? 'Stage 5: Document Collection' : c.stage === 'Onboarding' ? 'Stage 6: Employee Onboarding' : 'Stage 2: Shortlisting Approved';
                      stuckReason = '✅ Candidate Accepted: Profile approved and currently active in recruitment pipeline.';
                      statusColor = '#16a34a';
                      statusBg = '#f0fdf4';
                    } else {
                      currentStageName = 'Stage 1: Google Form Submission Queue';
                      stuckReason = '⏳ Candidate Pending Review: Candidate applied via Google Form and is currently awaiting HR shortlisting decision.';
                      statusColor = '#9333ea';
                      statusBg = '#faf5ff';
                    }

                    const timelineSteps = [
                      {
                        title: 'Stage 1: Google Form Application Received',
                        desc: `Applied on ${c.appliedDate || '24/08/2026 10:58:33'} via ${c.source || 'Google Form'}`,
                        status: 'completed',
                      },
                      {
                        title: 'Stage 2: Shortlisting & Initial Screening',
                        desc: isDeclined 
                          ? '❌ Application Declined — Rejected at Shortlisting Stage' 
                          : isAccepted 
                            ? '✅ Accepted — Profile approved for Shortlist' 
                            : '⏳ Currently Pending Review — Awaiting HR Decision',
                        status: isDeclined ? 'rejected' : isAccepted ? 'completed' : 'pending',
                      },
                      {
                        title: 'Stage 3: Interview Round & Technical Evaluation',
                        desc: c.stage === 'Interviews' ? '📅 Interview Scheduled' : isAccepted ? 'Awaiting interview schedule' : 'Not started',
                        status: c.stage === 'Interviews' ? 'active' : 'upcoming',
                      },
                      {
                        title: 'Stage 4: Extended Offer & Salary Terms',
                        desc: c.stage === 'Offer' ? '📜 Offer Extended' : 'Not reached',
                        status: c.stage === 'Offer' ? 'active' : 'upcoming',
                      },
                      {
                        title: 'Stage 5: Document Collection & Verification',
                        desc: c.stage === 'Documents' ? '📁 Document Verification' : 'Not reached',
                        status: c.stage === 'Documents' ? 'active' : 'upcoming',
                      },
                      {
                        title: 'Stage 6: System Employee Onboarding',
                        desc: c.stage === 'Onboarding' ? '🎉 Joined & Onboarded' : 'Not reached',
                        status: c.stage === 'Onboarding' ? 'completed' : 'upcoming',
                      },
                    ];

                    return (
                      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                        <div style={{ background: '#ffffff', borderRadius: '1.25rem', width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                          
                          {/* Modal Header */}
                          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafafa', borderTopLeftRadius: '1.25rem', borderTopRightRadius: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <div className="h-10 w-10 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow">
                                {(c.firstName || 'A').charAt(0)}{(c.lastName || '').charAt(0)}
                              </div>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>{c.firstName} {c.lastName}</h3>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#059669', fontFamily: 'monospace', padding: '1px 6px', background: '#ecfdf5', borderRadius: '5px', border: '1px solid #a7f3d0' }}>
                                    #{candidateCode}
                                  </span>
                                </div>
                                <p style={{ fontSize: '0.7rem', color: '#64748b', margin: 0 }}>{c.email} · {c.phone || c.mobile || 'N/A'}</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => setInspectCandidate(null)}
                              style={{ background: '#f1f5f9', border: 0, borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          {/* Modal Body */}
                          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            
                            {/* Current Status Box */}
                            <div style={{ background: statusBg, border: `1px solid ${statusColor}40`, borderRadius: '0.85rem', padding: '1rem 1.25rem' }}>
                              <p style={{ fontSize: '0.7rem', fontWeight: 800, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px 0' }}>
                                Current Pipeline Inspection Status
                              </p>
                              <p style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
                                {currentStageName}
                              </p>
                              <p style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
                                {stuckReason}
                              </p>
                            </div>

                            {/* Detailed Candidate Info Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', background: '#f8fafc', padding: '1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0', fontSize: '0.75rem' }}>
                              <div><span style={{ color: '#94a3b8' }}>Qualification:</span> <span style={{ fontWeight: 700, color: '#334155' }}>{c.experience || c.qualification || '-'}</span></div>
                              <div><span style={{ color: '#94a3b8' }}>Location:</span> <span style={{ fontWeight: 700, color: '#334155' }}>{c.location || 'WNP'}</span></div>
                              <div><span style={{ color: '#94a3b8' }}>Application Source:</span> <span style={{ fontWeight: 700, color: '#334155' }}>{c.source || 'Google Form'}</span></div>
                              <div><span style={{ color: '#94a3b8' }}>Applied Date:</span> <span style={{ fontWeight: 700, color: '#334155' }}>{c.appliedDate || '24/08/2026 10:58:33'}</span></div>
                              {(c.resumeUrl || c.resumeLink) && (
                                <div style={{ gridColumn: '1/-1' }}>
                                  <span style={{ color: '#94a3b8' }}>Resume Document: </span>
                                  <a href={c.resumeUrl || c.resumeLink} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'underline' }}>
                                    View Resume Drive File ↗
                                  </a>
                                </div>
                              )}
                            </div>

                            {/* Timeline Pipeline Tracker */}
                            <div>
                              <h4 style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.85rem' }}>
                                📍 Candidate Recruitment Step-by-Step Tracker
                              </h4>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', position: 'relative', paddingLeft: '1.25rem', borderLeft: '2px solid #e2e8f0' }}>
                                {timelineSteps.map((stp, idx) => {
                                  let dotBg = '#cbd5e1';
                                  let icon = <Clock className="h-3 w-3 text-white" />;

                                  if (stp.status === 'completed') {
                                    dotBg = '#10b981';
                                    icon = <Check className="h-3 w-3 text-white" />;
                                  } else if (stp.status === 'rejected') {
                                    dotBg = '#ef4444';
                                    icon = <X className="h-3 w-3 text-white" />;
                                  } else if (stp.status === 'pending' || stp.status === 'active') {
                                    dotBg = '#8b5cf6';
                                    icon = <Clock className="h-3 w-3 text-white animate-spin" />;
                                  }

                                  return (
                                    <div key={idx} style={{ position: 'relative' }}>
                                      <div style={{ position: 'absolute', left: '-1.85rem', top: '2px', width: 22, height: 22, borderRadius: '50%', background: dotBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {icon}
                                      </div>
                                      <div>
                                        <p style={{ fontSize: '0.78rem', fontWeight: 700, color: stp.status === 'rejected' ? '#ef4444' : stp.status === 'completed' ? '#10b981' : '#0f172a', margin: 0 }}>
                                          {stp.title}
                                        </p>
                                        <p style={{ fontSize: '0.7rem', color: '#64748b', margin: '2px 0 0 0' }}>
                                          {stp.desc}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                          </div>

                          {/* Modal Footer */}
                          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9', background: '#fafafa', borderBottomLeftRadius: '1.25rem', borderBottomRightRadius: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            {!isAccepted && (
                              <button
                                onClick={() => {
                                  handleAcceptFormApplicant(c);
                                  setInspectCandidate(null);
                                }}
                                className="rec-btn-primary"
                                style={{ fontSize: '0.72rem', height: '32px', padding: '0 12px', background: '#16a34a', borderColor: '#15803d' }}
                              >
                                <Check className="h-3.5 w-3.5 mr-1" /> {isDeclined ? 'Re-Accept Candidate' : 'Accept Candidate'}
                              </button>
                            )}
                            {!isDeclined && (
                              <button
                                onClick={() => {
                                  handleDeclineFormApplicant(c);
                                  setInspectCandidate(null);
                                }}
                                className="rec-btn-outline"
                                style={{ fontSize: '0.72rem', height: '32px', padding: '0 12px', color: '#dc2626', borderColor: '#fca5a5', background: '#fef2f2' }}
                              >
                                <X className="h-3.5 w-3.5 mr-1" /> Decline Candidate
                              </button>
                            )}
                            <button
                              onClick={() => setInspectCandidate(null)}
                              className="rec-btn-outline"
                              style={{ fontSize: '0.72rem', height: '32px', padding: '0 12px' }}
                            >
                              Close
                            </button>
                          </div>

                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Simulated Job Listing Web Previews ── */}
      <AnimatePresence>
        {selectedSimulatedChannel && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            onClick={() => setSelectedSimulatedChannel(null)}
            className="rec-modal-overlay"
          >
            <motion.div 
              initial={{ scale: 0.95 }} 
              animate={{ scale: 1 }} 
              exit={{ scale: 0.95 }} 
              onClick={e => e.stopPropagation()}
              className="rec-card" 
              style={{ width: '90%', maxWidth: '600px', padding: '2rem', maxHeight: '85vh', overflowY: 'auto' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Globe className="h-5 w-5 text-indigo-500" />
                  <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>Simulated candidate view: {selectedSimulatedChannel} listing</span>
                </div>
                <button onClick={() => setSelectedSimulatedChannel(null)} className="rec-modal-close">✕</button>
              </div>
              
              {(() => {
                const job = jobs.find(j => j.id === selectedJobId);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontFamily: 'sans-serif' }}>
                    <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{job?.title}</h3>
                      <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', fontWeight: 600 }}>{job?.department} · {job?.location} · {job?.type}</p>
                    </div>

                    <div>
                      <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>About the Role</p>
                      <p style={{ fontSize: '0.75rem', color: '#334155', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{job?.description}</p>
                    </div>

                    <div>
                      <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>Skills Requirements</p>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {(job?.description || '').includes(',') ? (job?.description || '').split(',').map((s: string) => (
                          <span key={s} style={{ fontSize: '0.65rem', padding: '3px 8px', background: '#f5f3ff', color: '#6366f1', borderRadius: '4px', fontWeight: 700 }}>{s.trim()}</span>
                        )) : (
                          <span style={{ fontSize: '0.65rem', padding: '3px 8px', background: '#f5f3ff', color: '#6366f1', borderRadius: '4px', fontWeight: 700 }}>Full Stack React/Node Developer</span>
                        )}
                      </div>
                    </div>

                    <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Interested? Apply directly through our company career portal.</span>
                      <button onClick={() => { setSelectedSimulatedChannel(null); setActiveTab('stage-3'); }} className="rec-btn-primary" style={{ fontSize: '0.7rem' }}>
                        Apply Now
                      </button>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>



        {/* Document & Image Preview Modal (Supports Google Drive, PDF, Images) */}
        <AnimatePresence>
          {previewMediaAttachment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rec-modal-backdrop"
            style={{ zIndex: 99999 }}
            onClick={() => setPreviewMediaAttachment(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="rec-modal"
              style={{ maxWidth: '850px', width: '94vw', padding: '1.25rem', background: '#0f172a', color: '#fff', borderRadius: '1rem' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid #334155' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Eye className="h-4 w-4 text-emerald-400" />
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                    {previewMediaAttachment.name}
                  </h3>
                  {(previewMediaAttachment.driveId || previewMediaAttachment.url?.includes('drive.google.com')) && (
                    <span style={{ fontSize: '0.62rem', background: '#0369a1', color: '#e0f2fe', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                      Google Drive Document
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setPreviewMediaAttachment(null)}
                  style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ padding: '0.75rem 0', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '380px', maxHeight: '72vh', width: '100%' }}>
                {previewMediaAttachment.error ? (
                  <div style={{ textAlign: 'center', color: '#f87171' }}>
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                    <p style={{ fontWeight: 600, fontSize: '0.85rem' }}>⚠️ File unavailable</p>
                  </div>
                ) : (previewMediaAttachment.driveId || (previewMediaAttachment.url && previewMediaAttachment.url.includes('drive.google.com')) || previewMediaAttachment.type === 'pdf') ? (
                  <div style={{ width: '100%', height: '540px', display: 'flex', flexDirection: 'column' }}>
                    <iframe
                      src={previewMediaAttachment.previewUrl || (previewMediaAttachment.driveId ? `https://drive.google.com/file/d/${previewMediaAttachment.driveId}/preview` : previewMediaAttachment.url)}
                      width="100%"
                      height="100%"
                      style={{ border: '1px solid #334155', borderRadius: '0.5rem', background: '#ffffff' }}
                      title={previewMediaAttachment.name}
                      allow="autoplay"
                    />
                  </div>
                ) : (previewMediaAttachment.type === 'image' || previewMediaAttachment.url?.startsWith('data:image')) ? (
                  <img
                    src={previewMediaAttachment.url}
                    alt={previewMediaAttachment.name}
                    style={{ maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain', borderRadius: '0.5rem', border: '1px solid #334155' }}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <iframe
                    src={previewMediaAttachment.url}
                    width="100%"
                    height="500px"
                    style={{ border: '1px solid #334155', borderRadius: '0.5rem', background: '#fff' }}
                    title={previewMediaAttachment.name}
                  />
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #334155', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(previewMediaAttachment.driveId || previewMediaAttachment.url?.includes('drive.google.com') || previewMediaAttachment.url?.startsWith('http')) && (
                    <a
                      href={previewMediaAttachment.originalUrl || (previewMediaAttachment.driveId ? `https://drive.google.com/file/d/${previewMediaAttachment.driveId}/view` : previewMediaAttachment.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rec-btn-primary"
                      style={{ fontSize: '0.75rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#0284c7' }}
                    >
                      <ExternalLink className="h-4 w-4" /> Open in Google Drive ↗
                    </a>
                  )}
                  {previewMediaAttachment.downloadUrl && (
                    <a
                      href={previewMediaAttachment.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="rec-btn-outline"
                      style={{ fontSize: '0.75rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#fff', borderColor: '#475569' }}
                    >
                      <Download className="h-4 w-4" /> Download
                    </a>
                  )}
                </div>
                <button
                  onClick={() => setPreviewMediaAttachment(null)}
                  className="rec-btn-outline"
                  style={{ fontSize: '0.75rem', color: '#fff', borderColor: '#475569' }}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Google Drive Link Document Upload Modal */}
      <AnimatePresence>
        {driveUploadModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rec-modal-backdrop"
            style={{ zIndex: 99999 }}
            onClick={() => setDriveUploadModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="rec-modal"
              style={{ maxWidth: '540px', width: '92vw', padding: '1.5rem', background: '#ffffff', color: '#1e293b', borderRadius: '1.25rem', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '1rem', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(2, 132, 199, 0.3)' }}>
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                      Attach Google Drive Document
                    </h3>
                    <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '2px 0 0 0' }}>
                      Candidate: <strong>{driveUploadModal.candidateName}</strong>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDriveUploadModal(null)}
                  style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}
                >
                  ✕
                </button>
              </div>

              {/* Form Body */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem 0' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Document Name / Type
                  </label>
                  <input
                    type="text"
                    className="rec-search-input"
                    style={{ width: '100%', height: '38px', paddingLeft: '0.75rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.8rem', color: '#0f172a' }}
                    value={driveDocTitleInput}
                    onChange={e => setDriveDocTitleInput(e.target.value)}
                    placeholder="e.g. Govt Identity Proof, Degree Certificate, Experience Letter"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Google Drive Shareable Link *
                  </label>
                  <input
                    type="url"
                    className="rec-search-input"
                    style={{ width: '100%', height: '42px', paddingLeft: '0.75rem', background: '#f8fafc', border: '1.5px solid #0284c7', borderRadius: '8px', fontSize: '0.8rem', color: '#0f172a', fontFamily: 'monospace' }}
                    value={driveLinkInput}
                    onChange={e => setDriveLinkInput(e.target.value)}
                    placeholder="https://drive.google.com/file/d/.../view or https://drive.google.com/open?id=..."
                  />
                  <div style={{ marginTop: '8px', background: '#f0f9ff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #bae6fd', fontSize: '0.7rem', color: '#0369a1', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                    <ExternalLink className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>Please ensure Google Drive link sharing is set to <strong>"Anyone with the link can view"</strong> so recruiters and verifiers can view the document.</span>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                <button
                  type="button"
                  onClick={() => setDriveUploadModal(null)}
                  className="rec-btn-outline"
                  style={{ fontSize: '0.75rem', height: '36px', padding: '0 14px' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingDriveLink || !driveLinkInput.trim()}
                  onClick={handleSaveDriveLink}
                  className="rec-btn-primary"
                  style={{ fontSize: '0.75rem', height: '36px', padding: '0 16px', background: '#0284c7', borderColor: '#0369a1', gap: '6px' }}
                >
                  {savingDriveLink ? 'Attaching...' : 'Attach Google Drive Document'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

        {/* Real-time Candidate Application Modal */}
        <AnimatePresence>
          {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rec-modal-backdrop"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="rec-modal"
              style={{ maxWidth: '520px' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="rec-modal-header" style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)', color: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText className="h-5 w-5" />
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>Submit Real-Time Application</h3>
                </div>
                <button className="rec-modal-close" style={{ color: '#fff' }} onClick={() => setShowAddModal(false)}>✕</button>
              </div>
              <div className="rec-modal-body" style={{ padding: '1.25rem' }}>
                <form onSubmit={handleRealtimeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '4px', display: 'block' }}>Job Opening</label>
                    <select 
                      className="rec-select" 
                      style={{ width: '100%', height: '38px' }}
                      value={modalApplicant.jobId || selectedJobId}
                      onChange={e => setModalApplicant({...modalApplicant, jobId: e.target.value})}
                    >
                      <option value="">-- Select Active Job --</option>
                      {jobs.map(j => (
                        <option key={j.id} value={j.id}>{j.title}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '4px', display: 'block' }}>Applicant Name *</label>
                    <input 
                      type="text" 
                      required
                      className="rec-search-input" 
                      style={{ width: '100%', paddingLeft: '0.75rem', height: '38px' }}
                      value={modalApplicant.name}
                      onChange={e => setModalApplicant({...modalApplicant, name: e.target.value})}
                      placeholder="e.g. Ramesh Kumar"
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '4px', display: 'block' }}>Email Address *</label>
                      <input 
                        type="email" 
                        required
                        className="rec-search-input" 
                        style={{ width: '100%', paddingLeft: '0.75rem', height: '38px' }}
                        value={modalApplicant.email}
                        onChange={e => setModalApplicant({...modalApplicant, email: e.target.value})}
                        placeholder="ramesh@example.com"
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '4px', display: 'block' }}>Phone Number</label>
                      <input 
                        type="text" 
                        className="rec-search-input" 
                        style={{ width: '100%', paddingLeft: '0.75rem', height: '38px' }}
                        value={modalApplicant.phone}
                        onChange={e => setModalApplicant({...modalApplicant, phone: e.target.value})}
                        placeholder="+91 98765 43210"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '4px', display: 'block' }}>Experience</label>
                      <input 
                        type="text" 
                        className="rec-search-input" 
                        style={{ width: '100%', paddingLeft: '0.75rem', height: '38px' }}
                        value={modalApplicant.experience}
                        onChange={e => setModalApplicant({...modalApplicant, experience: e.target.value})}
                        placeholder="e.g. 3.5 Years"
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '4px', display: 'block' }}>Source</label>
                      <select 
                        className="rec-select" 
                        style={{ width: '100%', height: '38px' }}
                        value={modalApplicant.source}
                        onChange={e => setModalApplicant({...modalApplicant, source: e.target.value})}
                      >
                        <option>Google Form</option>
                        <option>LinkedIn</option>
                        <option>Career Page</option>
                        <option>Naukri</option>
                        <option>Wellfound</option>
                        <option>Direct</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '4px', display: 'block' }}>Skills (Comma separated)</label>
                    <input 
                      type="text" 
                      className="rec-search-input" 
                      style={{ width: '100%', paddingLeft: '0.75rem', height: '38px' }}
                      value={modalApplicant.skills}
                      onChange={e => setModalApplicant({...modalApplicant, skills: e.target.value})}
                      placeholder="React, Node.js, TypeScript"
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button type="button" className="rec-btn-outline" onClick={() => setShowAddModal(false)}>Cancel</button>
                    <button type="submit" className="rec-btn-primary" disabled={submittingApp} style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)' }}>
                      {submittingApp ? 'Saving to Database...' : 'Save Real-Time Application'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function StatCard({ icon: Icon, title, value, trend, color }: any) {
  const colorMap: Record<string, { icon: string, bg: string }> = {
    blue:    { icon: 'text-blue-600',    bg: 'bg-blue-50' },
    indigo:  { icon: 'text-indigo-600',  bg: 'bg-indigo-50' },
    purple:  { icon: 'text-purple-600',  bg: 'bg-purple-50' },
    amber:   { icon: 'text-amber-600',   bg: 'bg-amber-50' },
    emerald: { icon: 'text-emerald-600', bg: 'bg-emerald-50' },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <div className="rec-stat-card">
      <div className={cn('rec-stat-icon-wrap', c.bg, c.icon)}>
        <Icon className="h-5 w-5" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="rec-stat-label">{title}</p>
        <p className="rec-stat-value">{value}</p>
      </div>
      <div className="rec-stat-trend text-slate-400">
        {trend}
      </div>
    </div>
  );
}
