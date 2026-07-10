import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer/index.js';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import type { MailConfig } from './mail-config.service.js';
import * as mailConfigService from './mail-config.service.js';
import { ValidationError } from '../utils/errors.js';

export interface SentMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const testOutbox: SentMail[] = [];
const MAIL_TIMEOUT_MS = 10_000;

type MailTransporter = Transporter<SMTPTransport.SentMessageInfo, SMTPTransport.Options>;

let cachedTransporter: MailTransporter | null = null;
let cachedConfigKey = '';

function buildConfigKey(config: MailConfig): string {
  return JSON.stringify({
    host: config.host,
    port: config.port,
    secure: config.secure,
    username: config.username,
    password: config.password,
  });
}

function createTransport(config: MailConfig): MailTransporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    connectionTimeout: MAIL_TIMEOUT_MS,
    greetingTimeout: MAIL_TIMEOUT_MS,
    socketTimeout: MAIL_TIMEOUT_MS,
    ...(config.username && config.password
      ? { auth: { user: config.username, pass: config.password } }
      : {}),
  });
}

function getTransporter(config: MailConfig): MailTransporter {
  const key = buildConfigKey(config);
  if (cachedTransporter && cachedConfigKey === key) return cachedTransporter;

  cachedTransporter?.close();
  cachedTransporter = createTransport(config);
  cachedConfigKey = key;
  return cachedTransporter;
}

function buildMailOptions(config: MailConfig, message: SentMail): Mail.Options {
  return {
    from: config.fromName
      ? { name: config.fromName, address: config.fromAddress }
      : config.fromAddress,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  };
}

export async function sendMail(message: SentMail): Promise<void> {
  const config = await mailConfigService.getFullMailConfig();
  if (!config.enabled) {
    throw new ValidationError('邮件服务尚未启用');
  }

  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    testOutbox.push(message);
    return;
  }

  const transporter = getTransporter(config);
  await transporter.sendMail(buildMailOptions(config, message));
}

export async function verifyMailConfig(): Promise<void> {
  const config = await mailConfigService.getFullMailConfig();
  if (!config.enabled) {
    throw new ValidationError('邮件服务尚未启用');
  }

  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;

  const transporter = getTransporter(config);
  await transporter.verify();
}

export async function testMailConfig(): Promise<{ success: boolean; message: string }> {
  try {
    await verifyMailConfig();
    return { success: true, message: 'SMTP 连接成功' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SMTP 连接失败';
    return { success: false, message };
  }
}

export function getTestOutbox(): SentMail[] {
  return testOutbox;
}

export function clearTestOutbox(): void {
  testOutbox.length = 0;
}
