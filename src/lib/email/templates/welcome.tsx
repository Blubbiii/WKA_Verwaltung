/**
 * Welcome Email Template
 *
 * Sent to new users when they are registered in the system.
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
import type { WelcomeEmailProps } from '../types';

export function WelcomeEmail({
  userName,
  loginUrl,
  tenantName,
  appName,
  tenantLogoUrl,
  primaryColor = '#335E99',
  currentYear = new Date().getFullYear(),
  unsubscribeUrl,
}: WelcomeEmailProps) {
  const brandName = appName || 'WindparkManager';
  const preview = `Willkommen bei ${brandName} - Ihr Zugang ist eingerichtet`;

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
      <Heading>Willkommen bei {brandName}!</Heading>

      <Paragraph>Hallo {userName},</Paragraph>

      <Paragraph>
        wir freuen uns, Sie als neuen Benutzer bei {tenantName} begruessen zu
        duerfen. Ihr Zugang wurde erfolgreich eingerichtet und Sie können sich
        ab sofort in unserem Portal anmelden.
      </Paragraph>

      <InfoBox borderColor={primaryColor}>
        <Text style={infoTextStyle}>
          <strong>Ihre Vorteile im WindparkManager-Portal:</strong>
        </Text>
        <Text style={infoListStyle}>
          - Einsicht in Ihre Beteiligungen und Dokumente{'\n'}
          - Teilnahme an Abstimmungen{'\n'}
          - Zugriff auf aktuelle Berichte und Mitteilungen{'\n'}
          - Übersicht Ihrer Abrechnungen
        </Text>
      </InfoBox>

      <Section style={{ textAlign: 'center', margin: '32px 0' }}>
        <Button href={loginUrl} color={primaryColor}>
          Jetzt anmelden
        </Button>
      </Section>

      <Paragraph>
        Falls Sie Fragen haben oder Unterstützung benoetigen, können Sie uns
        jederzeit kontaktieren. Wir helfen Ihnen gerne weiter.
      </Paragraph>

      <Paragraph>
        Mit freundlichen Gruessen,
        <br />
        Ihr {brandName} Team
      </Paragraph>

      <Section style={securityNoteStyle}>
        <Text style={securityTextStyle}>
          <strong>Sicherheitshinweis:</strong> Falls Sie diese E-Mail nicht
          erwartet haben oder keinen Zugang beantragt haben, ignorieren Sie diese
          Nachricht bitte oder kontaktieren Sie uns.
        </Text>
      </Section>
    </BaseLayout>
  );
}

const infoTextStyle = {
  fontSize: '14px',
  color: '#374151',
  margin: '0 0 8px 0',
};

const infoListStyle = {
  fontSize: '14px',
  color: '#4b5563',
  margin: '0',
  whiteSpace: 'pre-line' as const,
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

export default WelcomeEmail;
