/**
 * News Announcement Email Template
 *
 * Sent to users when a new news article/announcement is published.
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
import type { NewsAnnouncementEmailProps } from '../types';

export function NewsAnnouncementEmail({
  recipientName,
  newsTitle,
  newsExcerpt,
  newsUrl,
  publishedAt,
  tenantName,
  appName,
  tenantLogoUrl,
  primaryColor = '#3b82f6',
  currentYear = new Date().getFullYear(),
  unsubscribeUrl,
}: NewsAnnouncementEmailProps) {
  const brandName = appName || 'WindparkManager';
  const preview = `Neue Meldung: ${newsTitle}`;

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
      <Heading>Neue Meldung</Heading>

      <Paragraph>Hallo {recipientName},</Paragraph>

      <Paragraph>
        es gibt eine neue Meldung von {tenantName}.
      </Paragraph>

      <InfoBox borderColor={primaryColor}>
        <Text style={titleStyle}>{newsTitle}</Text>
        {publishedAt && (
          <Text style={dateStyle}>{publishedAt}</Text>
        )}
        {newsExcerpt && (
          <Text style={excerptStyle}>{newsExcerpt}</Text>
        )}
      </InfoBox>

      <Section style={{ textAlign: 'center', margin: '32px 0' }}>
        <Button href={newsUrl} color={primaryColor}>
          Weiterlesen
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

const titleStyle = {
  fontSize: '16px',
  color: '#111827',
  margin: '0',
  fontWeight: '700' as const,
};

const dateStyle = {
  fontSize: '13px',
  color: '#6b7280',
  margin: '4px 0 8px 0',
};

const excerptStyle = {
  fontSize: '14px',
  color: '#4b5563',
  margin: '0',
  lineHeight: '22px',
};

export default NewsAnnouncementEmail;
