/**
 * Base Email Layout
 *
 * React Email base layout component providing consistent styling
 * across all WindparkManager emails.
 */

import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Hr,
} from '@react-email/components';
import * as React from 'react';

export interface BaseLayoutProps {
  /** Email preview text (shown in email client list) */
  preview: string;
  /** Tenant/company name */
  tenantName: string;
  /** Application name for header/footer branding (defaults to tenantName) */
  appName?: string;
  /** Optional logo URL */
  tenantLogoUrl?: string;
  /** Primary brand color (default: #335E99) */
  primaryColor?: string;
  /** Current year for copyright */
  currentYear?: number;
  /** Unsubscribe URL (optional) */
  unsubscribeUrl?: string;
  /** Email content */
  children: React.ReactNode;
}

/**
 * Base email layout with header and footer
 */
export function BaseLayout({
  preview,
  tenantName,
  appName,
  tenantLogoUrl,
  primaryColor = '#335E99',
  currentYear = new Date().getFullYear(),
  unsubscribeUrl,
  children,
}: BaseLayoutProps) {
  // Use appName for header/footer branding, fall back to tenantName
  const brandName = appName || tenantName;

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          {/* Header */}
          <Section style={styles.header}>
            {tenantLogoUrl ? (
              <Img
                src={tenantLogoUrl}
                alt={brandName}
                width="180"
                height="50"
                style={styles.logo}
              />
            ) : (
              <Text style={{ ...styles.logoText, color: primaryColor }}>
                {brandName}
              </Text>
            )}
          </Section>

          {/* Divider */}
          <Hr style={{ ...styles.divider, borderColor: primaryColor }} />

          {/* Main Content */}
          <Section style={styles.content}>{children}</Section>

          {/* Footer */}
          <Hr style={styles.footerDivider} />
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              Diese E-Mail wurde automatisch von {brandName} versendet.
            </Text>
            <Text style={styles.footerText}>
              &copy; {currentYear} {brandName}. Alle Rechte vorbehalten.
            </Text>
            {unsubscribeUrl && (
              <Text style={styles.unsubscribe}>
                <Link href={unsubscribeUrl} style={styles.unsubscribeLink}>
                  E-Mail-Benachrichtigungen anpassen
                </Link>
              </Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/**
 * Common button component for CTAs
 */
export interface ButtonProps {
  href: string;
  children: React.ReactNode;
  color?: string;
}

export function Button({ href, children, color = '#335E99' }: ButtonProps) {
  return (
    <Link href={href} style={{ ...styles.button, backgroundColor: color }}>
      {children}
    </Link>
  );
}

/**
 * Heading component
 */
export interface HeadingProps {
  children: React.ReactNode;
  color?: string;
}

export function Heading({ children, color = '#1f2937' }: HeadingProps) {
  return <Text style={{ ...styles.heading, color }}>{children}</Text>;
}

/**
 * Paragraph component
 */
export interface ParagraphProps {
  children: React.ReactNode;
}

export function Paragraph({ children }: ParagraphProps) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

/**
 * Info box component for highlighted information
 */
export interface InfoBoxProps {
  children: React.ReactNode;
  borderColor?: string;
}

export function InfoBox({ children, borderColor = '#335E99' }: InfoBoxProps) {
  return (
    <Section style={{ ...styles.infoBox, borderLeftColor: borderColor }}>
      {children}
    </Section>
  );
}

/**
 * Shared styles
 */
const styles = {
  body: {
    backgroundColor: '#f9fafb',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    margin: 0,
    padding: 0,
  },
  container: {
    backgroundColor: '#ffffff',
    margin: '40px auto',
    padding: '0',
    maxWidth: '600px',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
  },
  header: {
    backgroundColor: '#ffffff',
    padding: '24px 32px',
    textAlign: 'center' as const,
  },
  logo: {
    margin: '0 auto',
  },
  logoText: {
    fontSize: '24px',
    fontWeight: '700',
    margin: 0,
  },
  divider: {
    borderWidth: '2px',
    borderStyle: 'solid',
    margin: 0,
  },
  content: {
    padding: '32px',
  },
  heading: {
    fontSize: '24px',
    fontWeight: '600',
    lineHeight: '32px',
    margin: '0 0 16px 0',
  },
  paragraph: {
    fontSize: '16px',
    lineHeight: '26px',
    color: '#4b5563',
    margin: '0 0 16px 0',
  },
  button: {
    borderRadius: '6px',
    color: '#ffffff',
    display: 'inline-block',
    fontSize: '16px',
    fontWeight: '600',
    lineHeight: '100%',
    padding: '14px 28px',
    textDecoration: 'none',
    textAlign: 'center' as const,
  },
  infoBox: {
    backgroundColor: '#f3f4f6',
    borderRadius: '6px',
    borderLeftWidth: '4px',
    borderLeftStyle: 'solid' as const,
    padding: '16px 20px',
    margin: '24px 0',
  },
  footerDivider: {
    borderColor: '#e5e7eb',
    borderWidth: '1px',
    margin: '0',
  },
  footer: {
    backgroundColor: '#f9fafb',
    padding: '24px 32px',
    textAlign: 'center' as const,
  },
  footerText: {
    color: '#9ca3af',
    fontSize: '12px',
    lineHeight: '18px',
    margin: '0 0 8px 0',
  },
  unsubscribe: {
    margin: '16px 0 0 0',
  },
  unsubscribeLink: {
    color: '#6b7280',
    fontSize: '12px',
    textDecoration: 'underline',
  },
} as const;

export { styles };
