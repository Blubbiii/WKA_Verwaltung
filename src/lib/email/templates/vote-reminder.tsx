/**
 * Vote Reminder Email Template
 *
 * Sent to shareholders to remind them about an upcoming vote deadline.
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
import type { VoteReminderEmailProps } from '../types';

export function VoteReminderEmail({
  shareholderName,
  voteName,
  voteDescription,
  deadline,
  voteUrl,
  tenantName,
  appName,
  tenantLogoUrl,
  primaryColor = '#3b82f6',
  currentYear = new Date().getFullYear(),
  unsubscribeUrl,
}: VoteReminderEmailProps) {
  const brandName = appName || 'WindparkManager';
  const preview = `Erinnerung: Abstimmung "${voteName}" endet bald`;

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
      <Heading>Erinnerung: Abstimmung</Heading>

      <Paragraph>Hallo {shareholderName},</Paragraph>

      <Paragraph>
        wir möchten Sie daran erinnern, dass die Abstimmung{' '}
        <strong>{voteName}</strong> bald endet. Bitte geben Sie Ihre Stimme
        rechtzeitig ab.
      </Paragraph>

      <InfoBox borderColor="#f59e0b">
        <Text style={infoLabelStyle}>Abstimmung:</Text>
        <Text style={infoValueStyle}>{voteName}</Text>
        {voteDescription && (
          <>
            <Text style={{ ...infoLabelStyle, marginTop: '8px' }}>
              Beschreibung:
            </Text>
            <Text style={infoValueStyle}>{voteDescription}</Text>
          </>
        )}
        <Text style={{ ...infoLabelStyle, marginTop: '8px' }}>
          Frist:
        </Text>
        <Text style={{ ...infoValueStyle, color: '#dc2626', fontWeight: '700' }}>
          {deadline}
        </Text>
      </InfoBox>

      <Section style={{ textAlign: 'center', margin: '32px 0' }}>
        <Button href={voteUrl} color={primaryColor}>
          Jetzt abstimmen
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

export default VoteReminderEmail;
