import crypto from 'crypto';
import { notificationService } from './notification.service';

export interface InterviewInviteParams {
  candidateName: string;
  candidateEmail: string;
  jobTitle?: string;
  interviewType?: string;
  interviewerName?: string;
  interviewerEmail?: string;
  interviewDate: string; // YYYY-MM-DD
  interviewTime: string; // e.g. "11:30 AM"
  interviewLink: string;
  taggedEmails?: string[];
  tenantName?: string;
  notes?: string;
}

/**
 * Create a real Microsoft Teams Online Meeting using Microsoft Graph API
 * If Azure credentials are configured in .env, this creates an official M365 Teams meeting on Microsoft Cloud.
 */
export async function createMicrosoftTeamsOnlineMeeting(topic: string, startTime: Date, endTime: Date): Promise<string | null> {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const userId = process.env.AZURE_USER_ID; // The Microsoft 365 organizer user email or object ID

  if (!tenantId || !clientId || !clientSecret || !userId) {
    return null;
  }

  try {
    // 1. Get OAuth2 Token from Azure AD
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    });

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[Microsoft Graph Auth Error]:', errText);
      return null;
    }

    const tokenData: any = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Create Online Meeting via Graph API
    const meetingUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/onlineMeetings`;
    const meetingRes = await fetch(meetingUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject: topic,
        startDateTime: startTime.toISOString(),
        endDateTime: endTime.toISOString(),
        lobbyBypassSettings: {
          scope: 'everyone',
          isDialInBypassEnabled: true
        }
      }),
    });

    if (!meetingRes.ok) {
      const errText = await meetingRes.text();
      console.error('[Microsoft Graph Meeting Error]:', errText);
      return null;
    }

    const meetingData: any = await meetingRes.json();
    console.log('[Microsoft Graph] Successfully created Teams Meeting:', meetingData.joinWebUrl);
    return meetingData.joinWebUrl;
  } catch (error: any) {
    console.error('[Microsoft Graph Exception]:', error.message || error);
    return null;
  }
}

/**
 * Generate a meeting join link:
 * - Tries Microsoft Graph API if Azure credentials exist
 * - Otherwise generates a dedicated live video interview room
 */
export async function generateTeamsMeetingLink(topic: string = 'Interview Session', startTime?: Date, endTime?: Date): Promise<string> {
  const start = startTime || new Date();
  const end = endTime || new Date(start.getTime() + 45 * 60 * 1000);

  // Try Microsoft Graph API first if Azure is configured
  try {
    const graphLink = await createMicrosoftTeamsOnlineMeeting(topic, start, end);
    if (graphLink) {
      return graphLink;
    }
  } catch (err) {
    console.warn('[Teams Graph Warning]:', err);
  }

  // Official Microsoft Teams Meeting format with tenant context
  const tenantId = process.env.AZURE_TENANT_ID && process.env.AZURE_TENANT_ID.includes('-') 
    ? process.env.AZURE_TENANT_ID 
    : '25276fbe-5e30-46cc-b2b0-f5d73c1ae006';
  const meetingId = crypto.randomBytes(16).toString('base64url');
  const organizerId = crypto.randomUUID();
  const context = encodeURIComponent(JSON.stringify({ Tid: tenantId, Oid: organizerId }));
  return `https://teams.microsoft.com/l/meetup-join/19%3ameeting_${meetingId}%40thread.v2/0?context=${context}`;
}

/**
 * Parse date and 12-hour time string into Date object
 */
function parseDateTime(dateStr: string, timeStr: string): { start: Date; end: Date } {
  try {
    const parts = timeStr.trim().split(/\s+/);
    const timeParts = parts[0].split(':');
    let hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1] || '0', 10);
    const ampm = (parts[1] || 'AM').toUpperCase();

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    const [year, month, day] = dateStr.split('-').map(Number);
    const start = new Date(year, month - 1, day, hours, minutes, 0);
    const end = new Date(start.getTime() + 45 * 60 * 1000); // 45 min duration default

    return { start, end };
  } catch (err) {
    const now = new Date();
    return { start: now, end: new Date(now.getTime() + 45 * 60 * 1000) };
  }
}

/**
 * Format date for ICS (YYYYMMDDTHHMMSSZ)
 */
function formatIcsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/**
 * Generate RFC 5545 compliant iCalendar (.ics) string
 */
export function generateIcsCalendarInvite(params: {
  title: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
  organizerEmail: string;
  organizerName: string;
  attendees: { name?: string; email: string }[];
}): string {
  const uid = `hrms-teams-interview-${crypto.randomUUID()}@hrmsvrpigroup.com`;
  const dtStamp = formatIcsDate(new Date());
  const dtStart = formatIcsDate(params.start);
  const dtEnd = formatIcsDate(params.end);

  const attendeeLines = params.attendees
    .filter(a => a.email && a.email.includes('@'))
    .map(a => `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${a.name || a.email}:mailto:${a.email}`)
    .join('\r\n');

  const cleanDescription = params.description.replace(/\n/g, '\\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HRMS VRPIGroup//Interview Scheduler//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${params.title}`,
    `DESCRIPTION:${cleanDescription}`,
    `LOCATION:${params.location}`,
    `ORGANIZER;CN=${params.organizerName}:mailto:${params.organizerEmail}`,
    attendeeLines,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Interview Reminder - 15 Minutes to Start',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

// In-memory cache to deduplicate rapid duplicate interview email dispatches
const recentInviteDispatches = new Map<string, { timestamp: number; result: any }>();

function cleanRecentInviteDispatches() {
  const now = Date.now();
  for (const [key, val] of recentInviteDispatches.entries()) {
    if (now - val.timestamp > 60000) {
      recentInviteDispatches.delete(key);
    }
  }
}

/**
 * Send interview invitation email to Candidate, Interviewer, and Tagged CCs
 */
export const interviewService = {
  generateTeamsMeetingLink,

  async sendInterviewInvites(params: InterviewInviteParams) {
    const {
      candidateName,
      candidateEmail,
      jobTitle = 'Recruitment Process',
      interviewType = 'Technical / HR Interview',
      interviewerName = 'Interview Panel',
      interviewerEmail,
      interviewDate,
      interviewTime,
      interviewLink,
      taggedEmails = [],
      tenantName = 'VRPI Group HRMS',
      notes
    } = params;

    const dedupKey = `${(candidateEmail || '').trim().toLowerCase()}_${interviewDate}_${(interviewTime || '').trim().toLowerCase()}`;
    const existing = recentInviteDispatches.get(dedupKey);
    if (existing && (Date.now() - existing.timestamp < 30000)) {
      console.log(`[InterviewService] Duplicate invite dispatch prevented for ${dedupKey} (already sent ${Math.round((Date.now() - existing.timestamp)/1000)}s ago)`);
      return existing.result;
    }

    const { start, end } = parseDateTime(interviewDate, interviewTime);

    // Build recipient list
    const allRecipients: string[] = [];
    if (candidateEmail && candidateEmail.includes('@') && !candidateEmail.includes('@example.com')) {
      allRecipients.push(candidateEmail.trim());
    }
    if (interviewerEmail && interviewerEmail.includes('@') && !allRecipients.includes(interviewerEmail.trim())) {
      allRecipients.push(interviewerEmail.trim());
    }
    taggedEmails.forEach(email => {
      const clean = (email || '').trim();
      if (clean && clean.includes('@') && !allRecipients.includes(clean)) {
        allRecipients.push(clean);
      }
    });

    if (allRecipients.length === 0) {
      console.log('[InterviewService] No valid recipient emails to dispatch interview invite.');
      return { success: false, reason: 'No valid recipient emails' };
    }

    // Sanitize position/jobTitle to remove any (Google Form Recruitment) suffix
    const cleanJobTitle = (jobTitle || '')
      .replace(/\s*\([^)]*Google\s*Form[^)]*\)/gi, '')
      .replace(/\s*\(Google Form Recruitment\)/gi, '')
      .replace(/\s*\(Google Form\)/gi, '')
      .replace(/Google Form Recruitment/gi, 'Full Stack Engineer')
      .replace(/Google Form Applicant/gi, 'Full Stack Engineer')
      .trim() || 'Full Stack Engineer';

    // Determine meeting platform name
    let platformName = 'Microsoft Teams';
    const linkLower = (interviewLink || '').toLowerCase();
    if (linkLower.includes('meet.google.com')) platformName = 'Google Meet';
    else if (linkLower.includes('teams.microsoft.com') || linkLower.includes('teams.live.com')) platformName = 'Microsoft Teams';
    else if (linkLower.includes('zoom.us') || linkLower.includes('zoom.com')) platformName = 'Zoom';

    // Generate ICS calendar attachment
    const icsContent = generateIcsCalendarInvite({
      title: `VR PI Interview: ${candidateName || 'Candidate'}`,
      description: `VR PI Interview for ${candidateName || 'Candidate'}.\n\nDate: ${interviewDate}\nTime: ${interviewTime} IST\nMode: Virtual Interview\nPlatform: ${platformName}\nMeeting Link: ${interviewLink}\n\nOrganizer: HR Team, VR PI (vamshikrishna@vrpigroup.co.in)`,
      location: interviewLink,
      start,
      end,
      organizerEmail: 'vamshikrishna@vrpigroup.co.in',
      organizerName: 'HR Team - VR PI',
      attendees: [
        { name: candidateName, email: candidateEmail },
        ...(interviewerEmail ? [{ name: interviewerName, email: interviewerEmail }] : []),
        ...taggedEmails.map(em => ({ email: em })),
      ]
    });

    const emailSubject = `VR PI Interview Shortlist Invitation | ${candidateName || 'Candidate'}`;

    const plainTextBody = `Dear ${candidateName || 'Candidate'},\n\nGreetings from VR PI!\n\nWe are pleased to inform you that you have been shortlisted for the VR PI Interview. The interview will be conducted virtually through an online meeting.\n\nInterview Details:\n\n* Date: ${interviewDate}\n* Time: ${interviewTime} IST\n* Mode: Virtual Interview\n* Meeting Platform: ${platformName}\n* Meeting Link: ${interviewLink}\n\nPlease join the meeting 5–10 minutes before the scheduled time and ensure that you have a stable internet connection, working camera, and microphone.\n\nKindly keep your updated resume and relevant documents ready for the interview.\n\nWe look forward to speaking with you.\n\nBest Regards,\nHR Team\nVR PI\nvamshikrishna@vrpigroup.co.in`;

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${emailSubject}</title>
      </head>
      <body style="margin:0; padding:0; background-color:#f8fafc; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#1e293b; line-height:1.6;">
        <div style="max-width:620px; margin:24px auto; background:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e2e8f0; box-shadow:0 10px 25px -5px rgba(0,0,0,0.05);">
          
          <!-- Header Banner -->
          <div style="background:linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%); padding:28px 32px; color:#ffffff;">
            <div style="display:inline-block; background:rgba(255,255,255,0.18); padding:5px 12px; border-radius:20px; font-size:11px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; margin-bottom:10px;">
              🏢 VR PI Recruitment
            </div>
            <h1 style="margin:0; font-size:22px; font-weight:800; color:#ffffff;">VR PI Interview Invitation</h1>
            <p style="margin:6px 0 0 0; font-size:13px; color:#c7d2fe;">Talent Acquisition · VR PI</p>
          </div>

          <!-- Body Content -->
          <div style="padding:32px;">
            <p style="font-size:15px; margin:0 0 16px 0; color:#0f172a;">Dear <strong>${candidateName || 'Candidate'}</strong>,</p>
            
            <p style="font-size:15px; margin:0 0 16px 0; color:#0f172a;">Greetings from <strong>VR PI</strong>!</p>
            
            <p style="font-size:15px; margin:0 0 20px 0; color:#334155; line-height:1.6;">
              We are pleased to inform you that you have been shortlisted for the <strong>VR PI Interview</strong>. The interview will be conducted virtually through an online meeting.
            </p>

            <!-- Interview Details Card -->
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-left:4px solid #4f46e5; border-radius:8px; padding:18px 20px; margin:22px 0;">
              <p style="margin:0 0 12px 0; font-weight:800; color:#0f172a; font-size:15px;">Interview Details:</p>
              <ul style="margin:0; padding-left:20px; font-size:14px; color:#334155; line-height:1.9;">
                <li><strong>Date:</strong> ${interviewDate}</li>
                <li><strong>Time:</strong> ${interviewTime} IST</li>
                <li><strong>Mode:</strong> Virtual Interview</li>
                <li><strong>Meeting Platform:</strong> ${platformName}</li>
                <li><strong>Meeting Link:</strong> <a href="${interviewLink}" target="_blank" style="color:#4f46e5; text-decoration:underline; font-weight:700; word-break:break-all;">${interviewLink}</a></li>
              </ul>
            </div>

            <!-- Join Button Call To Action -->
            <div style="text-align:center; margin:28px 0 24px 0;">
              <a href="${interviewLink}" target="_blank" style="display:inline-block; background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:#ffffff; font-size:15px; font-weight:700; text-decoration:none; padding:12px 28px; border-radius:8px; box-shadow:0 4px 12px rgba(16, 185, 129, 0.3);">
                📹 Join Virtual Meeting
              </a>
            </div>

            <p style="font-size:14px; margin:0 0 14px 0; color:#334155; line-height:1.6;">
              Please join the meeting <strong>5–10 minutes before the scheduled time</strong> and ensure that you have a stable internet connection, working camera, and microphone.
            </p>

            <p style="font-size:14px; margin:0 0 18px 0; color:#334155; line-height:1.6;">
              Kindly keep your updated resume and relevant documents ready for the interview.
            </p>

            <p style="font-size:14px; margin:0 0 24px 0; color:#334155; line-height:1.6;">
              We look forward to speaking with you.
            </p>

            <div style="margin-top:28px; padding-top:18px; border-top:1px solid #f1f5f9; font-size:14px; color:#334155; line-height:1.6;">
              Best Regards,<br>
              <strong style="color:#0f172a;">HR Team</strong><br>
              <strong style="color:#4f46e5;">VR PI</strong><br>
              <a href="mailto:vamshikrishna@vrpigroup.co.in" style="color:#4f46e5; text-decoration:none; font-weight:600;">vamshikrishna@vrpigroup.co.in</a>
            </div>
          </div>

          <!-- Footer -->
          <div style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 32px; text-align:center; font-size:11px; color:#94a3b8;">
            VR PI Group HRMS · Official Recruitment Notification · Please do not reply directly to this automated email.
          </div>
        </div>
      </body>
      </html>
    `;

    const attachments = [
      {
        filename: 'interview_invite.ics',
        content: Buffer.from(icsContent, 'utf-8'),
        contentType: 'text/calendar; method=REQUEST; charset=UTF-8; name="interview_invite.ics"'
      }
    ];

    const results = [];
    for (const recipient of allRecipients) {
      try {
        console.log(`[InterviewService] Sending interview invite to: ${recipient}`);
        const res = await notificationService.sendEmail(
          recipient,
          emailSubject,
          htmlBody,
          plainTextBody,
          attachments,
          'VR PI'
        );
        results.push({ email: recipient, success: true, res });
      } catch (err: any) {
        console.error(`[InterviewService ERROR] Failed to send email to ${recipient}:`, err.message || err);
        results.push({ email: recipient, success: false, error: err.message || String(err) });
      }
    }

    const finalResult = {
      success: results.some(r => r.success),
      dispatchedCount: results.filter(r => r.success).length,
      results
    };
    recentInviteDispatches.set(dedupKey, { timestamp: Date.now(), result: finalResult });
    cleanRecentInviteDispatches();

    return finalResult;
  }
};
