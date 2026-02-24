/**
 * Tenant Admin Invitation Email Template
 *
 * Sent to the first admin user when a new tenant is created
 * with the "invitation" mode. Reuses the existing password
 * reset flow for account activation.
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
import type { TenantAdminInvitationEmailProps } from '../types';

export function TenantAdminInvitationEmail({
  userName,
  invitationUrl,
  expiresIn,
  tenantName,
  appName,
  tenantLogoUrl,
  primaryColor = '#3b82f6',
  currentYear = new Date().getFullYear(),
  unsubscribeUrl,
}: TenantAdminInvitationEmailProps) {
  const preview = `Sie wurden als Administrator für ${tenantName} eingeladen`;
  const brandName = appName || 'WindparkManager';

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
      <Heading>Einladung als Administrator</Heading>

      <Paragraph>Hallo {userName},</Paragraph>

      <Paragraph>
        Sie wurden als Administrator für <strong>{tenantName}</strong> im{' '}
        {brandName} eingerichtet. Bitte klicken Sie auf den folgenden
        Button, um Ihr Konto zu aktivieren und ein Passwort festzulegen:
      </Paragraph>

      <Section style={{ textAlign: 'center', margin: '32px 0' }}>
        <Button href={invitationUrl} color={primaryColor}>
          Konto aktivieren
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
        <Text style={linkTextStyle}>{invitationUrl}</Text>
      </Section>

      <Section style={securityNoteStyle}>
        <Text style={securityTextStyle}>
          <strong>Sicherheitshinweis:</strong> Falls Sie diese Einladung nicht
          erwartet haben, ignorieren Sie diese E-Mail bitte. Wenn Sie vermuten,
          dass jemand unbefugt auf Ihr Konto zugreifen möchte, kontaktieren
          Sie uns bitte umgehend.
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

export default TenantAdminInvitationEmail;
