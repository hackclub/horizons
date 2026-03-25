import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
// import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import mjml2html from 'mjml';
import { debugLog } from '../utils/debug-log';
// import { SmimeUtil, SmimeCertificate } from './utils/smime.util';
// import * as forge from 'node-forge';
import { PrismaService } from '../prisma.service';
import { JobLockService } from '../job-lock.service';

// TODO: Create swappable Log/Loops Mailer

@Injectable()
export class MailService {
  // private transporter: nodemailer.Transporter;
  private emailTemplate: string;
  private stickerEmailTemplate: string;
  private otpEmailTemplate: string;
  private submissionApprovedEmailTemplate: string;
  private submissionDeniedEmailTemplate: string;
  private giftCodeClaimEmailTemplate: string;
  private orderFulfilledEmailTemplate: string;
  // private smimeUtil: SmimeUtil | null = null;

  private smimeEnabled: boolean = false;

  constructor(
    private prisma: PrismaService,
    private jobLock: JobLockService,
  ) {
    console.log('[Mail DISABLED] MailService initialized - emails will be logged instead of sent');
    
    // const smtpHost = process.env.SMTP_HOST || `email-smtp.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com`;
    // const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    // const smtpUser = process.env.SMTP_USER;
    // const smtpPass = process.env.SMTP_PASS;

    // if (!smtpUser || !smtpPass) {
    //   throw new Error('SMTP credentials must be configured (SMTP_USER and SMTP_PASS)');
    // }

    // this.transporter = nodemailer.createTransport({
    //   host: smtpHost,
    //   port: smtpPort,
    //   secure: false,
    //   auth: {
    //     user: smtpUser,
    //     pass: smtpPass,
    //   },
    // });

    // const mjmlTemplate = fs.readFileSync(
    //   path.join(__dirname, '../../templates/rsvp-success.mjml'),
    //   'utf8',
    // );
    // const { html } = mjml2html(mjmlTemplate);
    // this.emailTemplate = html;

    // try {
    //   const stickerMjmlTemplate = fs.readFileSync(
    //     path.join(__dirname, '../../templates/early-supporter-stickers.mjml'),
    //     'utf8',
    //   );
    //   const stickerHtml = mjml2html(stickerMjmlTemplate);
    //   this.stickerEmailTemplate = stickerHtml.html;
    //   console.log('Loaded sticker email template successfully');
    // } catch (error) {
    //   console.error('Error loading sticker email template:', error);
    //   this.stickerEmailTemplate = this.emailTemplate;
    // }

    // try {
    //   const otpMjmlTemplate = fs.readFileSync(
    //     path.join(__dirname, '../../templates/otp-email.mjml'),
    //     'utf8',
    //   );
    //   const otpHtml = mjml2html(otpMjmlTemplate);
    //   this.otpEmailTemplate = otpHtml.html;
    //   console.log('Loaded OTP email template successfully');
    // } catch (error) {
    //   console.error('Error loading OTP email template:', error);
    //   this.otpEmailTemplate = this.emailTemplate;
    // }

    // try {
    //   const submissionApprovedMjmlTemplate = fs.readFileSync(
    //     path.join(__dirname, '../../templates/submission-approved.mjml'),
    //     'utf8',
    //   );
    //   const submissionApprovedHtml = mjml2html(submissionApprovedMjmlTemplate);
    //   this.submissionApprovedEmailTemplate = submissionApprovedHtml.html;
    //   console.log('Loaded submission approved email template successfully');
    // } catch (error) {
    //   console.error('Error loading submission approved email template:', error);
    //   this.submissionApprovedEmailTemplate = this.emailTemplate;
    // }

    // try {
    //   const submissionDeniedMjmlTemplate = fs.readFileSync(
    //     path.join(__dirname, '../../templates/submission-denied.mjml'),
    //     'utf8',
    //   );
    //   const submissionDeniedHtml = mjml2html(submissionDeniedMjmlTemplate);
    //   this.submissionDeniedEmailTemplate = submissionDeniedHtml.html;
    //   console.log('Loaded submission denied email template successfully');
    // } catch (error) {
    //   console.error('Error loading submission denied email template:', error);
    //   this.submissionDeniedEmailTemplate = this.emailTemplate;
    // }

    // try {
    //   const giftCodeClaimMjmlTemplate = fs.readFileSync(
    //     path.join(__dirname, '../../templates/gift-code-claim.mjml'),
    //     'utf8',
    //   );
    //   const giftCodeClaimHtml = mjml2html(giftCodeClaimMjmlTemplate);
    //   this.giftCodeClaimEmailTemplate = giftCodeClaimHtml.html;
    //   console.log('Loaded gift code claim email template successfully');
    // } catch (error) {
    //   console.error('Error loading gift code claim email template:', error);
    //   this.giftCodeClaimEmailTemplate = this.emailTemplate;
    // }

    // try {
    //   const orderFulfilledMjmlTemplate = fs.readFileSync(
    //     path.join(__dirname, '../../templates/order-fulfilled.mjml'),
    //     'utf8',
    //   );
    //   const orderFulfilledHtml = mjml2html(orderFulfilledMjmlTemplate);
    //   this.orderFulfilledEmailTemplate = orderFulfilledHtml.html;
    //   console.log('Loaded order fulfilled email template successfully');
    // } catch (error) {
    //   console.error('Error loading order fulfilled email template:', error);
    //   this.orderFulfilledEmailTemplate = this.emailTemplate;
    // }

    // this.initializeSmime();
    // this.startEmailScheduler();
  }

  private startEmailScheduler() {
    setInterval(async () => {
      try {
        await this.processScheduledEmails();
      } catch (error) {
        console.error('Error in email scheduler:', error);
      }
    }, 60000);
    console.log('Email scheduler started - checking every minute');
  }

  // private initializeSmime() {
  //   try {
  //     const smimePrivateKeyPath = process.env.SMIME_PRIVATE_KEY_PATH;
  //     const smimeCertPath = process.env.SMIME_CERT_PATH;
  //     const smimeChainPath = process.env.SMIME_CHAIN_PATH;

  //     if (smimePrivateKeyPath && smimeCertPath) {
  //       const certData: SmimeCertificate = {
  //         privateKey: this.loadCertContent(smimePrivateKeyPath),
  //         certificate: this.loadCertContent(smimeCertPath),
  //         chain: smimeChainPath 
  //           ? [this.loadCertContent(smimeChainPath)]
  //           : undefined,
  //       };

  //       this.smimeUtil = new SmimeUtil(certData);
  //       this.smimeEnabled = true;
  //       console.log('S/MIME encryption enabled');
  //     } else {
  //       console.log('S/MIME not configured, sending emails without encryption');
  //     }
  //   } catch (error) {
  //     console.error('Error initializing S/MIME:', error);
  //     console.log('Falling back to unencrypted email');
  //   }
  // }

  // private loadCertContent(pathOrBase64: string): string {
  //   if (fs.existsSync(pathOrBase64)) {
  //     return fs.readFileSync(pathOrBase64, 'utf8');
  //   }
    
  //   try {
  //     return Buffer.from(pathOrBase64, 'base64').toString('utf8');
  //   } catch (error) {
  //     throw new Error(`Invalid certificate content: must be a valid file path or base64 encoded string`);
  //   }
  // }

  // private createMimeMessage(from: string, to: string, subject: string, htmlContent: string): string {
  //   const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
  //   let message = `From: ${from}\r\n`;
  //   message += `To: ${to}\r\n`;
  //   message += `Subject: ${subject}\r\n`;
  //   message += `MIME-Version: 1.0\r\n`;
  //   message += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n`;
  //   message += `Date: ${new Date().toUTCString()}\r\n`;
  //   message += `\r\n`;
  //   message += `This is a multi-part message in MIME format.\r\n`;
  //   message += `\r\n`;
  //   message += `--${boundary}\r\n`;
  //   message += `Content-Type: text/html; charset="UTF-8"\r\n`;
  //   message += `Content-Transfer-Encoding: quoted-printable\r\n`;
  //   message += `\r\n`;
  //   message += htmlContent.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  //   message += `\r\n`;
  //   message += `--${boundary}--\r\n`;
    
  //   return message;
  // }

  async sendRsvpEmail(email: string, rsvpNumber?: number, rafflePosition?: number, stickerToken?: string): Promise<{ success: boolean }> {
    console.log('=== MAIL SERVICE DEBUG ===');
    debugLog(`sendRsvpEmail called with: email=${email}, rsvpNumber=${rsvpNumber}, rafflePosition=${rafflePosition}, stickerToken=${stickerToken ? 'present' : 'null'}`);
    console.log(`rafflePosition type: ${typeof rafflePosition}, value: ${rafflePosition}, isUndefined: ${rafflePosition === undefined}, isNull: ${rafflePosition === null}`);
    
    await this.sendImmediateEmail(email, this.emailTemplate, 'To my dear nibbling...', {
      smimeEnabled: this.smimeEnabled,
      type: 'rsvp-confirmation',
    });

    console.log(`Checking sticker email conditions: rsvpNumber=${!!rsvpNumber}, rsvpNumber<=5000=${rsvpNumber ? rsvpNumber <= 5000 : 'N/A'}`);
    
    if (rsvpNumber && rsvpNumber <= 5000) {
      const scheduledFor = new Date();
      scheduledFor.setMinutes(scheduledFor.getMinutes() + 5);
      
      const stickerUrl = stickerToken 
        ? `https://forms.hackclub.com/midnight-stickers?owl_tkn=${stickerToken}`
        : `https://forms.hackclub.com/midnight-stickers`;
      const referralLink = rafflePosition !== undefined && rafflePosition !== null
        ? `https://midnight.hackclub.com/?code=${rafflePosition}`
        : `https://midnight.hackclub.com/`;
      console.log(`Generated referralLink: ${referralLink} (from rafflePosition: ${rafflePosition})`);
      const emailContent = this.stickerEmailTemplate
        .replace(/{{rsvpNumber}}/g, rsvpNumber.toString())
        .replace(/{{stickerUrl}}/g, stickerUrl)
        .replace(/{{referralLink}}/g, referralLink);

      await this.scheduleEmail(email, emailContent, 'Midnight + Free Framework 12 Laptop', scheduledFor, {
        smimeEnabled: this.smimeEnabled,
        rsvpNumber,
        rafflePosition,
        stickerToken,
        type: 'early-supporter-stickers',
      });
    } else {
      console.log(`Sticker email NOT scheduled. Reason: rsvpNumber=${rsvpNumber || 'MISSING'}, rsvpNumber<=5000=${rsvpNumber ? (rsvpNumber <= 5000 ? 'YES' : `NO (${rsvpNumber})`) : 'N/A'}`);
    }

    return { success: true };
  }

  generateOtpEmailHtml(otp: string): string {
    const now = new Date();
    const dateStr = `${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
    
    return this.otpEmailTemplate
      .replace(/{{otp}}/g, otp)
      .replace(/{{date}}/g, dateStr);
  }

  async sendImmediateEmail(email: string, htmlContent: string, subject: string, metadata: any = {}): Promise<{ success: boolean }> {
    debugLog('[Mail DISABLED] === sendImmediateEmail CALLED ===');
    debugLog('[Mail DISABLED] To:', email);
    console.log('[Mail DISABLED] Subject:', subject);
    console.log('[Mail DISABLED] Metadata type:', metadata.type);
    console.log('[Mail DISABLED] HTML content length:', htmlContent.length);

    const fromEmail = process.env.EMAIL_FROM || 'noreply@midnight.hackclub.com';
    // const from = `Midnight (Hack Club) <${fromEmail}>`;

    const emailJob = await this.prisma.emailJob.create({
      data: {
        recipientEmail: email,
        subject,
        status: 'pending',
        metadata: {
          from: fromEmail,
          ...metadata,
        },
      },
    });

    // Email sending is disabled - just log and mark as sent
    debugLog(`[Mail DISABLED] Would have sent email to: ${email}`);
    debugLog(`[Mail DISABLED] From: ${fromEmail}`);
    console.log(`[Mail DISABLED] Subject: ${subject}`);
    
    await this.prisma.emailJob.update({
      where: { id: emailJob.id },
      data: {
        status: 'sent',
        sentAt: new Date(),
        metadata: {
          from: fromEmail,
          smimeEnabled: false,
          messageId: `disabled-${Date.now()}`,
          note: 'Email sending disabled - logged only',
        },
      },
    });

    return { success: true };

    // try {
    //   if (this.smimeEnabled && this.smimeUtil) {
    //     const htmlBoundary = `----=_Part_HTML_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    //     const signedBoundary = `----=_Part_Signed_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        
    //     let htmlPart = `Content-Type: text/html; charset="UTF-8"\r\n`;
    //     htmlPart += `Content-Transfer-Encoding: 7bit\r\n`;
    //     htmlPart += `\r\n`;
    //     htmlPart += htmlContent.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
        
    //     const signature = this.smimeUtil.createDetachedSignature(htmlPart);
    //     const base64Lines = signature.match(/.{1,76}/g) || [];
        
    //     let message = `From: ${from}\r\n`;
    //     message += `To: ${email}\r\n`;
    //     message += `Subject: ${subject}\r\n`;
    //     message += `MIME-Version: 1.0\r\n`;
    //     message += `Content-Type: multipart/signed; protocol="application/pkcs7-signature"; micalg="sha-256"; boundary="${signedBoundary}"\r\n`;
    //     message += `\r\n`;
    //     message += `This is a cryptographically signed message in MIME format.\r\n`;
    //     message += `\r\n`;
    //     message += `--${signedBoundary}\r\n`;
    //     message += htmlPart;
    //     message += `\r\n`;
    //     message += `--${signedBoundary}\r\n`;
    //     message += `Content-Type: application/pkcs7-signature; name="smime.p7s"\r\n`;
    //     message += `Content-Transfer-Encoding: base64\r\n`;
    //     message += `Content-Disposition: attachment; filename="smime.p7s"\r\n`;
    //     message += `\r\n`;
    //     message += base64Lines.join('\r\n');
    //     message += `\r\n`;
    //     message += `--${signedBoundary}--\r\n`;

    //     const mailResult = await this.transporter.sendMail({
    //       envelope: {
    //         from: from,
    //         to: email,
    //       },
    //       raw: message,
    //     });

    //     console.log('Successfully sent S/MIME signed email to:', email);
        
    //     await this.prisma.emailJob.update({
    //       where: { id: emailJob.id },
    //       data: {
    //         status: 'sent',
    //         sentAt: new Date(),
    //         metadata: {
    //           from: fromEmail,
    //           smimeEnabled: this.smimeEnabled,
    //           messageId: mailResult.messageId,
    //         },
    //       },
    //     });
    //   } else {
    //     const info = await this.transporter.sendMail({
    //       from: from,
    //       to: email,
    //       subject: subject,
    //       html: htmlContent,
    //     });

    //     console.log('Successfully sent email via SMTP:', info.messageId);
        
    //     await this.prisma.emailJob.update({
    //       where: { id: emailJob.id },
    //       data: {
    //         status: 'sent',
    //         sentAt: new Date(),
    //         metadata: {
    //           from: fromEmail,
    //           smimeEnabled: this.smimeEnabled,
    //           messageId: info.messageId,
    //         },
    //       },
    //     });
    //   }

    //   return { success: true };
    // } catch (error) {
    //   console.error('Error sending email:', error);
      
    //   await this.prisma.emailJob.update({
    //     where: { id: emailJob.id },
    //     data: {
    //       status: 'failed',
    //       failedAt: new Date(),
    //       errorMessage: error instanceof Error ? error.message : 'Unknown error',
    //     },
    //   });

    //   if (error instanceof HttpException) {
    //     throw error;
    //   }
    //   throw new HttpException(
    //     'Failed to send email via SMTP',
    //     HttpStatus.INTERNAL_SERVER_ERROR,
    //   );
    // }
  }

  async scheduleEmail(email: string, htmlContent: string, subject: string, scheduledFor: Date, metadata: any = {}): Promise<{ success: boolean; jobId: string }> {
    const fromEmail = process.env.EMAIL_FROM || 'noreply@midnight.hackclub.com';
    
    const emailJob = await this.prisma.emailJob.create({
      data: {
        recipientEmail: email,
        subject,
        status: 'scheduled',
        scheduledFor,
        metadata: {
          from: fromEmail,
          htmlContent,
          ...metadata,
        },
      },
    });

    debugLog(`Scheduled email for ${email} at ${scheduledFor.toISOString()}, job ID: ${emailJob.id}`);

    return { success: true, jobId: emailJob.id };
  }

  async processScheduledEmails(): Promise<void> {
    const availableJobs = await this.jobLock.getAvailableJobs(50);
    
    console.log(`[Mail DISABLED] [${this.jobLock.getWorkerId()}] Found ${availableJobs.length} available email job(s)`);

    let processed = 0;
    for (const job of availableJobs) {
      const lockAcquired = await this.jobLock.acquireJobLock(job.id);
      
      if (!lockAcquired) {
        console.log(`[Mail DISABLED] [${this.jobLock.getWorkerId()}] Failed to acquire lock for job ${job.id}, skipping`);
        continue;
      }

      processed++;
      console.log(`[Mail DISABLED] [${this.jobLock.getWorkerId()}] Processing job ${job.id} (${processed}/${availableJobs.length})`);

      try {
        await this.jobLock.markJobProcessing(job.id);

        const metadata = job.metadata as any;
        // const htmlContent = metadata.htmlContent || this.emailTemplate;
        
        const fromEmail = process.env.EMAIL_FROM || 'noreply@midnight.hackclub.com';
        // const from = `Midnight (Hack Club) <${fromEmail}>`;

        // Email sending is disabled - just log and mark as sent
        debugLog(`[Mail DISABLED] Would have sent scheduled email to: ${job.recipientEmail}`);
        debugLog(`[Mail DISABLED] From: ${fromEmail}`);
        console.log(`[Mail DISABLED] Subject: ${job.subject}`);

        // if (this.smimeEnabled && this.smimeUtil) {
        //   let htmlPart = `Content-Type: text/html; charset="UTF-8"\r\n`;
        //   htmlPart += `Content-Transfer-Encoding: 7bit\r\n`;
        //   htmlPart += `\r\n`;
        //   htmlPart += htmlContent.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
          
        //   const signature = this.smimeUtil.createDetachedSignature(htmlPart);
        //   const base64Lines = signature.match(/.{1,76}/g) || [];
          
        //   const signedBoundary = `----=_Part_Signed_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          
        //   let message = `From: ${from}\r\n`;
        //   message += `To: ${job.recipientEmail}\r\n`;
        //   message += `Subject: ${job.subject}\r\n`;
        //   message += `MIME-Version: 1.0\r\n`;
        //   message += `Content-Type: multipart/signed; protocol="application/pkcs7-signature"; micalg="sha-256"; boundary="${signedBoundary}"\r\n`;
        //   message += `\r\n`;
        //   message += `This is a cryptographically signed message in MIME format.\r\n`;
        //   message += `\r\n`;
        //   message += `--${signedBoundary}\r\n`;
        //   message += htmlPart;
        //   message += `\r\n`;
        //   message += `--${signedBoundary}\r\n`;
        //   message += `Content-Type: application/pkcs7-signature; name="smime.p7s"\r\n`;
        //   message += `Content-Transfer-Encoding: base64\r\n`;
        //   message += `Content-Disposition: attachment; filename="smime.p7s"\r\n`;
        //   message += `\r\n`;
        //   message += base64Lines.join('\r\n');
        //   message += `\r\n`;
        //   message += `--${signedBoundary}--\r\n`;

        //   await this.transporter.sendMail({
        //     envelope: {
        //       from: from,
        //       to: job.recipientEmail,
        //     },
        //     raw: message,
        //   });
        // } else {
        //   await this.transporter.sendMail({
        //     from: from,
        //     to: job.recipientEmail,
        //     subject: job.subject,
        //     html: htmlContent,
        //   });
        // }

        await this.jobLock.markJobSent(job.id);
        await this.jobLock.releaseJobLock(job.id);

        debugLog(`[Mail DISABLED] [${this.jobLock.getWorkerId()}] Logged (not sent) email to: ${job.recipientEmail}`);
      } catch (error) {
        console.error(`[Mail DISABLED] [${this.jobLock.getWorkerId()}] Error processing email job ${job.id}:`, error);
        
        await this.jobLock.markJobFailed(
          job.id,
          error instanceof Error ? error.message : 'Unknown error'
        );
        await this.jobLock.releaseJobLock(job.id);
      }
    }

    console.log(`[Mail DISABLED] [${this.jobLock.getWorkerId()}] Processed ${processed} email job(s)`);
  }

  async sendSubmissionReviewEmail(
    email: string,
    data: {
      projectTitle: string;
      projectId: number;
      approved: boolean;
      approvedHours?: number;
      feedback?: string;
    },
  ): Promise<{ success: boolean }> {
    const now = new Date();
    const dateStr = `${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;

    const subject = data.approved
      ? `Your project "${data.projectTitle}" has been approved!`
      : `Your project "${data.projectTitle}" needs attention`;

    const projectUrl = `${process.env.FRONTEND_URL || 'https://midnight.hackclub.com'}/app/projects/${data.projectId}`;

    // Use the appropriate template based on approval status
    let emailTemplate = data.approved
      ? this.submissionApprovedEmailTemplate
      : this.submissionDeniedEmailTemplate;

    let emailContent = emailTemplate
      .replace(/\{\{date\}\}/g, dateStr)
      .replace(/\{\{projectTitle\}\}/g, data.projectTitle)
      .replace(/\{\{projectId\}\}/g, data.projectId.toString())
      .replace(/\{\{projectUrl\}\}/g, projectUrl);

    // For approved emails, replace approved hours
    if (data.approved && data.approvedHours !== undefined) {
      emailContent = emailContent.replace(/\{\{approvedHours\}\}/g, data.approvedHours.toString());
    }

    // Handle feedback section (only in approved template is it optional)
    if (data.feedback) {
      emailContent = emailContent.replace(/\{\{feedback\}\}/g, data.feedback);
      // Remove conditional tags
      emailContent = emailContent.replace(/\{\{#if feedback\}\}/g, '');
      emailContent = emailContent.replace(/\{\{\/if\}\}/g, '');
    } else {
      // Remove the entire feedback section if no feedback
      emailContent = emailContent.replace(/\{\{#if feedback\}\}[\s\S]*?\{\{\/if\}\}/g, '');
    }

    await this.sendImmediateEmail(email, emailContent, subject, {
      smimeEnabled: this.smimeEnabled,
      type: 'submission-review',
      projectId: data.projectId,
      approved: data.approved,
    });

    debugLog(`Sent submission review email to: ${email} (Project: ${data.projectTitle}, Approved: ${data.approved})`);

    return { success: true };
  }

  async sendGiftCodeEmail(
    email: string,
    data: {
      firstName: string;
      itemDescription: string;
      imageUrl: string;
      claimUrl: string;
    },
  ): Promise<{ success: boolean }> {
    const now = new Date();
    const dateStr = `${now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;

    const emailContent = this.giftCodeClaimEmailTemplate
      .replace(/\{\{date\}\}/g, dateStr)
      .replace(/\{\{firstName\}\}/g, data.firstName)
      .replace(/\{\{itemDescription\}\}/g, data.itemDescription)
      .replace(/\{\{imageUrl\}\}/g, data.imageUrl)
      .replace(/\{\{claimUrl\}\}/g, data.claimUrl);

    await this.sendImmediateEmail(email, emailContent, 'Claim your stickers here!', {
      smimeEnabled: this.smimeEnabled,
      type: 'gift-code-claim',
    });

    debugLog(`Sent gift code claim email to: ${email}`);

    return { success: true };
  }

  async sendOrderFulfilledEmail(
    email: string,
    data: {
      transactionId: number;
      itemName: string;
      itemDescription: string;
    },
  ): Promise<{ success: boolean }> {
    const now = new Date();
    const dateStr = `${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;

    const ordersUrl = `${process.env.FRONTEND_URL || 'https://midnight.hackclub.com'}/app/shop`;

    const emailContent = this.orderFulfilledEmailTemplate
      .replace(/\{\{date\}\}/g, dateStr)
      .replace(/\{\{transactionId\}\}/g, data.transactionId.toString())
      .replace(/\{\{itemName\}\}/g, data.itemName)
      .replace(/\{\{itemDescription\}\}/g, data.itemDescription)
      .replace(/\{\{ordersUrl\}\}/g, ordersUrl);

    await this.sendImmediateEmail(email, emailContent, `Your order has been fulfilled!`, {
      smimeEnabled: this.smimeEnabled,
      type: 'order-fulfilled',
      transactionId: data.transactionId,
    });

    debugLog(`Sent order fulfilled email to: ${email} (Transaction: ${data.transactionId})`);

    return { success: true };
  }

  getHello(): string {
    return 'Hello World!';
  }
}
