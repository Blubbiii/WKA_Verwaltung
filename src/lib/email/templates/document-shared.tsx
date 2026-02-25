/**
 * Document Shared Email Template
 *
 * Sent to users when a document has been shared with them.
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
import type { DocumentSharedEmailProps } from '../types';

export function DocumentSharedEmail({
  recipientName,
  documentTitle,
  documentCategory,
  sharedBy,
  documentUrl,
  tenantName,
  appName,
  tenantLogoUrl,
  primaryColor = '#335E99',
  currentYear = new Date().getFullYear(),
  unsubscribeUrl,
}: DocumentSharedEmailProps) {
  const brandName = appName || 'WindparkManager';
  const preview = `Neues Dokument: ${documentTitle}`;

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
      <Heading>Neues Dokument</Heading>

      <Paragraph>Hallo {recipientName},</Paragraph>

      <Paragraph>
        ein neues Dokument wurde für Sie bereitgestellt.
      </Paragraph>

      <InfoBox borderColor={primaryColor}>
        <Text style={infoLabelStyle}>Dokument:</Text>
        <Text style={infoValueStyle}>{documentTitle}</Text>
        {documentCategory && (
          <>
            <Text style={{ ...infoLabelStyle, marginTop: '8px' }}>
              Kategorie:
            </Text>
            <Text style={infoValueStyle}>{documentCategory}</Text>
          </>
        )}
        {sharedBy && (
          <>
            <Text style={{ ...infoLabelStyle, marginTop: '8px' }}>
              Bereitgestellt von:
            </Text>
            <Text style={infoValueStyle}>{sharedBy}</Text>
          </>
        )}
      </InfoBox>

      <Section style={{ textAlign: 'center', margin: '32px 0' }}>
        <Button href={documentUrl} color={primaryColor}>
          Dokument ansehen
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

export default DocumentSharedEmail;
