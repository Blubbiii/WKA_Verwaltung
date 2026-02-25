/**
 * Vote Result Email Template
 *
 * Sent to shareholders when a vote has been completed and results are available.
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
import type { VoteResultEmailProps } from '../types';

export function VoteResultEmail({
  shareholderName,
  voteName,
  result,
  resultUrl,
  tenantName,
  appName,
  tenantLogoUrl,
  primaryColor = '#335E99',
  currentYear = new Date().getFullYear(),
  unsubscribeUrl,
}: VoteResultEmailProps) {
  const brandName = appName || 'WindparkManager';
  const preview = `Abstimmungsergebnis: ${voteName}`;

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
      <Heading>Abstimmungsergebnis</Heading>

      <Paragraph>Hallo {shareholderName},</Paragraph>

      <Paragraph>
        die Abstimmung <strong>{voteName}</strong> wurde abgeschlossen.
        Nachfolgend finden Sie das Ergebnis.
      </Paragraph>

      <InfoBox borderColor={primaryColor}>
        <Text style={infoLabelStyle}>Abstimmung:</Text>
        <Text style={infoValueStyle}>{voteName}</Text>
        <Text style={{ ...infoLabelStyle, marginTop: '8px' }}>Ergebnis:</Text>
        <Text style={{ ...infoValueStyle, fontSize: '16px' }}>{result}</Text>
      </InfoBox>

      <Section style={{ textAlign: 'center', margin: '32px 0' }}>
        <Button href={resultUrl} color={primaryColor}>
          Details ansehen
        </Button>
      </Section>

      <Paragraph>
        Mit freundlichen Gruessen,
        <br />
        Ihr {brandName} Team
      </Paragraph>
    </BaseLayout>
  );
}

const infoLabelStyle = {
  fontSize: '13px',
  color: '#6b7280',
  margin: '0',
};

const infoValueStyle = {
  fontSize: '15px',
  color: '#111827',
  margin: '4px 0 0 0',
  fontWeight: '600' as const,
};

export default VoteResultEmail;
