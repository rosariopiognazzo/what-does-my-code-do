import { sendEmail } from './email-adapter';

export function notifyAssignment(recipient: string) {
  return sendEmail(recipient, 'Task assigned');
}
