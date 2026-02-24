/**
 * Vote Invitation Email Template
 *
 * Sent to shareholders when a new vote is opened.
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
import type { VoteInvitationEmailProps } from '../types';

export function VoteInvitationEmail({
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
}: VoteInvitationEmailProps) {
  const brandName = appName || 'WindparkManager';
  const preview = `Neue Abstimmung: ${voteName} - Ihre Stimme ist gefragt`;

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
      <Section style={bannerStyle}>
        <Text style={bannerTextStyle}>Neue Abstimmung</Text>
      </Section>

      <Heading>{voteName}</Heading>

      <Paragraph>Guten Tag {shareholderName},</Paragraph>

      <Paragraph>
        als Gesellschafter/in von {tenantName} möchten wir Sie zur Teilnahme an
        einer neuen Abstimmung einladen. Ihre Stimme ist wichtig für die
        Entscheidungsfindung.
      </Paragraph>

      <InfoBox borderColor={primaryColor}>
        <Text style={descriptionHeaderStyle}>Beschreibung:</Text>
        <Text style={descriptionTextStyle}>{voteDescription}</Text>
      </InfoBox>

      <Section style={deadlineBoxStyle}>
        <Text style={deadlineIconStyle}>&#9200;</Text>
        <Text style={deadlineLabelStyle}>Abstimmung endet am:</Text>
        <Text style={deadlineValueStyle}>{deadline}</Text>
      </Section>

      <Section style={{ textAlign: 'center', margin: '32px 0' }}>
        <Button href={voteUrl} color={primaryColor}>
          Jetzt abstimmen
        </Button>
      </Section>

      <Paragraph>
        Sie können Ihre Stimme bis zum Ende der Abstimmungsfrist abgeben. Nach
        Ablauf der Frist wird das Ergebnis ermittelt und Ihnen mitgeteilt.
      </Paragraph>

      <Section style={infoSectionStyle}>
        <Text style={infoHeaderStyle}>So funktioniert die Abstimmung:</Text>
        <Text style={infoListStyle}>
          1. Klicken Sie auf &quot;Jetzt abstimmen&quot;{'\n'}
          2. Melden Sie sich in Ihrem Portal an{'\n'}
          3. Lesen Sie die Abstimmungsunterlagen{'\n'}
          4. Geben Sie Ihre Stimme ab{'\n'}
          5. Sie erhalten eine Bestätigung
        </Text>
      </Section>

      <Section style={proxyNoteStyle}>
        <Text style={proxyNoteTextStyle}>
          <strong>Vollmacht:</strong> Falls Sie an der Abstimmung nicht
          teilnehmen können, haben Sie die Moeglichkeit, eine Vollmacht zu
          erteilen. Weitere Informationen finden Sie in Ihrem Portal.
        </Text>
      </Section>

      <Paragraph>
        Bei Fragen zur Abstimmung stehen wir Ihnen gerne zur Verfuegung.
      </Paragraph>

      <Paragraph>
        Mit freundlichen Gruessen,
        <br />
        Ihr {brandName} Team
      </Paragraph>
    </BaseLayout>
  );
}

const bannerStyle = {
  backgroundColor: '#3b82f6',
  borderRadius: '6px',
  padding: '8px 16px',
  marginBottom: '24px',
  textAlign: 'center' as const,
};

const bannerTextStyle = {
  color: '#ffffff',
  fontSize: '12px',
  fontWeight: '600' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
  margin: 0,
};

const descriptionHeaderStyle = {
  fontSize: '12px',
  color: '#6b7280',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  margin: '0 0 8px 0',
};

const descriptionTextStyle = {
  fontSize: '15px',
  color: '#1f2937',
  lineHeight: '24px',
  margin: 0,
};

const deadlineBoxStyle = {
  backgroundColor: '#fef3c7',
  borderRadius: '6px',
  padding: '16px 20px',
  margin: '24px 0',
  textAlign: 'center' as const,
};

const deadlineIconStyle = {
  fontSize: '24px',
  margin: '0 0 8px 0',
};

const deadlineLabelStyle = {
  fontSize: '12px',
  color: '#92400e',
  margin: '0 0 4px 0',
};

const deadlineValueStyle = {
  fontSize: '18px',
  color: '#78350f',
  fontWeight: '700' as const,
  margin: 0,
};

const infoSectionStyle = {
  backgroundColor: '#f3f4f6',
  borderRadius: '6px',
  padding: '16px 20px',
  margin: '24px 0',
};

const infoHeaderStyle = {
  fontSize: '14px',
  color: '#374151',
  fontWeight: '600' as const,
  margin: '0 0 12px 0',
};

const infoListStyle = {
  fontSize: '14px',
  color: '#4b5563',
  margin: 0,
  whiteSpace: 'pre-line' as const,
  lineHeight: '26px',
};

const proxyNoteStyle = {
  borderLeft: '3px solid #9ca3af',
  paddingLeft: '16px',
  margin: '24px 0',
};

const proxyNoteTextStyle = {
  fontSize: '13px',
  color: '#6b7280',
  margin: 0,
  lineHeight: '20px',
};

export default VoteInvitationEmail;
