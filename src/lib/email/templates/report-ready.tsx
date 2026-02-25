/**
 * Report Ready Email Template
 *
 * Sent to recipients when a scheduled report has been generated.
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
import type { ReportReadyEmailProps } from '../types';

export function ReportReadyEmail({
  reportName,
  reportTitle,
  generatedAt,
  downloadUrl,
  tenantName,
  appName,
  tenantLogoUrl,
  primaryColor = '#335E99',
  currentYear = new Date().getFullYear(),
  unsubscribeUrl,
}: ReportReadyEmailProps) {
  const brandName = appName || 'WindparkManager';
  const preview = `Bericht "${reportName}" ist bereit`;

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
      <Heading>Bericht erstellt</Heading>

      <Paragraph>
        der geplante Bericht wurde erfolgreich generiert und steht zum Download
        bereit.
      </Paragraph>

      <InfoBox borderColor={primaryColor}>
        <Text style={infoLabelStyle}>Bericht:</Text>
        <Text style={infoValueStyle}>{reportName}</Text>
        {reportTitle && (
          <>
            <Text style={{ ...infoLabelStyle, marginTop: '8px' }}>Titel:</Text>
            <Text style={infoValueStyle}>{reportTitle}</Text>
          </>
        )}
        {generatedAt && (
          <>
            <Text style={{ ...infoLabelStyle, marginTop: '8px' }}>
              Erstellt am:
            </Text>
            <Text style={infoValueStyle}>{generatedAt}</Text>
          </>
        )}
      </InfoBox>

      <Section style={{ textAlign: 'center', margin: '32px 0' }}>
        <Button href={downloadUrl} color={primaryColor}>
          Bericht herunterladen
        </Button>
      </Section>

      <Paragraph>
        Dieser Bericht wurde automatisch vom {brandName} System generiert.
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

export default ReportReadyEmail;
