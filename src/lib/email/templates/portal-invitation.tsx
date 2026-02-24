/**
 * Portal Invitation Email Template
 *
 * Sent to shareholders when a portal user account is created for them.
 * Contains their login credentials (email + temporary password).
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
import type { PortalInvitationEmailProps } from '../types';

export function PortalInvitationEmail({
  userName,
  email,
  temporaryPassword,
  loginUrl,
  tenantName,
  appName,
  tenantLogoUrl,
  primaryColor = '#3b82f6',
  currentYear = new Date().getFullYear(),
  unsubscribeUrl,
}: PortalInvitationEmailProps) {
  const brandName = appName || 'WindparkManager';
  const preview = `Ihr Portal-Zugang bei ${tenantName} wurde eingerichtet`;

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
      <Heading>Ihr Portal-Zugang</Heading>

      <Paragraph>Hallo {userName},</Paragraph>

      <Paragraph>
        für Sie wurde ein Zugang zum Gesellschafter-Portal von {tenantName}{' '}
        eingerichtet. Sie können sich ab sofort mit den folgenden Zugangsdaten
        anmelden.
      </Paragraph>

      <InfoBox borderColor={primaryColor}>
        <Text style={credentialLabelStyle}>E-Mail-Adresse:</Text>
        <Text style={credentialValueStyle}>{email}</Text>
        <Text style={{ ...credentialLabelStyle, marginTop: '12px' }}>
          Temporaeres Passwort:
        </Text>
        <Text style={credentialValueStyle}>{temporaryPassword}</Text>
      </InfoBox>

      <Section style={warningBoxStyle}>
        <Text style={warningTextStyle}>
          <strong>Wichtig:</strong> Bitte aendern Sie Ihr Passwort nach der
          ersten Anmeldung. Das temporaere Passwort sollte nicht dauerhaft
          verwendet werden.
        </Text>
      </Section>

      <Section style={{ textAlign: 'center', margin: '32px 0' }}>
        <Button href={loginUrl} color={primaryColor}>
          Jetzt anmelden
        </Button>
      </Section>

      <Paragraph>
        Im Portal können Sie Ihre Beteiligungen einsehen, an Abstimmungen
        teilnehmen und auf wichtige Dokumente zugreifen.
      </Paragraph>

      <Paragraph>
        Falls Sie Fragen haben oder Unterstützung benoetigen, können Sie uns
        jederzeit kontaktieren.
      </Paragraph>

      <Paragraph>
        Mit freundlichen Gruessen,
        <br />
        Ihr {brandName} Team
      </Paragraph>

      <Section style={securityNoteStyle}>
        <Text style={securityTextStyle}>
          <strong>Sicherheitshinweis:</strong> Falls Sie diese E-Mail nicht
          erwartet haben oder keinen Zugang beantragt haben, ignorieren Sie
          diese Nachricht bitte oder kontaktieren Sie uns.
        </Text>
      </Section>
    </BaseLayout>
  );
}

const credentialLabelStyle = {
  fontSize: '13px',
  color: '#6b7280',
  margin: '0',
  fontWeight: '600' as const,
};

const credentialValueStyle = {
  fontSize: '16px',
  color: '#111827',
  margin: '4px 0 0 0',
  fontFamily: 'monospace',
  fontWeight: '700' as const,
};

const warningBoxStyle = {
  marginTop: '24px',
  padding: '16px',
  backgroundColor: '#fef3c7',
  borderRadius: '6px',
};

const warningTextStyle = {
  fontSize: '14px',
  color: '#92400e',
  margin: 0,
};

const securityNoteStyle = {
  marginTop: '32px',
  padding: '16px',
  backgroundColor: '#fef3c7',
  borderRadius: '6px',
};

const securityTextStyle = {
  fontSize: '12px',
  color: '#92400e',
  margin: 0,
};

export default PortalInvitationEmail;
