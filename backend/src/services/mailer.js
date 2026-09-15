import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter;

export function mailConfigured() {
  return Boolean(env.smtpHost && env.smtpUser && env.smtpPass);
}

function fromAddress() {
  if (env.smtpFrom) return env.smtpFrom;
  if (env.smtpUser) return `ShareHouse <${env.smtpUser}>`;
  return 'ShareHouse <noreply@sharehouse.app>';
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass,
      },
    });
  }
  return transporter;
}

export async function sendMail({ to, subject, text, html }) {
  if (!mailConfigured()) {
    const err = new Error(
      'Email is not configured. Set SMTP_PASS on the API host (Gmail app password). Optional: SMTP_USER, SMTP_HOST, SMTP_FROM.'
    );
    err.status = 503;
    throw err;
  }
  await getTransporter().sendMail({
    from: fromAddress(),
    to,
    subject,
    text,
    html,
  });
}
