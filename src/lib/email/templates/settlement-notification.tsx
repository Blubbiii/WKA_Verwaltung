/**
 * Settlement Notification Email Template
 *
 * Sent to shareholders/admins when a lease settlement has been processed.
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
import type { SettlementNotificationEmailProps } from '../types';

export function SettlementNotificationEmail({
  recipientName,
  settlementPeriod,
  parkName,
  totalAmount,
  settlementUrl,
  tenantName,
  appName,
  tenantLogoUrl,
  primaryColor = '#3b82f6',
  currentYear = new Date().getFullYear(),
  unsubscribeUrl,
}: SettlementNotificationEmailProps) {
  const brandName = appName || 'WindparkManager';
  const preview = `Pachtabrechnung ${settlementPeriod} - ${parkName}`;

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
      <Heading>Pachtabrechnung</Heading>

      <Paragraph>Hallo {recipientName},</Paragraph>

      <Paragraph>
        eine neue Pachtabrechnung wurde erstellt und steht zur Einsicht bereit.
      </Paragraph>

      <InfoBox borderColor={primaryColor}>
        <Text style={infoLabelStyle}>Abrechnungszeitraum:</Text>
        <Text style={infoValueStyle}>{settlementPeriod}</Text>
        <Text style={{ ...infoLabelStyle, marginTop: '8px' }}>Windpark:</Text>
        <Text style={infoValueStyle}>{parkName}</Text>
        {totalAmount && (
          <>
            <Text style={{ ...infoLabelStyle, marginTop: '8px' }}>
              Gesamtbetrag:
            </Text>
            <Text style={{ ...infoValueStyle, fontSize: '16px' }}>
              {totalAmount}
            </Text>
          </>
        )}
      </InfoBox>

      <Section style={{ textAlign: 'center', margin: '32px 0' }}>
        <Button href={settlementUrl} color={primaryColor}>
          Abrechnung ansehen
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

export default SettlementNotificationEmail;
