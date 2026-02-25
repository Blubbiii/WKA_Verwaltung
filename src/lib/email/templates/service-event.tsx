/**
 * Service Event Email Template
 *
 * Sent to admins when SCADA anomalies are detected or service events occur.
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
import type { ServiceEventEmailProps } from '../types';

export function ServiceEventEmail({
  title,
  message,
  anomalyCount,
  criticalCount,
  warningCount,
  link,
  tenantName,
  appName,
  tenantLogoUrl,
  primaryColor = '#335E99',
  currentYear = new Date().getFullYear(),
  unsubscribeUrl,
}: ServiceEventEmailProps) {
  const brandName = appName || 'WindparkManager';
  const hasCritical = (criticalCount ?? 0) > 0;
  const accentColor = hasCritical ? '#dc2626' : '#f59e0b';
  const preview = `Service-Meldung: ${title}`;

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
      <Heading color={hasCritical ? '#dc2626' : undefined}>
        Service-Meldung
      </Heading>

      <InfoBox borderColor={accentColor}>
        <Text style={titleStyle}>{title}</Text>
        {message && <Text style={messageStyle}>{message}</Text>}
      </InfoBox>

      {(anomalyCount != null || criticalCount != null || warningCount != null) && (
        <Section style={statsContainerStyle}>
          {anomalyCount != null && (
            <Text style={statStyle}>
              Anomalien gesamt: <strong>{anomalyCount}</strong>
            </Text>
          )}
          {criticalCount != null && criticalCount > 0 && (
            <Text style={{ ...statStyle, color: '#dc2626' }}>
              Kritisch: <strong>{criticalCount}</strong>
            </Text>
          )}
          {warningCount != null && warningCount > 0 && (
            <Text style={{ ...statStyle, color: '#f59e0b' }}>
              Warnungen: <strong>{warningCount}</strong>
            </Text>
          )}
        </Section>
      )}

      {link && (
        <Section style={{ textAlign: 'center', margin: '32px 0' }}>
          <Button href={link} color={primaryColor}>
            Details ansehen
          </Button>
        </Section>
      )}

      <Paragraph>
        Diese Meldung wurde automatisch vom {brandName} System generiert.
      </Paragraph>
    </BaseLayout>
  );
}

const titleStyle = {
  fontSize: '16px',
  color: '#111827',
  margin: '0',
  fontWeight: '700' as const,
};

const messageStyle = {
  fontSize: '14px',
  color: '#4b5563',
  margin: '8px 0 0 0',
  lineHeight: '22px',
};

const statsContainerStyle = {
  margin: '24px 0',
  padding: '16px',
  backgroundColor: '#f9fafb',
  borderRadius: '6px',
};

const statStyle = {
  fontSize: '14px',
  color: '#374151',
  margin: '0 0 4px 0',
};

export default ServiceEventEmail;
