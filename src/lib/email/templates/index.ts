/**
 * Email Templates Index
 *
 * Central export for all email templates.
 */

export { BaseLayout, Button, Heading, Paragraph, InfoBox, styles } from './base-layout';
export type { BaseLayoutProps, ButtonProps, HeadingProps, ParagraphProps, InfoBoxProps } from './base-layout';

export { WelcomeEmail } from './welcome';
export { PasswordResetEmail } from './password-reset';
export { NewInvoiceEmail } from './new-invoice';
export { VoteInvitationEmail } from './vote-invitation';
export { TenantAdminInvitationEmail } from './tenant-admin-invitation';
