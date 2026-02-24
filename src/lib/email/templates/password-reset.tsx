/**
 * Password Reset Email Template
 *
 * Sent to users when they request a password reset.
 */

import { Section, Text } from '@react-email/components';
import * as React from 'react';
import {
  BaseLayout,
  Button,
  Heading,
  Paragraph,
  InfoBox,
} from './base-layout';
import type { PasswordResetEmailProps } from '../types';

export function PasswordResetEmail({
  userName,
  resetUrl,
  expiresIn,
  tenantName,
  appName,
  tenantLogoUrl,
  primaryColor = '#3b82f6',
  currentYear = new Date().getFullYear(),
  unsubscribeUrl,
}: PasswordResetEmailProps) {
  const brandName = appName || 'WindparkManager';
  const preview = `Passwort zurücksetzen für ${brandName}`;

  return (
    <BaseLayout
      preview={preview}
      tenantName={tenantName}
      appName={brandName}
      tenantLogoUrl={tenantLogoUrl}
      primaryColor={primaryColor}
      currentYear={currentYear}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading>Passwort zurücksetzen</Heading>

      <Paragraph>Hallo {userName},</Paragraph>

      <Paragraph>
        Sie haben angefordert, Ihr Passwort für Ihren {tenantName}-Zugang
        zurückzusetzen. Klicken Sie auf den folgenden Button, um ein neues
        Passwort festzulegen:
      </Paragraph>

      <Section style={{ textAlign: 'center', margin: '32px 0' }}>
        <Button href={resetUrl} color={primaryColor}>
          Passwort zurücksetzen
        </Button>
      </Section>

      <InfoBox borderColor="#f59e0b">
        <Text style={warningTextStyle}>
          <strong>Wichtig:</strong> Dieser Link ist nur {expiresIn} gültig und
          kann nur einmal verwendet werden.
        </Text>
      </InfoBox>

      <Paragraph>
        Falls der Button nicht funktioniert, kopieren Sie bitte den folgenden
        Link in Ihren Browser:
      </Paragraph>

      <Section style={linkBoxStyle}>
        <Text style={linkTextStyle}>{resetUrl}</Text>
      </Section>

      <Section style={securityNoteStyle}>
        <Text style={securityTextStyle}>
          <strong>Sicherheitshinweis:</strong> Falls Sie diese Anfrage nicht
          gestellt haben, ignorieren Sie diese E-Mail bitte. Ihr Passwort bleibt
          unveraendert. Wenn Sie vermuten, dass jemand unbefugt auf Ihr Konto
          zugreifen möchte, kontaktieren Sie uns bitte umgehend.
        </Text>
      </Section>

      <Paragraph>
        Mit freundlichen Gruessen,
        <br />
        Ihr {brandName} Team
      </Paragraph>
    </BaseLayout>
  );
}

const warningTextStyle = {
  fontSize: '14px',
  color: '#92400e',
  margin: 0,
};

const linkBoxStyle = {
  backgroundColor: '#f3f4f6',
  padding: '12px 16px',
  borderRadius: '6px',
  margin: '16px 0',
};

const linkTextStyle = {
  fontSize: '12px',
  color: '#6b7280',
  wordBreak: 'break-all' as const,
  margin: 0,
};

const securityNoteStyle = {
  marginTop: '32px',
  padding: '16px',
  backgroundColor: '#fef2f2',
  borderRadius: '6px',
};

const securityTextStyle = {
  fontSize: '12px',
  color: '#991b1b',
  margin: 0,
};

export default PasswordResetEmail;
