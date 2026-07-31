export function sendEmail(recipient: string, subject: string): string {
  return `${recipient}:${subject}`;
}
